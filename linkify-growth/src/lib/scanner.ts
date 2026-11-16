import http from "node:http";
import https from "node:https";
import * as cheerio from "cheerio";
import type {
  CrawledPageExcerpt,
  LeadFinding,
  LeadPriority,
  LeadScanData,
  TargetTrack,
} from "./types";
import { resolveAndPinPublicUrl, type PinnedPublicTarget } from "./url-safety";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1_200_000;
const FETCH_TIMEOUT_MS = 8500;

function pinnedHttpGet(
  target: PinnedPublicTarget,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = target.url.protocol === "https:";
    const mod = isHttps ? https : http;
    const port =
      target.url.port !== ""
        ? Number.parseInt(target.url.port, 10)
        : isHttps
          ? 443
          : 80;
    const reqPath = `${target.url.pathname || "/"}${target.url.search || ""}`;

    const req = mod.request(
      {
        host: target.pinnedIp,
        port,
        path: reqPath,
        method: "GET",
        timeout: timeoutMs,
        lookup: (_hostname, _opts, cb) => {
          cb(null, target.pinnedIp, target.family);
        },
        ...(isHttps
          ? {
              servername: target.url.hostname,
              rejectUnauthorized: true,
            }
          : {}),
        headers: {
          Host: target.url.host,
          "User-Agent": "LinkifyAudit/1.0 (https://linkify.tech)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const headers = res.headers;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          resolve({ statusCode, headers, body: "" });
          return;
        }

        const contentType = String(headers["content-type"] ?? "").toLowerCase();
        if (
          contentType !== "" &&
          !contentType.includes("text/html") &&
          !contentType.includes("application/xhtml") &&
          !contentType.includes("text/plain")
        ) {
          res.destroy();
          reject(new Error(`Unerwarteter Inhaltstyp: ${contentType}`));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;

        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          const remaining = MAX_BODY_BYTES - total;
          if (remaining <= 0) {
            settled = true;
            res.destroy();
            resolve({
              statusCode,
              headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
            return;
          }
          const slice =
            chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
          chunks.push(slice);
          total += slice.length;
        });

        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });

        res.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Zeitüberschreitung beim Laden der Website."));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function safePublicFetch(
  rawUrl: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  html: string;
}> {
  let target = await resolveAndPinPublicUrl(rawUrl);
  const start = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await pinnedHttpGet(target, timeoutMs);
    const locationHeader = res.headers.location;

    if (res.statusCode >= 300 && res.statusCode < 400 && locationHeader) {
      if (hop === MAX_REDIRECTS) {
        throw new Error("Zu viele Weiterleitungen beim Laden der Website.");
      }
      const nextRaw = new URL(
        Array.isArray(locationHeader) ? locationHeader[0] : locationHeader,
        target.url,
      ).toString();
      target = await resolveAndPinPublicUrl(nextRaw);
      continue;
    }

    return {
      finalUrl: target.url.toString(),
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - start,
      html: res.body,
    };
  }

  throw new Error("Website konnte nicht geladen werden.");
}

function detectCms(html: string, generator: string): string {
  const lower = `${generator}\n${html.slice(0, 60_000)}`.toLowerCase();
  if (lower.includes("webflow") || lower.includes("data-wf-site")) return "Webflow";
  if (lower.includes("wp-content") || lower.includes("wordpress")) return "WordPress";
  if (lower.includes("jimdo")) return "Jimdo";
  if (lower.includes("wixstatic.com") || lower.includes("wix.com")) return "Wix";
  if (lower.includes("squarespace")) return "Squarespace";
  if (lower.includes("typo3")) return "TYPO3";
  if (lower.includes("joomla")) return "Joomla";
  if (lower.includes("shopify")) return "Shopify";
  if (
    lower.includes("ionos") ||
    lower.includes("1und1") ||
    lower.includes("website-builder")
  ) {
    return "IONOS / Baukasten";
  }
  if (lower.includes("__next") || lower.includes("/_next/")) {
    return "Next.js / React";
  }
  if (generator.trim()) return generator.trim().slice(0, 48);
  return "Unbekannt / Eigenentwicklung";
}

function detectOldestCopyrightYear(text: string): number | null {
  const matches = text.match(/(?:©|copyright)\s*(20[0-2]\d)/gi);
  if (!matches || matches.length === 0) return null;
  const years = matches
    .map((m) => Number.parseInt(m.replace(/\D/g, ""), 10))
    .filter((y) => y >= 2000 && y <= new Date().getFullYear() + 1);
  if (years.length === 0) return null;
  return Math.max(...years);
}

