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

/**
 * Extracts clean line-separated visible text so adjacent HTML tags never concatenate words/emails/numbers.
 */
function extractVisibleTextClean(
  $: cheerio.CheerioAPI,
  stripNavigation = false,
): string {
  $(
    "script, style, noscript, svg, template, [aria-hidden='true'], [hidden]",
  ).remove();
  if (stripNavigation) {
    $("nav").remove();
  }
  $("br").replaceWith("\n");
  $(
    "p, div, li, td, th, tr, h1, h2, h3, h4, h5, h6, section, article, footer, header, address, dt, dd",
  ).after("\n");
  $("a, span, strong, b, em, label").after(" ");
  return $("body")
    .text()
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDecisionMakerFromText(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const labelPattern =
    /^(?:Geschäftsführer(?:in|innen|\/in)?|Geschäftsführung|Geschäftsleitung|Inhaber(?:in|\/in)?|Praxisinhaber(?:in)?|Kanzleiinhaber(?:in)?|Vertreten durch|Vertretungsberechtigt(?:e|er|e\(r\))?(?:[^:\n]{0,30})?|inhaltl\.?\s*Verantwortlich(?:er)?|Verantwortlich(?:er)?(?:\s+(?:für\s+den\s+Inhalt|i\.?\s*S\.?\s*d\.?)[^:]*)?)\s*:?\s*(.*)$/i;

  const namePattern =
    /((?:(?:Herr|Frau|Dr\.?\s*(?:med\.?\s*(?:dent\.?\s*)?)?|Prof\.?\s*(?:Dr\.?\s*)?|Dipl\.-[A-Za-zÄÖÜäöüß.]+\s+|RA\s+|StB\s+)?)[A-ZÄÖÜ][a-zäöüß-]{1,22}(?:\s+(?:von|van|de)?\s*[A-ZÄÖÜ][a-zäöüß-]{1,24}){0,3})/;

  const cleanCandidate = (raw: string): string => {
    const trimmed = raw
      .replace(/\b(?:Website|Telefon|Tel\.?|Fax|E-Mail|Mail|USt|Amtsgericht|Registergericht|HRB|HRA|Sitz|Rechtsform)\b[\s\S]*$/i, "")
      .replace(/[,;|].*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (
      trimmed.length >= 5 &&
      trimmed.length <= 72 &&
      !/^(?:geschäftsführer(?:in|innen)?|geschäftsführung|geschäftsleitung|inhaber(?:in)?|vorstand|prokurist(?:in)?|rechtsform|herr|frau)$/i.test(
        trimmed,
      ) &&
      !/\b(?:geschäftsführer|inhaber|rechtsform|handelsregister|umsatzsteuer|steuernummer|gmbh|ug|ag|ohg|kg|impressum|datenschutz|kontakt|straße|str\.|platz|weg|allee|ring|telefon|fax|email|website|internet|thüringen|erfurt|leipzig|deutschland)\b/i.test(
        trimmed,
      )
    ) {
      return trimmed;
    }
    return "";
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelPattern);
    if (m) {
      const sameLine = (m[1] ?? "")
        .replace(/^(?:Geschäftsführer(?:in|\/in)?|Inhaber(?:in|\/in)?)\s*:?\s*/i, "")
        .trim();
      if (sameLine) {
        const nm = sameLine.match(namePattern);
        if (nm?.[1]) {
          const cleaned = cleanCandidate(nm[1]);
          if (cleaned) return cleaned;
        }
      }
      // Check next 1-2 lines when HTML placed label and name in adjacent tags
      for (let offset = 1; offset <= 2 && i + offset < lines.length; offset++) {
        const nextLine = lines[i + offset];
        if (!nextLine || nextLine.length > 90) continue;
        const nm = nextLine.match(namePattern);
        if (nm?.[1]) {
          const cleaned = cleanCandidate(nm[1]);
          if (cleaned) return cleaned;
        }
      }
    }
  }

  // Fallback inline match across flat text
  const flat = text.replace(/\n+/g, " ");
  const inlineRx =
    /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Praxisinhaber(?:in)?|Vertreten durch)\s*:?\s*((?:Dr\.?\s*(?:med\.?\s*(?:dent\.?\s*)?)?|Prof\.?\s*)?[A-ZÄÖÜ][a-zäöüß-]{1,22}(?:\s+[A-ZÄÖÜ][a-zäöüß-]{1,24}){1,2})/;
  const inlineMatch = flat.match(inlineRx);
  if (inlineMatch?.[1]) {
    return cleanCandidate(inlineMatch[1]);
  }
  return "";
}

