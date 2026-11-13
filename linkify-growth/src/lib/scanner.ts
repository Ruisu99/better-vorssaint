import * as cheerio from "cheerio";
import type { LeadFinding, LeadPriority, LeadScanData, TargetTrack } from "./types";
import { assertSafePublicUrl } from "./url-safety";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8500;

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    return text.slice(0, MAX_BODY_BYTES);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BODY_BYTES - total;
      if (remaining <= 0) break;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(slice);
      total += slice.byteLength;
      if (total >= MAX_BODY_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

async function safePublicFetch(rawUrl: string): Promise<{
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  html: string;
}> {
  let current = await assertSafePublicUrl(rawUrl);
  const start = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "LinkifyAudit/1.0 (https://linkify.tech)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
      const location = response.headers.get("location") ?? "";
      await response.body?.cancel().catch(() => {});
      if (hop === MAX_REDIRECTS) {
        throw new Error("Zu viele Weiterleitungen beim Laden der Website.");
      }
      const nextUrl = new URL(location, current).toString();
      current = await assertSafePublicUrl(nextUrl);
      continue;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType !== "" &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Unerwarteter Inhaltstyp: ${contentType}`);
    }

    const html = await readLimitedText(response);
    return {
      finalUrl: current.toString(),
      statusCode: response.status,
      responseTimeMs: Date.now() - start,
      html,
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
  if (lower.includes("ionos") || lower.includes("1und1") || lower.includes("website-builder")) {
    return "IONOS / Baukasten";
  }
  if (lower.includes("__next") || lower.includes("/_next/")) return "Next.js / React";
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
      verified: true,
    });
  }

  if (!scan.hasViewportMeta) {
    urgencyPoints += 3;
    findings.push({
      category: "mobile",
      severity: "hoch",
      title: "Kein Mobile-Viewport-Meta-Tag gefunden",
      evidence:
        "Im HTML-Head fehlt <meta name=\"viewport\"> – deutet stark auf fehlende Mobil-Optimierung hin.",
      verified: true,
    });
  }

  if (
    scan.detectedCms === "Jimdo" ||
    scan.detectedCms === "Wix" ||
    scan.detectedCms === "IONOS / Baukasten" ||
    scan.detectedCms === "Joomla"
  ) {
    urgencyPoints += 2;
    findings.push({
      category: "technik",
      severity: "mittel",
      title: `Eingeschränktes oder älteres System erkannt (${scan.detectedCms})`,
      evidence: `Technische Signatur deutet auf ${scan.detectedCms} hin.`,
      verified: true,
    });
  }

  const currentYear = new Date().getFullYear();
  if (scan.copyrightYear !== null && scan.copyrightYear <= currentYear - 2) {
    urgencyPoints += 2;
    findings.push({
      category: "vertrauen",
      severity: "mittel",
      title: `Veralteter Copyright-Hinweis (${scan.copyrightYear})`,
      evidence: `Im Seitentext steht zuletzt das Jahr ${scan.copyrightYear}.`,
      verified: true,
    });
  }

  if (!scan.metaDescription) {
    urgencyPoints += 1;
    findings.push({
      category: "ux",
      severity: "hinweis",
      title: "Keine Meta-Description für Suchergebnisse hinterlegt",
      evidence: "Das <meta name=\"description\">-Tag fehlt oder ist leer.",
      verified: true,
    });
  }

  if (!scan.h1) {
    urgencyPoints += 1;
    findings.push({
      category: "ux",
      severity: "hinweis",
      title: "Keine klare H1-Hauptüberschrift erkannt",
      evidence: "Auf der Startseite wurde keine eindeutige <h1>-Überschrift gefunden.",
      verified: true,
    });
  }

  if (!scan.hasImprintLink || !scan.hasPrivacyLink) {
    urgencyPoints += 1;
    findings.push({
      category: "vertrauen",
      severity: "mittel",
      title: "Rechtliche Pflichtlinks auf Startseite unklar",
      evidence: `Impressum-Link: ${scan.hasImprintLink ? "gefunden" : "nicht erkannt"}, Datenschutz-Link: ${scan.hasPrivacyLink ? "gefunden" : "nicht erkannt"}.`,
      verified: true,
    });
  }

  if (!scan.hasContactFormOrCta) {
    urgencyPoints += 2;
    findings.push({
      category: "ux",
      severity: "mittel",
      title: "Kein direkter Kontakt-Trigger (Formular / mailto / tel) erkannt",
      evidence:
        "Auf der Startseite wurden weder Kontaktformular noch direkte Kontaktlinks erkannt.",
      verified: true,
    });
  }

  if (scan.responseTimeMs > 1800) {
    urgencyPoints += 1;
    findings.push({
      category: "technik",
      severity: "mittel",
      title: `Spürbare Server-Antwortzeit (${scan.responseTimeMs} ms)`,
      evidence: `HTML-Abruf dauerte ${scan.responseTimeMs} ms (Status ${scan.statusCode}).`,
      verified: true,
    });
  }

  if (scan.pageSpeed?.performanceScore !== null && scan.pageSpeed?.performanceScore !== undefined) {
    if (scan.pageSpeed.performanceScore < 60) {
      urgencyPoints += 2;
      findings.push({
        category: "mobile",
        severity: "hoch",
        title: `Niedriger PageSpeed-Score Mobil (${scan.pageSpeed.performanceScore}/100)`,
        evidence: `Google PageSpeed Insights Mobil: Performance ${scan.pageSpeed.performanceScore}/100${scan.pageSpeed.lcpText ? `, LCP ${scan.pageSpeed.lcpText}` : ""}.`,
        verified: true,
      });
    } else {
      findings.push({
        category: "mobile",
        severity: "hinweis",
        title: `PageSpeed Mobil gemessen (${scan.pageSpeed.performanceScore}/100)`,
        evidence: `Performance ${scan.pageSpeed.performanceScore}/100, SEO ${scan.pageSpeed.seoScore ?? "-"}/100.`,
        verified: true,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      category: "chance",
      severity: "hinweis",
      title: "Solide technische Basis – Positionierung & Conversion manuell prüfen",
      evidence: `HTTPS aktiv, Viewport vorhanden, Antwortzeit ${scan.responseTimeMs} ms (${scan.detectedCms}).`,
      verified: true,
    });
  }

  const lowerAll = `${scan.title} ${scan.h1} ${scan.visibleSummary}`.toLowerCase();
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
      : urgencyPoints >= 3
        ? "Vollständiger Website-Relaunch mit moderner mobiler Nutzerführung, sauberem CMS und direkter Anfrage-/Bewerbungsstrecke."
        : "Gezielte Neukonzeption für klarere Positionierung, Local SEO und einfachere Pflege – nach persönlichem Desktop- & Mobil-Check.";

  return { findings, suggestedPriority, suggestedTrack, suggestedPitchAngle };
}

export async function scanWebsite(
  rawUrl: string,
  options: { includePageSpeed?: boolean } = {},
): Promise<{
  scan: LeadScanData;
  findings: LeadFinding[];
  suggestedPriority: LeadPriority;
  suggestedTrack: TargetTrack;
  suggestedPitchAngle: string;
}> {
  const { finalUrl, statusCode, responseTimeMs, html } =
    await safePublicFetch(rawUrl);

  const $ = cheerio.load(html);
  const title = $("title").first().text().trim().slice(0, 180);
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim().slice(0, 320) ?? "";
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim().slice(0, 180);
  const hasViewportMeta = $('meta[name="viewport"]').length > 0;
  const generator =
    $('meta[name="generator"]').attr("content")?.trim() ?? "";

  const links = $("a")
    .map((_, el) => ({
      href: ($(el).attr("href") ?? "").trim(),
      text: $(el).text().replace(/\s+/g, " ").trim().toLowerCase(),
    }))
    .get();

  const hasImprintLink = links.some(
    (l) =>
      l.text.includes("impressum") || l.href.toLowerCase().includes("impressum"),
  );
  const hasPrivacyLink = links.some(
    (l) =>
      l.text.includes("datenschutz") ||
      l.href.toLowerCase().includes("datenschutz") ||
      l.href.toLowerCase().includes("privacy"),
  );

  const extractedEmails = Array.from(
    new Set(
      links
        .filter((l) => l.href.toLowerCase().startsWith("mailto:"))
        .map((l) => l.href.slice(7).split("?")[0].trim())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ).slice(0, 4);

  const extractedPhones = Array.from(
    new Set(
      links
        .filter((l) => l.href.toLowerCase().startsWith("tel:"))
        .map((l) => l.href.slice(4).trim())
        .filter((p) => p.length >= 6 && p.length <= 28),
    ),
  ).slice(0, 4);

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

  $("script, style, noscript, svg").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const copyrightYear = detectOldestCopyrightYear(bodyText);
  const visibleSummary = bodyText.slice(0, 1400);
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
    extractedEmails,
    extractedPhones,
    visibleSummary,
    pageSpeed,
  };

  const derived = deriveFindingsFromScan(scan);
  return { scan, ...derived };
}