function extractDecisionMakerFromText(text: string): string {
  const patterns = [
    /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Praxisinhaber(?:in)?|Vertreten durch|Verantwortlich(?:er)?(?:\s+i\.S\.d\.)?)\s*:?\s*((?:Dr\.?\s*(?:med\.?\s*(?:dent\.?\s*)?)?|Dipl\.-\w+\s+|Prof\.?\s+)?[A-ZÄÖÜ][a-zäöüß-]{1,22}(?:\s+(?:von|van|de)?\s*[A-ZÄÖÜ][a-zäöüß-]{1,25}){1,2})/,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m?.[1]) {
      const candidate = m[1].replace(/\s+/g, " ").trim();
      if (
        candidate.length >= 5 &&
        candidate.length <= 75 &&
        !/gmbh|ug|ag|impressum|datenschutz|kontakt|straße|str\./i.test(candidate)
      ) {
        return candidate;
      }
    }
  }
  return "";
}

function extractAddressFromText(text: string): string {
  // Match German street + house number followed by 5-digit ZIP + city
  const rx =
    /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-\s]{2,42}(?:straße|strasse|str\.|weg|allee|ring|platz|gasse|chaussee|damm|ufer|berg|garten)\s+\d{1,4}[a-zA-Z]?(?:\s*[-–/]\s*\d{1,4}[a-zA-Z]?)?)\s*[,\n|·•]?\s*(\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\s]{2,32})/;
  const m = text.match(rx);
  if (m) {
    const street = m[1].replace(/\s+/g, " ").trim();
    const zipCity = m[2].replace(/\s+/g, " ").trim();
    return `${street}, ${zipCity}`.slice(0, 140);
  }
  return "";
}

function extractEmailsFromHtml($: cheerio.CheerioAPI, plainText: string): string[] {
  const mailtoEmails = $("a[href^='mailto:'], a[href^='MAILTO:']")
    .map((_, el) => ($(el).attr("href") ?? "").slice(7).split("?")[0].trim())
    .get();
  const regexEmails =
    plainText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return Array.from(
    new Set(
      [...mailtoEmails, ...regexEmails]
        .map((e) => e.trim().toLowerCase())
        .filter(
          (e) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) &&
            !e.endsWith(".png") &&
            !e.endsWith(".jpg") &&
            !e.endsWith(".webp") &&
            !e.includes("example."),
        ),
    ),
  ).slice(0, 4);
}

function extractPhonesFromHtml($: cheerio.CheerioAPI, plainText: string): string[] {
  const telLinks = $("a[href^='tel:'], a[href^='TEL:']")
    .map((_, el) => ($(el).attr("href") ?? "").slice(4).trim())
    .get();
  const regexPhones =
    plainText.match(
      /(?:Tel(?:efon)?\.?|Fon)?\s*:?\s*((?:\+49|0)[1-9]\d{1,4}[\s/·.\-()]+\d[\d\s/\-().]{4,16}\d)/gi,
    ) ?? [];
  const cleanedRegex = regexPhones.map((p) =>
    p.replace(/^(?:Tel(?:efon)?\.?|Fon)\s*:?\s*/i, "").trim(),
  );
  return Array.from(
    new Set(
      [...telLinks, ...cleanedRegex].filter(
        (p) => p.length >= 7 && p.length <= 28,
      ),
    ),
  ).slice(0, 4);
}

function extractVisibleTextClean($: cheerio.CheerioAPI): string {
  // Remove invisible / script / decorative DOM blocks to minimize extraction artifacts
  $(
    "script, style, noscript, svg, template, [aria-hidden='true'], [hidden]",
  ).remove();
  return $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageSpeedMobile(
  targetUrl: string,
): Promise<LeadScanData["pageSpeed"]> {
  try {
    const endpoint = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    endpoint.searchParams.set("url", targetUrl);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.append("category", "performance");
    endpoint.searchParams.append("category", "seo");
    endpoint.searchParams.append("category", "accessibility");

    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY?.trim();
    if (apiKey) {
      endpoint.searchParams.set("key", apiKey);
    }

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lighthouseResult?: {
        categories?: {
          performance?: { score?: number | null };
          seo?: { score?: number | null };
          accessibility?: { score?: number | null };
        };
        audits?: {
          "largest-contentful-paint"?: { displayValue?: string };
        };
      };
    };
    const cats = data.lighthouseResult?.categories;
    if (!cats) return null;
    const toPct = (s: number | null | undefined) =>
      typeof s === "number" ? Math.round(s * 100) : null;
    return {
      strategy: "mobile",
      performanceScore: toPct(cats.performance?.score),
      seoScore: toPct(cats.seo?.score),
      accessibilityScore: toPct(cats.accessibility?.score),
      lcpText:
        data.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue ??
        null,
    };
  } catch {
    return null;
  }
}

