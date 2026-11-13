import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { runAiTask } from "@/lib/openrouter";
import {
  buildFallbackOutreach,
  buildLinkifySystemPrompt,
  buildOutreachPrompt,
} from "@/lib/prompts";
import type { OutreachChannel, OutreachStatus } from "@/lib/types";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  getLeadById,
  listRecentOutreach,
  saveOutreachItem,
  updateOutreachStatus,
  upsertLead,
} from "@/lib/workspace-data";

function splitSubjectAndBody(
  rawText: string,
  fallbackSubject: string,
): { subject: string; body: string } {
  const match = rawText.match(/^BETREFF:\s*(.+?)\s*\n-{3,}\s*\n([\s\S]+)$/i);
  if (match) {
    return {
      subject: match[1].trim(),
      body: match[2].trim(),
    };
  }
  const lines = rawText.split("\n");
  if (lines[0]?.toUpperCase().startsWith("BETREFF:")) {
    return {
      subject: lines[0].replace(/^BETREFF:\s*/i, "").trim(),
      body: lines.slice(1).join("\n").replace(/^---+\s*/, "").trim(),
    };
  }
  return { subject: fallbackSubject, body: rawText.trim() };
}

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const items = await listRecentOutreach(auth.scopeKey);
  return NextResponse.json({ items }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  let body: {
    action?: "generate" | "save_manual";
    leadId?: string;
    channel?: OutreachChannel;
    extraContext?: string;
    subject?: string;
    body?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (!body.leadId) {
    return NextResponse.json(
      { error: "leadId ist erforderlich." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const lead = await getLeadById(auth.scopeKey, body.leadId);
  if (!lead) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const channel: OutreachChannel = body.channel ?? "email";

  if (body.action === "save_manual") {
    const saved = await saveOutreachItem({
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      lead_id: lead.id,
      channel,
      subject: String(body.subject ?? "").slice(0, 200),
      body: String(body.body ?? "").slice(0, 8000),
      notes: "Manuell gespeichert",
      status: "entwurf",
      model_used: "manuell",
      privacy_masked: false,
    });
    return NextResponse.json(
      { item: saved },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const fallback = buildFallbackOutreach({
    brand,
    lead,
    channel,
    extraContext: body.extraContext,
  });

  try {
    const aiRes = await runAiTask({
      scopeKey: auth.scopeKey,
      taskType: channel === "reply_draft" ? "reply_assist" : "outreach",
      model: brand.openrouter_config.writingModel,
      systemPrompt: buildLinkifySystemPrompt(brand),
      userPrompt: buildOutreachPrompt({
        brand,
        lead,
        channel,
        extraContext: body.extraContext,
      }),
      temperature: brand.openrouter_config.temperature,
      maxTokens: 1300,
      privacyMode: brand.openrouter_config.privacyMode,
      piiContext: {
        decisionMaker: lead.decision_maker,
        contactEmail: lead.contact_email,
        contactPhone: lead.contact_phone,
        postalAddress: lead.postal_address,
      },
      summaryLabel: `${channel} für ${lead.company_name}`,
      fallbackFn: () => `BETREFF: ${fallback.subject}\n---\n${fallback.body}`,
    });

    const parsed = splitSubjectAndBody(aiRes.text, fallback.subject);

    const saved = await saveOutreachItem({
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      lead_id: lead.id,
      channel,
      subject: parsed.subject.slice(0, 200),
      body: parsed.body.slice(0, 8000),
      notes:
        aiRes.providerMode === "local_fallback"
          ? "Erstellt im lokalen Vorschau-Modus (ohne OpenRouter-Key)"
          : `Generiert mit ${aiRes.modelUsed}`,
      status: "entwurf",
      model_used: aiRes.modelUsed,
      privacy_masked: aiRes.privacyMasked,
    });

    return NextResponse.json(
      {
        item: saved,
        providerMode: aiRes.providerMode,
        limitBlockedReason: aiRes.limitBlockedReason,
        estimatedCostUsd: aiRes.estimatedCostUsd,
        usage: aiRes.usage,
      },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Textgenerierung fehlgeschlagen.";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: PRIVATE_JSON_HEADERS },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: {
    itemId?: string;
    status?: OutreachStatus;
    subject?: string;
    body?: string;
    updateLeadAfterSend?: boolean;
    followUpDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (!body.itemId || !body.status) {
    return NextResponse.json(
      { error: "itemId und status sind erforderlich." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const updated = await updateOutreachStatus(
    auth.scopeKey,
    body.itemId,
    body.status,
    body.subject?.slice(0, 200),
    body.body?.slice(0, 8000),
  );
  if (!updated) {
    return NextResponse.json(
      { error: "Entwurf nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (body.status === "gesendet" && body.updateLeadAfterSend !== false) {
    const lead = await getLeadById(auth.scopeKey, updated.lead_id);
    if (lead) {
      const days = Math.min(Math.max(body.followUpDays ?? 5, 1), 30);
      const nextFollowUp = new Date(
        Date.now() + days * 86_400_000,
      ).toISOString();
      await upsertLead({
        id: lead.id,
        owner_sub: auth.scopeKey,
        company_name: lead.company_name,
        industry: lead.industry,
        target_track: lead.target_track,
        city: lead.city,
        postal_address: lead.postal_address,
        website_url: lead.website_url,
        decision_maker: lead.decision_maker,
        contact_email: lead.contact_email,
        contact_phone: lead.contact_phone,
        source: lead.source,
        priority: lead.priority,
        status:
          lead.status === "neu" || lead.status === "analysiert"
            ? "kontaktiert"
            : lead.status,
        contact_channel:
          updated.channel === "brief"
            ? "brief"
            : updated.channel === "video_audit"
              ? "video_audit"
              : lead.contact_channel,
        first_contact_at: lead.first_contact_at ?? new Date().toISOString(),
        next_follow_up_at: nextFollowUp,
        visual_checked_desktop: lead.visual_checked_desktop,
        visual_checked_mobile: lead.visual_checked_mobile,
        visual_notes: lead.visual_notes,
        research_summary: lead.research_summary,
        findings: lead.findings,
        scan_data: lead.scan_data,
        pitch_angle: lead.pitch_angle,
        is_sample: lead.is_sample,
      });
    }
  }

  return NextResponse.json(
    { item: updated },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
