import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { runAiTask } from "@/lib/openrouter";
import {
  buildLinkifySystemPrompt,
  buildQualificationPrompt,
} from "@/lib/prompts";
import { scanWebsite } from "@/lib/scanner";
import type { Lead, LeadPriority, TargetTrack } from "@/lib/types";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  getLeadById,
  upsertLead,
} from "@/lib/workspace-data";

function parseJsonSafe<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  let body: {
    url?: string;
    leadId?: string;
    companyName?: string;
    industry?: string;
    city?: string;
    includePageSpeed?: boolean;
    runAiQualification?: boolean;
    saveToPipeline?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  let existingLead: Lead | null = null;
  if (body.leadId) {
    existingLead = await getLeadById(auth.scopeKey, body.leadId);
    if (!existingLead) {
      return NextResponse.json(
        { error: "Lead nicht gefunden." },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }
  }

  const targetUrl = (body.url ?? existingLead?.website_url ?? "").trim();
  if (!targetUrl) {
    return NextResponse.json(
      { error: "Keine Website-URL für den Scan angegeben." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  let scanResult: Awaited<ReturnType<typeof scanWebsite>>;
  try {
    scanResult = await scanWebsite(targetUrl, {
      includePageSpeed: Boolean(body.includePageSpeed),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Website-Scan fehlgeschlagen.";
    return NextResponse.json(
      { error: message },
      { status: 422, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const hostname = new URL(scanResult.scan.finalUrl).hostname.replace(
    /^www\./i,
    "",
  );
  const derivedCompany =
    existingLead?.company_name ??
    (body.companyName?.trim() ||
      scanResult.scan.title.split(/[|\-–]/)[0]?.trim() ||
      hostname);

  const draftLead: Lead = {
    id: existingLead?.id ?? crypto.randomUUID(),
    owner_sub: auth.scopeKey,
    company_name: derivedCompany.slice(0, 160),
    industry: existingLead?.industry || body.industry?.trim() || "",
    target_track: scanResult.suggestedTrack,
    city: existingLead?.city || body.city?.trim() || "",
    postal_address: existingLead?.postal_address || "",
    website_url: scanResult.scan.finalUrl,
    decision_maker: existingLead?.decision_maker || "",
    contact_email:
      existingLead?.contact_email || scanResult.scan.extractedEmails[0] || "",
    contact_phone:
      existingLead?.contact_phone || scanResult.scan.extractedPhones[0] || "",
    source: existingLead?.source || "url_scan",
    priority: scanResult.suggestedPriority,
    status:
      existingLead && existingLead.status !== "neu"
        ? existingLead.status
        : "analysiert",
    contact_channel: existingLead?.contact_channel || "email",
    first_contact_at: existingLead?.first_contact_at ?? null,
    next_follow_up_at: existingLead?.next_follow_up_at ?? null,
    visual_checked_desktop: existingLead?.visual_checked_desktop ?? false,
    visual_checked_mobile: existingLead?.visual_checked_mobile ?? false,
    visual_notes: existingLead?.visual_notes ?? "",
    research_summary: `${scanResult.scan.detectedCms} erkannt (${scanResult.scan.responseTimeMs} ms, HTTPS: ${scanResult.scan.httpsEnabled ? "Ja" : "Nein"}). ${scanResult.findings[0]?.title ?? ""}`,
    findings: scanResult.findings,
    scan_data: scanResult.scan,
    pitch_angle: scanResult.suggestedPitchAngle,
    is_sample: existingLead?.is_sample ?? false,
    created_at: existingLead?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let aiMeta: {
    providerMode: "openrouter" | "local_fallback";
    modelUsed: string;
    privacyMasked: boolean;
    limitBlockedReason?: string;
    estimatedCostUsd: number;
    nextVisualCheckHints: string[];
  } | null = null;

  if (body.runAiQualification !== false) {
    try {
      const aiRes = await runAiTask({
        scopeKey: auth.scopeKey,
        taskType: "lead_qualify",
        model: brand.openrouter_config.researchModel,
        systemPrompt: buildLinkifySystemPrompt(brand),
        userPrompt: buildQualificationPrompt(draftLead),
        temperature: 0.25,
        maxTokens: 900,
        privacyMode: brand.openrouter_config.privacyMode,
        piiContext: {
          decisionMaker: draftLead.decision_maker,
          contactEmail: draftLead.contact_email,
          contactPhone: draftLead.contact_phone,
          postalAddress: draftLead.postal_address,
        },
        summaryLabel: `Qualifizierung ${draftLead.company_name}`,
        fallbackFn: () =>
          JSON.stringify({
            priority: scanResult.suggestedPriority,
            targetTrack: scanResult.suggestedTrack,
            researchSummary: draftLead.research_summary,
            pitchAngle: scanResult.suggestedPitchAngle,
            recommendedChannel:
              scanResult.suggestedPriority === "heiss"
                ? "video_audit"
                : "email",
            nextVisualCheckHints: [
              "Startseite auf Desktop & Smartphone im Browser öffnen und Lesbarkeit prüfen",
              "Kontaktdaten, Leistungsübersicht und Ladegefühl persönlich gegenchecken",
            ],
          }),
      });

      const parsed = parseJsonSafe<{
        priority?: LeadPriority;
        targetTrack?: TargetTrack;
        researchSummary?: string;
        pitchAngle?: string;
        recommendedChannel?: Lead["contact_channel"];
        nextVisualCheckHints?: string[];
      }>(aiRes.text);

      if (parsed) {
        if (
          parsed.priority === "heiss" ||
          parsed.priority === "warm" ||
          parsed.priority === "kalt"
        ) {
          draftLead.priority = parsed.priority;
        }
        if (parsed.targetTrack === "kmu" || parsed.targetTrack === "startup") {
          draftLead.target_track = parsed.targetTrack;
        }
        if (parsed.researchSummary) {
          draftLead.research_summary = parsed.researchSummary.slice(0, 1400);
        }
        if (parsed.pitchAngle) {
          draftLead.pitch_angle = parsed.pitchAngle.slice(0, 750);
        }
        if (
          parsed.recommendedChannel === "video_audit" ||
          parsed.recommendedChannel === "email" ||
          parsed.recommendedChannel === "brief"
        ) {
          draftLead.contact_channel = parsed.recommendedChannel;
        }
      }

      aiMeta = {
        providerMode: aiRes.providerMode,
        modelUsed: aiRes.modelUsed,
        privacyMasked: aiRes.privacyMasked,
        limitBlockedReason: aiRes.limitBlockedReason,
        estimatedCostUsd: aiRes.estimatedCostUsd,
        nextVisualCheckHints: parsed?.nextVisualCheckHints ?? [],
      };
    } catch {
      aiMeta = null;
    }
  }

  let savedLead = draftLead;
  if (body.saveToPipeline !== false || existingLead) {
    savedLead = await upsertLead({
      id: draftLead.id,
      owner_sub: draftLead.owner_sub,
      company_name: draftLead.company_name,
      industry: draftLead.industry,
      target_track: draftLead.target_track,
      city: draftLead.city,
      postal_address: draftLead.postal_address,
      website_url: draftLead.website_url,
      decision_maker: draftLead.decision_maker,
      contact_email: draftLead.contact_email,
      contact_phone: draftLead.contact_phone,
      source: draftLead.source,
      priority: draftLead.priority,
      status: draftLead.status,
      contact_channel: draftLead.contact_channel,
      first_contact_at: draftLead.first_contact_at,
      next_follow_up_at: draftLead.next_follow_up_at,
      visual_checked_desktop: draftLead.visual_checked_desktop,
      visual_checked_mobile: draftLead.visual_checked_mobile,
      visual_notes: draftLead.visual_notes,
      research_summary: draftLead.research_summary,
      findings: draftLead.findings,
      scan_data: draftLead.scan_data,
      pitch_angle: draftLead.pitch_angle,
      is_sample: draftLead.is_sample,
    });
  }

  return NextResponse.json(
    {
      lead: savedLead,
      saved: body.saveToPipeline !== false || Boolean(existingLead),
      aiMeta,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
