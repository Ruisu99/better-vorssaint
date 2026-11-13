import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import type {
  ContactChannel,
  LeadPriority,
  LeadStatus,
  TargetTrack,
} from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeFindings,
} from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  listLeads,
  upsertLead,
} from "@/lib/workspace-data";

const VALID_PRIORITIES = new Set<LeadPriority>(["heiss", "warm", "kalt"]);
const VALID_STATUSES = new Set<LeadStatus>([
  "neu",
  "analysiert",
  "kontaktiert",
  "follow_up_faellig",
  "im_gespraech",
  "angebot",
  "gewonnen",
  "kein_interesse",
]);
const VALID_CHANNELS = new Set<ContactChannel>([
  "email",
  "brief",
  "video_audit",
  "telefon",
  "linkedin",
]);

function safeIsoOrNull(val: unknown): string | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const leads = await listLeads(auth.scopeKey);
  return NextResponse.json({ leads }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 32_768);
  } catch (err) {
    return errorResponse(err, 400);
  }

  const companyName = cleanStr(body.company_name, 160);
  if (!companyName) {
    return NextResponse.json(
      { error: "Unternehmensname ist erforderlich." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  await ensureWorkspaceSeeded(auth.scopeKey);

  const websiteUrl =
    typeof body.website_url === "string"
      ? sanitizeExternalHref(body.website_url.slice(0, 300)) ?? ""
      : "";

  const priority: LeadPriority = VALID_PRIORITIES.has(
    body.priority as LeadPriority,
  )
    ? (body.priority as LeadPriority)
    : "warm";
  const track: TargetTrack = body.target_track === "startup" ? "startup" : "kmu";
  const status: LeadStatus = VALID_STATUSES.has(body.status as LeadStatus)
    ? (body.status as LeadStatus)
    : "neu";
  const channel: ContactChannel = VALID_CHANNELS.has(
    body.contact_channel as ContactChannel,
  )
    ? (body.contact_channel as ContactChannel)
    : "email";

  const created = await upsertLead({
    id: crypto.randomUUID(),
    owner_sub: auth.scopeKey,
    company_name: companyName,
    industry: cleanStr(body.industry, 100),
    target_track: track,
    city: cleanStr(body.city, 80),
    postal_address: cleanStr(body.postal_address, 220),
    website_url: websiteUrl,
    decision_maker: cleanStr(body.decision_maker, 120),
    contact_email: cleanStr(body.contact_email, 140),
    contact_phone: cleanStr(body.contact_phone, 50),
    source: cleanStr(body.source, 40) || "manuell",
    priority,
    status,
    contact_channel: channel,
    first_contact_at: safeIsoOrNull(body.first_contact_at),
    next_follow_up_at: safeIsoOrNull(body.next_follow_up_at),
    visual_checked_desktop: Boolean(body.visual_checked_desktop),
    visual_checked_mobile: Boolean(body.visual_checked_mobile),
    visual_notes: cleanStr(body.visual_notes, 1200),
    research_summary: cleanStr(body.research_summary, 1600),
    findings: sanitizeFindings(body.findings),
    // scan_data is only populated server-side by /api/scan or /api/radar
    scan_data: null,
    pitch_angle: cleanStr(body.pitch_angle, 800),
    is_sample: false,
  });

  return NextResponse.json(
    { lead: created },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}