function extractAddressFromText(text: string): string {
  const flat = text.replace(/\n+/g, ", ").replace(/\s*,\s*/g, ", ");
  const rx =
    /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,44}?(?:[Ss]traße|[Ss]trasse|[Ss]tr\.|[Ww]eg|[Aa]llee|[Rr]ing|[Pp]latz|[Gg]asse|[Cc]haussee|[Dd]amm|[Uu]fer|[Bb]erg|[Gg]arten|[Mm]arkt)\s+\d{1,4}[a-zA-Z]?(?:\s*[-–/]\s*\d{1,4}[a-zA-Z]?)?)\s*[,|·•]+\s*(\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]{2,32})/;
  const m = flat.match(rx);
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
    plainText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/g) ?? [];
  return Array.from(
    new Set(
      [...mailtoEmails, ...regexEmails]
        .map((e) => e.trim().toLowerCase())
        .filter(
          (e) =>
            /^[^\s@]+@[^\s@]+\.[a-z]{2,8}$/.test(e) &&
            !e.endsWith(".png") &&
            !e.endsWith(".jpg") &&
            !e.endsWith(".webp") &&
            !e.endsWith(".svg") &&
            !e.includes("example."),
        ),
    ),
  ).slice(0, 4);
}

function extractPhonesFromHtml($: cheerio.CheerioAPI, plainText: string): string[] {
  const telLinks = $("a[href^='tel:'], a[href^='TEL:']")
    .map((_, el) => decodeURIComponent(($(el).attr("href") ?? "").slice(4)).trim())
    .get();
  const regexPhones =
    plainText.match(
      /(?:Tel(?:efon)?\.?|Fon)\s*:?\s*((?:\+49|0)[1-9]\d{1,4}[\s/·.\-()]+\d[\d\s/\-().]{4,16}\d)/gi,
    ) ?? [];
  const cleanedRegex = regexPhones.map((p) =>
    p.replace(/^(?:Tel(?:efon)?\.?|Fon)\s*:?\s*/i, "").trim(),
  );
  return Array.from(
    new Set(
      [...telLinks, ...cleanedRegex]
        .map((p) => p.replace(/^[:\s]+/, "").replace(/\s+/g, " ").trim())
        .filter((p) => p.length >= 7 && p.length <= 28),
    ),
  ).slice(0, 4);
}

