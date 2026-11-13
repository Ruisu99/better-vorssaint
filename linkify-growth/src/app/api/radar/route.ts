import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { searchLocalBusinesses, type RadarCategory } from "@/lib/radar";
import { scanWebsite } from "@/lib/scanner";
import type { RadarCandidate } from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  listLeads,
  upsertLead,
} from "@/lib/workspace-data";

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);

  let body: {
    action?: "search" | "import_candidates";
    city?: string;
    category?: RadarCategory;
    keyword?: string;
    onlyWithWebsite?: boolean;
    limit?: number;
    candidates?: RadarCandidate[];
    autoScanWebsites?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (body.action === "import_candidates") {
    const brand = await getBrandProfile(auth.scopeKey);
    const maxBatch = Math.min(Math.max(brand.budget_config.batchMaxLeads || 5, 1), 10);
    const items = (body.candidates ?? []).slice(0, maxBatch);
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
          scanRes = await scanWebsite(safeSite, { includePageSpeed: false });
        } catch {
          scanRes = null;
        }
      }

      const lead = await upsertLead({
        id: crypto.randomUUID(),
        owner_sub: auth.scopeKey,
        company_name: String(item.companyName).trim().slice(0, 160),
        industry: String(item.industry ?? "").trim().slice(0, 100),
        target_track: scanRes?.suggestedTrack ?? "kmu",
        city: String(item.city ?? "").trim().slice(0, 80),
        postal_address: String(item.postalAddress ?? "").trim().slice(0, 220),
        website_url: scanRes?.scan.finalUrl ?? safeSite,
        decision_maker: "",
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
          ? `${scanRes.scan.detectedCms} erkannt (${scanRes.scan.responseTimeMs} ms). ${scanRes.findings[0]?.title ?? ""}`
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

  try {
    const result = await searchLocalBusinesses({
      city: body.city ?? "Erfurt",
      category: body.category ?? "alle",
      keyword: body.keyword,
      onlyWithWebsite: body.onlyWithWebsite ?? false,
      limit: body.limit ?? 20,
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
