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
  assertSafeMutationRequest,
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeFindings,
} from "@/lib/validation";
import {
  deleteLead,
  ensureWorkspaceSeeded,
  getLeadById,
  listOutreachForLead,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const lead = await getLeadById(auth.scopeKey, id);
  if (!lead) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }
  const outreach = await listOutreachForLead(auth.scopeKey, id);
  return NextResponse.json(
    { lead, outreach },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let patch: Record<string, unknown>;
  try {
    patch = await parseSafeJsonBody(request, 32_768);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const { id } = await context.params;
  const existing = await getLeadById(auth.scopeKey, id);
  if (!existing) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const nextWebsite =
    typeof patch.website_url === "string"
      ? sanitizeExternalHref(patch.website_url.slice(0, 300)) ?? ""
      : existing.website_url;

  const nextPriority: LeadPriority = VALID_PRIORITIES.has(
    patch.priority as LeadPriority,
  )
    ? (patch.priority as LeadPriority)
    : existing.priority;
  const nextStatus: LeadStatus = VALID_STATUSES.has(patch.status as LeadStatus)
    ? (patch.status as LeadStatus)
    : existing.status;
  const nextChannel: ContactChannel = VALID_CHANNELS.has(
    patch.contact_channel as ContactChannel,
  )
    ? (patch.contact_channel as ContactChannel)
    : existing.contact_channel;
  const nextTrack: TargetTrack =
    patch.target_track === "startup" || patch.target_track === "kmu"
      ? patch.target_track
      : existing.target_track;

  const updated = await upsertLead({
    id: existing.id,
    owner_sub: auth.scopeKey,
    company_name:
      cleanStr(patch.company_name, 160) || existing.company_name,
    industry:
      patch.industry !== undefined
        ? cleanStr(patch.industry, 100)
        : existing.industry,
    target_track: nextTrack,
    city:
      patch.city !== undefined ? cleanStr(patch.city, 80) : existing.city,
    postal_address:
      patch.postal_address !== undefined
        ? cleanStr(patch.postal_address, 220)
        : existing.postal_address,
    website_url: nextWebsite,
    decision_maker:
      patch.decision_maker !== undefined
        ? cleanStr(patch.decision_maker, 120)
        : existing.decision_maker,
    contact_email:
      patch.contact_email !== undefined
        ? cleanStr(patch.contact_email, 140)
        : existing.contact_email,
    contact_phone:
      patch.contact_phone !== undefined
        ? cleanStr(patch.contact_phone, 50)
        : existing.contact_phone,
    source: existing.source,
    priority: nextPriority,
    status: nextStatus,
    contact_channel: nextChannel,
    first_contact_at:
      patch.first_contact_at !== undefined
        ? safeIsoOrNull(patch.first_contact_at)
        : existing.first_contact_at,
    next_follow_up_at:
      patch.next_follow_up_at !== undefined
        ? safeIsoOrNull(patch.next_follow_up_at)
        : existing.next_follow_up_at,
    visual_checked_desktop:
      patch.visual_checked_desktop !== undefined
        ? Boolean(patch.visual_checked_desktop)
        : existing.visual_checked_desktop,
    visual_checked_mobile:
      patch.visual_checked_mobile !== undefined
        ? Boolean(patch.visual_checked_mobile)
        : existing.visual_checked_mobile,
    visual_notes:
      patch.visual_notes !== undefined
        ? cleanStr(patch.visual_notes, 1200)
        : existing.visual_notes,
    research_summary:
      patch.research_summary !== undefined
        ? cleanStr(patch.research_summary, 1600)
        : existing.research_summary,
    findings:
      patch.findings !== undefined
        ? sanitizeFindings(patch.findings)
        : existing.findings,
    scan_data: existing.scan_data,
    pitch_angle:
      patch.pitch_angle !== undefined
        ? cleanStr(patch.pitch_angle, 800)
        : existing.pitch_angle,
    is_sample: existing.is_sample,
  });

  return NextResponse.json({ lead: updated }, { headers: PRIVATE_JSON_HEADERS });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  try {
    assertSafeMutationRequest(request, { requireJsonContentType: false });
  } catch (err) {
    return errorResponse(err, 403);
  }

  const { id } = await context.params;
  const deleted = await deleteLead(auth.scopeKey, id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: PRIVATE_JSON_HEADERS });
}
