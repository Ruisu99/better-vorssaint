import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { HARD_MAX_BATCH_LEADS } from "@/lib/budget-guard";
import { searchLocalBusinesses, type RadarCategory } from "@/lib/radar";
import { scanWebsite } from "@/lib/scanner";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeRadarCandidates,
} from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  listLeads,
  upsertLead,
} from "@/lib/workspace-data";

const VALID_CATEGORIES = new Set<RadarCategory>([
  "alle",
  "handwerk",
  "gesundheit",
  "kanzlei",
  "auto",
  "bau",
]);

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 49_152);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const action = cleanStr(body.action, 40) || "search";

  // 0-EUR bulk technical pre-scan right inside Radar before importing or using AI tokens
  if (action === "prescan_candidates") {
    const items = sanitizeRadarCandidates(body.candidates, 8);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Keine Websites zum Vorcheck vorhanden." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const previews = await Promise.all(
      items.map(async (item) => {
        if (!item.websiteUrl) {
          return {
            osmId: item.osmId,
            ok: false,
            priority: "heiss" as const,
            cms: "Keine Website",
            httpsEnabled: false,
            hasViewport: false,
            responseTimeMs: 0,
            topFinding: "Keine Website hinterlegt",
          };
        }
        try {
          const res = await scanWebsite(item.websiteUrl, {
            includePageSpeed: false,
            deepSubpages: false,
          });
          return {
            osmId: item.osmId,
            ok: true,
            priority: res.suggestedPriority,
            cms: res.scan.detectedCms,
            httpsEnabled: res.scan.httpsEnabled,
            hasViewport: res.scan.hasViewportMeta,
            responseTimeMs: res.scan.responseTimeMs,
            topFinding: res.findings[0]?.title ?? "Basis-Check abgeschlossen",
            extractedEmail: res.scan.extractedEmails[0] ?? item.contactEmail,
            extractedPhone: res.scan.extractedPhones[0] ?? item.contactPhone,
          };
        } catch (err) {
          return {
            osmId: item.osmId,
            ok: false,
            priority: "warm" as const,
            cms: "Nicht erreichbar",
            httpsEnabled: false,
            hasViewport: false,
            responseTimeMs: 0,
            topFinding:
              err instanceof Error ? err.message : "Scan fehlgeschlagen",
          };
        }
      }),
    );

    return NextResponse.json({ previews }, { headers: PRIVATE_JSON_HEADERS });
  }

  if (action === "import_candidates") {
    const brand = await getBrandProfile(auth.scopeKey);
    const maxBatch = Math.min(
      Math.max(brand.budget_config.batchMaxLeads || HARD_MAX_BATCH_LEADS, 1),
      HARD_MAX_BATCH_LEADS,
    );
    const items = sanitizeRadarCandidates(body.candidates, maxBatch);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Keine Unternehmen zur Übernahme ausgewählt." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const imported = [];
    for (const item of items) {
      const safeSite = sanitizeExternalHref(item.websiteUrl) ?? "";
      let scanRes: Awaited<ReturnType<typeof scanWebsite>> | null = null;
      if (body.autoScanWebsites !== false && safeSite) {
        try {
          scanRes = await scanWebsite(safeSite, {
            includePageSpeed: false,
            deepSubpages: true,
          });
        } catch {
          scanRes = null;
        }
      }

      const lead = await upsertLead({
        id: crypto.randomUUID(),
        owner_sub: auth.scopeKey,
        company_name: item.companyName,
        industry: item.industry,
        target_track: scanRes?.suggestedTrack ?? "kmu",
        city: item.city,
        postal_address: item.postalAddress,
        website_url: scanRes?.scan.finalUrl ?? safeSite,
        decision_maker: scanRes?.scan.decisionMakerHint ?? "",
        contact_email:
          item.contactEmail || scanRes?.scan.extractedEmails[0] || "",
        contact_phone:
          item.contactPhone || scanRes?.scan.extractedPhones[0] || "",
        source: "radar_osm",
        priority: scanRes
          ? scanRes.suggestedPriority
          : safeSite
            ? "warm"
            : "heiss",
        status: scanRes ? "analysiert" : "neu",
        contact_channel: item.postalAddress ? "brief" : "email",
        first_contact_at: null,
        next_follow_up_at: null,
        visual_checked_desktop: false,
        visual_checked_mobile: false,
        visual_notes: "",
        research_summary: scanRes
          ? `${scanRes.scan.detectedCms} erkannt (${scanRes.scan.responseTimeMs} ms, ${scanRes.scan.checkedPagesCount ?? 1} Seiten geprüft). ${scanRes.findings[0]?.title ?? ""}`
          : safeSite
            ? "Aus lokalem Branchen-Radar übernommen – Website-Scan noch ausstehend."
            : "Im Branchen-Radar ohne hinterlegte Website gefunden – manuell prüfen, ob Bedarf für eine erste Website besteht.",
        findings: scanRes
          ? scanRes.findings
          : safeSite
            ? []
            : [
                {
                  category: "chance",
                  severity: "hinweis",
                  title: "Keine Website im OpenStreetMap-Eintrag hinterlegt",
                  evidence:
                    "Vor Kontaktaufnahme manuell prüfen, ob das Unternehmen bereits über eine Website verfügt.",
                  verified: true,
                },
              ],
        scan_data: scanRes?.scan ?? null,
        pitch_angle:
          scanRes?.suggestedPitchAngle ??
          "Direkte, professionelle Unternehmenswebsite ohne Agentur-Overhead.",
        is_sample: false,
      });
      imported.push(lead);
    }

    return NextResponse.json(
      { importedCount: imported.length, leads: imported },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const existingLeads = await listLeads(auth.scopeKey);
  const existingNames = new Set(
    existingLeads.map((l) => l.company_name.toLowerCase()),
  );
  const existingWebsites = new Set(
    existingLeads
      .map((l) =>
        l.website_url
          .replace(/^https?:\/\/(www\.)?/i, "")
          .replace(/\/.*$/, "")
          .toLowerCase(),
      )
      .filter(Boolean),
  );

  const category: RadarCategory = VALID_CATEGORIES.has(
    body.category as RadarCategory,
  )
    ? (body.category as RadarCategory)
    : "alle";

  try {
    const result = await searchLocalBusinesses({
      city: cleanStr(body.city, 80) || "Erfurt",
      category,
      keyword: cleanStr(body.keyword, 60) || undefined,
      onlyWithWebsite: Boolean(body.onlyWithWebsite),
      limit: Math.min(Math.max(Number(body.limit) || 20, 5), 35),
      existingNames,
      existingWebsites,
    });
    return NextResponse.json(result, { headers: PRIVATE_JSON_HEADERS });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Branchen-Suche fehlgeschlagen.";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: PRIVATE_JSON_HEADERS },
    );
  }
}
