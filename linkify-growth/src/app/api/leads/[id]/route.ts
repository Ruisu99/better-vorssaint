import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import type { Lead } from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  deleteLead,
  ensureWorkspaceSeeded,
  getLeadById,
  listOutreachForLead,
  upsertLead,
} from "@/lib/workspace-data";

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

  await ensureWorkspaceSeeded(auth.scopeKey);
  const { id } = await context.params;
  const existing = await getLeadById(auth.scopeKey, id);
  if (!existing) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  let patch: Partial<Lead>;
  try {
    patch = (await request.json()) as Partial<Lead>;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const nextWebsite =
    patch.website_url !== undefined
      ? sanitizeExternalHref(patch.website_url) ?? ""
      : existing.website_url;

  const updated = await upsertLead({
    id: existing.id,
    owner_sub: auth.scopeKey,
    company_name:
      typeof patch.company_name === "string" && patch.company_name.trim()
        ? patch.company_name.trim().slice(0, 160)
        : existing.company_name,
    industry:
      patch.industry !== undefined
        ? String(patch.industry).trim().slice(0, 100)
        : existing.industry,
    target_track:
      patch.target_track === "startup" || patch.target_track === "kmu"
        ? patch.target_track
        : existing.target_track,
    city:
      patch.city !== undefined
        ? String(patch.city).trim().slice(0, 80)
        : existing.city,
    postal_address:
      patch.postal_address !== undefined
        ? String(patch.postal_address).trim().slice(0, 220)
        : existing.postal_address,
    website_url: nextWebsite,
    decision_maker:
      patch.decision_maker !== undefined
        ? String(patch.decision_maker).trim().slice(0, 120)
        : existing.decision_maker,
    contact_email:
      patch.contact_email !== undefined
        ? String(patch.contact_email).trim().slice(0, 140)
        : existing.contact_email,
    contact_phone:
      patch.contact_phone !== undefined
        ? String(patch.contact_phone).trim().slice(0, 50)
        : existing.contact_phone,
    source: existing.source,
    priority: patch.priority ?? existing.priority,
    status: patch.status ?? existing.status,
    contact_channel: patch.contact_channel ?? existing.contact_channel,
    first_contact_at:
      patch.first_contact_at !== undefined
        ? patch.first_contact_at
        : existing.first_contact_at,
    next_follow_up_at:
      patch.next_follow_up_at !== undefined
        ? patch.next_follow_up_at
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
        ? String(patch.visual_notes).slice(0, 1200)
        : existing.visual_notes,
    research_summary:
      patch.research_summary !== undefined
        ? String(patch.research_summary).slice(0, 1600)
        : existing.research_summary,
    findings: Array.isArray(patch.findings)
      ? patch.findings.slice(0, 12)
      : existing.findings,
    scan_data:
      patch.scan_data !== undefined ? patch.scan_data : existing.scan_data,
    pitch_angle:
      patch.pitch_angle !== undefined
        ? String(patch.pitch_angle).slice(0, 800)
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