function isSameWebsiteHost(a: URL, b: URL): boolean {
  const norm = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return norm(a.hostname) === norm(b.hostname);
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
      evidence: `Die Website läuft über ${scan.finalUrl.slice(0, 60)} ohne HTTPS.`,
      quote: scan.finalUrl,
      sourceUrl: scan.finalUrl,
      verification: "Beim direkten HTTPS-Abruf verifiziert.",
      verified: true,
    });
  }

  if (!scan.hasViewportMeta) {
    urgencyPoints += 2;
    findings.push({
      category: "mobile",
      severity: "mittel",
      title: "Fehlende Mobil-Anpassung der Darstellung",
      evidence:
        "Auf Mobilgeräten wird die Desktop-Ansicht verkleinert statt für Smartphones optimiert.",
      sourceUrl: scan.finalUrl,
      verification: "In der geladenen Startseite ohne Viewport-Definition geprüft.",
      verified: true,
    });
  }

  const allText = [
    scan.visibleSummary,
    ...(scan.crawledPages ?? []).map((p) => p.excerpt),
  ].join(" ");

  const staleNoticeMatch = allText.match(
    /(?:Corona|COVID-19|Lockdown|Schutzmaßnahmen|Geschäftsjahr\s+201\d|Geschäftsjahr\s+202[0-3]|Aktuelles[^.]{0,60}20(?:1\d|2[0-3])|Frohe Weihnachten\s+20(?:1\d|2[0-3]))[^.\n]{0,90}/i,
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

  const baseUrlObj = new URL(finalUrl);
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
    links.find((l) => rx.test(l.text)) ??
    links.find((l) => rx.test(l.href.toLowerCase()));

  const imprintLink =
    pickLink(/\bimpressum\b/i) ??
    pickLink(/impressum/i) ??
    pickLink(/rechtliches/i);
  const privacyLink = pickLink(/datenschutz|privacy/);
  const aboutLink = pickLink(
    /unternehmen|über uns|ueber-uns|praxis|team|kanzlei|wir über uns/,
  );
  const servicesLink = pickLink(
    /leistung|angebot|behandlung|service|produkte|gewerke|kompetenz/,
  );
  const careerLink = pickLink(/karriere|jobs|stellen|ausbildung/);

  const hasImprintLink = Boolean(imprintLink);
  const hasPrivacyLink = Boolean(privacyLink);

  const bodyText = extractVisibleTextClean($);
  const startEmails = extractEmailsFromHtml($, bodyText);
  const startPhones = extractPhonesFromHtml($, bodyText);
  const startDecisionMaker = extractDecisionMakerFromText(bodyText);
  const startAddress = extractAddressFromText(bodyText);

  let hasHiringSignal =
    /\b(karriere|stellenangebote|wir suchen|mitarbeiter gesucht|offene stellen|ausbildungsplatz|m\/w\/d)\b/i.test(
      bodyText,
    ) || Boolean(careerLink);

  const hasContactFormOrCta =
    $("form").length > 0 ||
    startEmails.length > 0 ||
    startPhones.length > 0 ||
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
  let imprintDecisionMaker = "";
  let imprintAddress = "";
  const imprintEmails: string[] = [];
  const imprintPhones: string[] = [];

  if (options.deepSubpages !== false) {
    const candidateSpecs: Array<{
      href: string | undefined;
      kind: CrawledPageExcerpt["kind"];
    }> = [
      {
        href: imprintLink?.href ?? "/impressum",
        kind: "impressum",
      },
      { href: aboutLink?.href, kind: "unternehmen" },
      { href: servicesLink?.href, kind: "leistungen" },
      { href: careerLink?.href, kind: "karriere" },
    ];

    const seenPaths = new Set<string>([
      `${baseUrlObj.hostname.replace(/^www\./, "")}${baseUrlObj.pathname}`,
    ]);
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
        if (!isSameWebsiteHost(resolved, baseUrlObj)) continue;
        // Prefer HTTPS when homepage is HTTPS so http:// footers still work cleanly
        if (baseUrlObj.protocol === "https:" && resolved.protocol === "http:") {
          resolved.protocol = "https:";
        }
        const normKey = `${resolved.hostname.replace(/^www\./, "")}${resolved.pathname}`;
        if (!seenPaths.has(normKey)) {
          seenPaths.add(normKey);
          subTargets.push({ url: resolved.toString(), kind: spec.kind });
        }
      } catch {
        // ignore invalid relative link
      }
      if (subTargets.length >= 4) break;
    }

    const subResults = await Promise.allSettled(
      subTargets.map(async (t) => ({
        kind: t.kind,
        res: await safePublicFetch(t.url, Math.min(reqTimeout, 4800)),
      })),
    );

    for (const outcome of subResults) {
      if (outcome.status !== "fulfilled") continue;
      const { kind, res: subRes } = outcome.value;
      if (subRes.statusCode >= 400) continue;
      checkedPagesCount += 1;
      const $sub = cheerio.load(subRes.html);
      const subTitle = $sub("title").first().text().trim().slice(0, 140);
      const subText = extractVisibleTextClean($sub, true);

      crawledPages.push({
        url: subRes.finalUrl,
        kind,
        title: subTitle,
        excerpt: subText.slice(0, 2600),
      });

      const subEmails = extractEmailsFromHtml($sub, subText);
      const subPhones = extractPhonesFromHtml($sub, subText);
      const subDm = extractDecisionMakerFromText(subText);
      const subAddr = extractAddressFromText(subText);

      if (kind === "impressum") {
        if (subDm) imprintDecisionMaker = subDm;
        if (subAddr) imprintAddress = subAddr;
        imprintEmails.push(...subEmails);
        imprintPhones.push(...subPhones);
      } else {
        if (!imprintDecisionMaker && subDm) imprintDecisionMaker = subDm;
        if (!imprintAddress && subAddr) imprintAddress = subAddr;
        for (const em of subEmails) {
          if (!startEmails.includes(em)) startEmails.push(em);
        }
        for (const ph of subPhones) {
          if (!startPhones.includes(ph)) startPhones.push(ph);
        }
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

  const extractedEmails = Array.from(
    new Set([...imprintEmails, ...startEmails]),
  ).slice(0, 4);
  const extractedPhones = Array.from(
    new Set([...imprintPhones, ...startPhones]),
  ).slice(0, 4);
  const decisionMakerHint = imprintDecisionMaker || startDecisionMaker;
  const extractedAddressHint = imprintAddress || startAddress;

  const copyrightYear = detectOldestCopyrightYear(bodyText);
  const visibleSummary = bodyText.slice(0, 1600);
  const detectedCms = detectCms(html, generator);

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
    pageSpeed: null,
  };

  const derived = deriveFindingsFromScan(scan);
  return { scan, ...derived };
}
