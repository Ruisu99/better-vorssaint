import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import type {
  ContactChannel,
  Lead,
  LeadPriority,
  LeadStatus,
  TargetTrack,
} from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  ensureWorkspaceSeeded,
  listLeads,
  upsertLead,
} from "@/lib/workspace-data";

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const leads = await listLeads(auth.scopeKey);
  return NextResponse.json({ leads }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);

  let body: Partial<Lead>;
  try {
    body = (await request.json()) as Partial<Lead>;
  } catch {
    return NextResponse.json(
      { error: "Ungültige Eingabedaten." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const companyName = String(body.company_name ?? "").trim();
  if (!companyName) {
    return NextResponse.json(
      { error: "Unternehmensname ist erforderlich." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const websiteUrl = body.website_url
    ? sanitizeExternalHref(body.website_url) ?? ""
    : "";

  const priority: LeadPriority =
    body.priority === "heiss" || body.priority === "kalt"
      ? body.priority
      : "warm";
  const track: TargetTrack = body.target_track === "startup" ? "startup" : "kmu";
  const status: LeadStatus = body.status ?? "neu";
  const channel: ContactChannel = body.contact_channel ?? "email";

  const created = await upsertLead({
    id: crypto.randomUUID(),
    owner_sub: auth.scopeKey,
    company_name: companyName.slice(0, 160),
    industry: String(body.industry ?? "").trim().slice(0, 100),
    target_track: track,
    city: String(body.city ?? "").trim().slice(0, 80),
    postal_address: String(body.postal_address ?? "").trim().slice(0, 220),
    website_url: websiteUrl,
    decision_maker: String(body.decision_maker ?? "").trim().slice(0, 120),
    contact_email: String(body.contact_email ?? "").trim().slice(0, 140),
    contact_phone: String(body.contact_phone ?? "").trim().slice(0, 50),
    source: String(body.source ?? "manuell").slice(0, 40),
    priority,
    status,
    contact_channel: channel,
    first_contact_at: body.first_contact_at ?? null,
    next_follow_up_at: body.next_follow_up_at ?? null,
    visual_checked_desktop: Boolean(body.visual_checked_desktop),
    visual_checked_mobile: Boolean(body.visual_checked_mobile),
    visual_notes: String(body.visual_notes ?? "").slice(0, 1200),
    research_summary: String(body.research_summary ?? "").slice(0, 1600),
    findings: Array.isArray(body.findings) ? body.findings.slice(0, 12) : [],
    scan_data: body.scan_data ?? null,
    pitch_angle: String(body.pitch_angle ?? "").slice(0, 800),
    is_sample: false,
  });

  return NextResponse.json(
    { lead: created },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}