export function deriveFindingsFromScan(scan: LeadScanData): {
  findings: LeadFinding[];
  suggestedPriority: LeadPriority;
  suggestedTrack: TargetTrack;
  suggestedPitchAngle: string;
} {
  const findings: LeadFinding[] = [];
  let urgencyPoints = 0;

  if (!scan.httpsEnabled) {
    urgencyPoints += 3;
    findings.push({
      category: "technik",
      severity: "hoch",
      title: "Keine HTTPS-Verschlüsselung aktiv",
      evidence: `Finale URL läuft über ${scan.finalUrl.slice(0, 60)} ohne HTTPS.`,
      quote: scan.finalUrl,
      sourceUrl: scan.finalUrl,
      verification: "Beim direkten HTTPS-Abruf verifiziert.",
      verified: true,
    });
  }

  if (!scan.hasViewportMeta) {
    urgencyPoints += 3;
    findings.push({
      category: "mobile",
      severity: "hoch",
      title: "Kein Mobile-Viewport-Meta-Tag vorhanden",
      evidence:
        'Im HTML-Head fehlt <meta name="viewport"> – die Seite skaliert auf Smartphones wie eine Desktop-Ansicht.',
      sourceUrl: scan.finalUrl,
      verification: "Im HTML-Head der geladenen Startseite geprüft.",
      verified: true,
    });
  }

  // Detect real stale dated notices or literal template placeholders in visible text
  const allText = [
    scan.visibleSummary,
    ...(scan.crawledPages ?? []).map((p) => p.excerpt),
  ].join(" ");

  const staleNoticeMatch = allText.match(
    /(?:Corona|COVID-19|Lockdown|Schutzmaßnahmen|Geschäftsjahr\s+201\d|Geschäftsjahr\s+202[0-3]|Aktuelles[^.]{0,60}20(?:1\d|2[0-3])|Frohe Weihnachten\s+20(?:1\d|2[0-3]))[^.]{0,90}/i,
  );
  if (staleNoticeMatch) {
    urgencyPoints += 3;
    findings.push({
      category: "vertrauen",
      severity: "hoch",
      title: "Veraltete geschäftliche Meldung auf der Website sichtbar",
      evidence: `Sichtbarer Text nennt einen deutlich zurückliegenden Stand: "${staleNoticeMatch[0].trim()}"`,
      quote: staleNoticeMatch[0].trim().slice(0, 140),
      sourceUrl: scan.finalUrl,
      verification: "Als normaler statischer Fließtext auf der Seite sichtbar.",
      verified: true,
    });
  }

  const placeholderMatch = allText.match(
    /(?:Lorem ipsum dolor sit amet|\{\{[^}]{2,40}\}\}|Dieser Browser wird von uns nicht unterstützt|Website befindet sich im Aufbau|Hier entsteht unsere neue Website)/i,
  );
  if (placeholderMatch) {
    urgencyPoints += 3;
    findings.push({
      category: "ux",
      severity: "hoch",
      title: "Sichtbarer Platzhalter- oder Systemfehlertext auf der Website",
      evidence: `Direkt im sichtbaren Inhalt erscheint "${placeholderMatch[0].trim()}".`,
      quote: placeholderMatch[0].trim(),
      sourceUrl: scan.finalUrl,
      verification: "Im fertig geladenen Seitentext sichtbar.",
      verified: true,
    });
  }

  if (
    scan.detectedCms === "Jimdo" ||
    scan.detectedCms === "Wix" ||
    scan.detectedCms === "IONOS / Baukasten" ||
    scan.detectedCms === "Joomla"
  ) {
    urgencyPoints += 1;
    findings.push({
      category: "technik",
      severity: "hinweis",
      title: `Baukasten- oder älteres CMS erkannt (${scan.detectedCms})`,
      evidence: `Technische Signatur deutet auf ${scan.detectedCms} hin.`,
      sourceUrl: scan.finalUrl,
      verified: true,
    });
  }

  if (!scan.hasContactFormOrCta) {
    urgencyPoints += 2;
    findings.push({
      category: "ux",
      severity: "mittel",
      title: "Kein direkter Kontakt-Trigger auf der Startseite erkennbar",
      evidence:
        "Auf der Startseite wurden weder Kontaktformular noch direkte Kontaktlinks erkannt.",
      sourceUrl: scan.finalUrl,
      verified: true,
    });
  }

  if (scan.hasHiringSignal) {
    findings.push({
      category: "chance",
      severity: "hinweis",
      title: "Aktive Stellenangebote / Personalgewinnung erkannt",
      evidence:
        "Auf der Website gibt es konkrete Hinweise auf offene Stellen oder Karriere.",
      sourceUrl:
        scan.crawledPages?.find((p) => p.kind === "karriere")?.url ??
        scan.finalUrl,
      verified: true,
    });
  }

  if (scan.responseTimeMs > 2200) {
    urgencyPoints += 1;
    findings.push({
      category: "technik",
      severity: "mittel",
      title: `Spürbare Server-Antwortzeit (${scan.responseTimeMs} ms)`,
      evidence: `HTML-Abruf dauerte ${scan.responseTimeMs} ms (Status ${scan.statusCode}).`,
      sourceUrl: scan.finalUrl,
      verified: true,
    });
  }

  if (
    scan.pageSpeed?.performanceScore !== null &&
    scan.pageSpeed?.performanceScore !== undefined
  ) {
    if (scan.pageSpeed.performanceScore < 60) {
      urgencyPoints += 2;
      findings.push({
        category: "mobile",
        severity: "hoch",
        title: `Niedriger PageSpeed-Score Mobil (${scan.pageSpeed.performanceScore}/100)`,
        evidence: `Google PageSpeed Insights Mobil: Performance ${scan.pageSpeed.performanceScore}/100${scan.pageSpeed.lcpText ? `, LCP ${scan.pageSpeed.lcpText}` : ""}.`,
        sourceUrl: scan.finalUrl,
        verified: true,
      });
    }
  }

  const lowerAll =
    `${scan.title} ${scan.h1} ${scan.visibleSummary}`.toLowerCase();
  const isStartupHint =
    lowerAll.includes("saas") ||
    lowerAll.includes("plattform") ||
    lowerAll.includes("software") ||
    lowerAll.includes("api") ||
    lowerAll.includes("dashboard") ||
    lowerAll.includes("startup");

  const suggestedTrack: TargetTrack = isStartupHint ? "startup" : "kmu";
  const suggestedPriority: LeadPriority =
    urgencyPoints >= 4 ? "heiss" : urgencyPoints >= 2 ? "warm" : "kalt";

  const suggestedPitchAngle =
    suggestedTrack === "startup"
      ? "Individuelle Produkt- und Fullstack-Unterstützung (UX, Next.js/React, APIs, Kundenportal oder MVP-Weiterentwicklung)."
      : "Vollständiger Relaunch mit klarer Leistungsführung, moderner mobiler Nutzung und direktem Anfrage- sowie Bewerbungsweg.";

  return { findings, suggestedPriority, suggestedTrack, suggestedPitchAngle };
}

