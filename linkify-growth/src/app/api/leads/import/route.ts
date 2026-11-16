import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { normalizeDomain } from "@/lib/notion-history";
import type { ContactChannel, LeadPriority, LeadStatus } from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import { cleanStr, errorResponse, parseSafeJsonBody } from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  listLeads,
  upsertLead,
} from "@/lib/workspace-data";

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const cleanText = csvText.replace(/^\uFEFF/, "");
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

function mapStatus(raw: string): LeadStatus {
  const s = raw.toLowerCase();
  if (s.includes("gewonnen")) return "gewonnen";
  if (s.includes("kein interesse")) return "kein_interesse";
  if (s.includes("angebot")) return "angebot";
  if (s.includes("gespräch")) return "im_gespraech";
  if (s.includes("follow")) return "follow_up_faellig";
  if (s.includes("kontaktiert")) return "kontaktiert";
  return "neu";
}

function mapPriority(raw: string): LeadPriority {
  const s = raw.toLowerCase();
  if (s.includes("heiß") || s.includes("heiss")) return "heiss";
  if (s.includes("kalt")) return "kalt";
  return "warm";
}

function mapChannel(raw: string): ContactChannel {
  const s = raw.toLowerCase();
  if (s.includes("brief")) return "brief";
  if (s.includes("video")) return "video_audit";
  if (s.includes("telefon")) return "telefon";
  if (s.includes("linkedin")) return "linkedin";
  return "email";
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 262_144);
  } catch (err) {
    return errorResponse(err, 400);
  }

  const csvText = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) {
    return NextResponse.json(
      { error: "Keine CSV-Daten übergeben." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const existing = await listLeads(auth.scopeKey);
  const existingDomains = new Set(
    existing
      .map((l) => (l.website_url ? normalizeDomain(l.website_url) : ""))
      .filter(Boolean),
  );
  const existingNames = new Set(
    existing.map((l) => l.company_name.toLowerCase()),
  );

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV enthält keine Datenzeilen." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());

  const idxName = col("name");
  if (idxName === -1) {
    return NextResponse.json(
      { error: "CSV-Spalte 'Name' fehlt." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const idxAddress = col("adresse");
  const idxIndustry = col("branche");
  const idxEmail = col("e-mail");
  const idxDecision = col("entscheider");
  const idxChannel = col("kontaktweg");
  const idxCity = col("ort");
  const idxScore = col("score");
  const idxStatus = col("status");
  const idxPhone = col("telefon");
  const idxVisual = col("visuell geprüft");
  const idxWebsite = col("website");

  let imported = 0;
  let skippedDuplicates = 0;

  for (const r of rows.slice(1, 200)) {
    const companyName = cleanStr(r[idxName] ?? "", 160);
    if (!companyName) continue;

    const websiteUrl =
      idxWebsite >= 0 ? sanitizeExternalHref(r[idxWebsite] ?? "") ?? "" : "";
    const dom = websiteUrl ? normalizeDomain(websiteUrl) : "";

    if (
      existingNames.has(companyName.toLowerCase()) ||
      (dom && existingDomains.has(dom))
    ) {
      skippedDuplicates += 1;
      continue;
    }

    existingNames.add(companyName.toLowerCase());
    if (dom) existingDomains.add(dom);

    const visualDone =
      idxVisual >= 0 && /^(yes|ja|true|1)$/i.test(r[idxVisual] ?? "");

    await upsertLead({
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      company_name: companyName,
      industry: idxIndustry >= 0 ? cleanStr(r[idxIndustry] ?? "", 100) : "",
      target_track: "kmu",
      city: idxCity >= 0 ? cleanStr(r[idxCity] ?? "", 80) : "",
      postal_address:
        idxAddress >= 0 ? cleanStr(r[idxAddress] ?? "", 220) : "",
      website_url: websiteUrl,
      decision_maker:
        idxDecision >= 0 ? cleanStr(r[idxDecision] ?? "", 120) : "",
      contact_email: idxEmail >= 0 ? cleanStr(r[idxEmail] ?? "", 140) : "",
      contact_phone: idxPhone >= 0 ? cleanStr(r[idxPhone] ?? "", 50) : "",
      source: "notion_csv_import",
      priority: idxScore >= 0 ? mapPriority(r[idxScore] ?? "") : "warm",
      status: idxStatus >= 0 ? mapStatus(r[idxStatus] ?? "") : "kontaktiert",
      contact_channel:
        idxChannel >= 0 ? mapChannel(r[idxChannel] ?? "") : "email",
      first_contact_at: null,
      next_follow_up_at: null,
      visual_checked_desktop: visualDone,
      visual_checked_mobile: visualDone,
      visual_notes: "",
      research_summary: "Aus bestehender Notion Lead-Pipeline importiert.",
      findings: [],
      buying_signals: [],
      score_reason: "",
      relaunch_benefit: "",
      follow_up_note: "",
      scan_data: null,
      pitch_angle: "",
      letter_printed_at: null,
      is_sample: false,
    });
    imported += 1;
  }

  return NextResponse.json(
    { ok: true, imported, skippedDuplicates },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}