export async function scanWebsite(
  rawUrl: string,
  options: {
    includePageSpeed?: boolean;
    deepSubpages?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<{
  scan: LeadScanData;
  findings: LeadFinding[];
  suggestedPriority: LeadPriority;
  suggestedTrack: TargetTrack;
  suggestedPitchAngle: string;
}> {
  const reqTimeout = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const { finalUrl, statusCode, responseTimeMs, html } =
    await safePublicFetch(rawUrl, reqTimeout);

  const baseOrigin = new URL(finalUrl).origin;
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim().slice(0, 180);
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim().slice(0, 320) ?? "";
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim().slice(0, 180);
  const hasViewportMeta = $('meta[name="viewport"]').length > 0;
  const generator = $('meta[name="generator"]').attr("content")?.trim() ?? "";

  const links = $("a")
    .map((_, el) => ({
      href: ($(el).attr("href") ?? "").trim(),
      text: $(el).text().replace(/\s+/g, " ").trim().toLowerCase(),
    }))
    .get();

  const pickLink = (rx: RegExp) =>
    links.find((l) => rx.test(l.text) || rx.test(l.href.toLowerCase()));

  const imprintLink = pickLink(/impressum/);
  const privacyLink = pickLink(/datenschutz|privacy/);
  const servicesLink = pickLink(/leistung|angebot|behandlung|service|produkte|gewerke/);
  const aboutLink = pickLink(/unternehmen|über uns|ueber-uns|praxis|team|kanzlei/);
  const careerLink = pickLink(/karriere|jobs|stellen/);

  const hasImprintLink = Boolean(imprintLink);
  const hasPrivacyLink = Boolean(privacyLink);

  const bodyText = extractVisibleTextClean($);
  const extractedEmails = extractEmailsFromHtml($, bodyText);
  const extractedPhones = extractPhonesFromHtml($, bodyText);
  let decisionMakerHint = extractDecisionMakerFromText(bodyText);
  let extractedAddressHint = extractAddressFromText(bodyText);
  let hasHiringSignal =
    /\b(karriere|stellenangebote|wir suchen|mitarbeiter gesucht|offene stellen|ausbildungsplatz|m\/w\/d)\b/i.test(
      bodyText,
    ) || Boolean(careerLink);

  const hasContactFormOrCta =
    $("form").length > 0 ||
    extractedEmails.length > 0 ||
    extractedPhones.length > 0 ||
    links.some(
      (l) =>
        l.text.includes("kontakt") ||
        l.text.includes("anfrage") ||
        l.text.includes("termin"),
    );

  const crawledPages: CrawledPageExcerpt[] = [
    {
      url: finalUrl,
      kind: "start",
      title,
      excerpt: bodyText.slice(0, 2600),
    },
  ];

  let checkedPagesCount = 1;

  if (options.deepSubpages !== false) {
    const candidateSpecs: Array<{
      href: string | undefined;
      kind: CrawledPageExcerpt["kind"];
    }> = [
      { href: imprintLink?.href, kind: "impressum" },
      { href: servicesLink?.href ?? aboutLink?.href, kind: "leistungen" },
      { href: careerLink?.href ?? aboutLink?.href, kind: "karriere" },
    ];

    const seenUrls = new Set<string>([finalUrl]);
    const subTargets: Array<{ url: string; kind: CrawledPageExcerpt["kind"] }> =
      [];

    for (const spec of candidateSpecs) {
      if (!spec.href) continue;
      if (
        spec.href.startsWith("#") ||
        spec.href.startsWith("mailto:") ||
        spec.href.startsWith("tel:")
      ) {
        continue;
      }
      try {
        const resolved = new URL(spec.href, finalUrl);
        const abs = resolved.toString();
        if (resolved.origin === baseOrigin && !seenUrls.has(abs)) {
          seenUrls.add(abs);
          subTargets.push({ url: abs, kind: spec.kind });
        }
      } catch {
        // ignore invalid relative link
      }
      if (subTargets.length >= 3) break;
    }

    const subResults = await Promise.allSettled(
      subTargets.map(async (t) => ({
        kind: t.kind,
        res: await safePublicFetch(t.url, Math.min(reqTimeout, 4500)),
      })),
    );

    for (const outcome of subResults) {
      if (outcome.status !== "fulfilled") continue;
      const { kind, res: subRes } = outcome.value;
      checkedPagesCount += 1;
      const $sub = cheerio.load(subRes.html);
      const subTitle = $sub("title").first().text().trim().slice(0, 140);
      const subText = extractVisibleTextClean($sub);

      crawledPages.push({
        url: subRes.finalUrl,
        kind,
        title: subTitle,
        excerpt: subText.slice(0, 2200),
      });

      for (const em of extractEmailsFromHtml($sub, subText)) {
        if (!extractedEmails.includes(em) && extractedEmails.length < 4) {
          extractedEmails.push(em);
        }
      }
      for (const ph of extractPhonesFromHtml($sub, subText)) {
        if (!extractedPhones.includes(ph) && extractedPhones.length < 4) {
          extractedPhones.push(ph);
        }
      }
      if (!decisionMakerHint) {
        decisionMakerHint = extractDecisionMakerFromText(subText);
      }
      if (!extractedAddressHint) {
        extractedAddressHint = extractAddressFromText(subText);
      }
      if (
        !hasHiringSignal &&
        /\b(karriere|stellenangebote|wir suchen|mitarbeiter gesucht|offene stellen|ausbildungsplatz|m\/w\/d)\b/i.test(
          subText,
        )
      ) {
        hasHiringSignal = true;
      }
    }
  }

  const copyrightYear = detectOldestCopyrightYear(bodyText);
  const visibleSummary = bodyText.slice(0, 1600);
  const detectedCms = detectCms(html, generator);

  const pageSpeed = options.includePageSpeed
    ? await fetchPageSpeedMobile(finalUrl)
    : null;

  const scan: LeadScanData = {
    scannedAt: new Date().toISOString(),
    inputUrl: rawUrl,
    finalUrl,
    statusCode,
    responseTimeMs,
    httpsEnabled: finalUrl.startsWith("https://"),
    title,
    metaDescription,
    h1,
    hasViewportMeta,
    detectedCms,
    copyrightYear,
    hasImprintLink,
    hasPrivacyLink,
    hasContactFormOrCta,
    hasHiringSignal,
    checkedPagesCount,
    decisionMakerHint,
    extractedAddressHint,
    extractedEmails,
    extractedPhones,
    visibleSummary,
    crawledPages,
    pageSpeed,
  };

  const derived = deriveFindingsFromScan(scan);
  return { scan, ...derived };
}
