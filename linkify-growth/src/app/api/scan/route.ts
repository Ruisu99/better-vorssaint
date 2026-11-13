import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { HARD_MAX_BATCH_LEADS } from "@/lib/budget-guard";
import { runAiTask } from "@/lib/openrouter";
import {
  buildLinkifySystemPrompt,
  buildQualificationPrompt,
} from "@/lib/prompts";
import { scanWebsite } from "@/lib/scanner";
import type { Lead, LeadPriority, TargetTrack } from "@/lib/types";
import { cleanStr, errorResponse, parseSafeJsonBody } from "@/lib/validation";
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

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 24_576);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  // Batch scan mode (0 EUR technical multi-URL scan for Startup/KMU lists, capped at HARD_MAX_BATCH_LEADS)
  if (Array.isArray(body.urls)) {
    const rawUrls = body.urls
      .slice(0, HARD_MAX_BATCH_LEADS)
      .map((u) => cleanStr(u, 400))
      .filter(Boolean);

    if (rawUrls.length === 0) {
      return NextResponse.json(
        { error: "Bitte mindestens eine URL eingeben." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const saveToPipeline = body.saveToPipeline !== false;
    const forceTrack: TargetTrack | null =
      body.targetTrack === "startup" || body.targetTrack === "kmu"
        ? body.targetTrack
        : null;

    const results: Array<{
      url: string;
      ok: boolean;
      lead?: Lead;
      error?: string;
    }> = [];

    for (const rawUrl of rawUrls) {
      try {
        const scanResult = await scanWebsite(rawUrl, {
          includePageSpeed: false,
          deepSubpages: true,
        });
        const hostname = new URL(scanResult.scan.finalUrl).hostname.replace(
          /^www\./i,
          "",
        );
        const derivedCompany =
          scanResult.scan.title.split(/[|\-–]/)[0]?.trim() || hostname;

        const leadPayload = {
          id: crypto.randomUUID(),
          owner_sub: auth.scopeKey,
          company_name: derivedCompany.slice(0, 160),
          industry: forceTrack === "startup" ? "Digitales Produkt / SaaS" : "",
          target_track: forceTrack ?? scanResult.suggestedTrack,
          city: "",
          postal_address: "",
          website_url: scanResult.scan.finalUrl,
          decision_maker: scanResult.scan.decisionMakerHint ?? "",
          contact_email: scanResult.scan.extractedEmails[0] ?? "",
          contact_phone: scanResult.scan.extractedPhones[0] ?? "",
          source: forceTrack === "startup" ? "startup_batch" : "batch_scan",
          priority: scanResult.suggestedPriority,
          status: "analysiert" as const,
          contact_channel: "email" as const,
          first_contact_at: null,
          next_follow_up_at: null,
          visual_checked_desktop: false,
          visual_checked_mobile: false,
          visual_notes: "",
          research_summary: `${scanResult.scan.detectedCms} erkannt (${scanResult.scan.responseTimeMs} ms, ${scanResult.scan.checkedPagesCount ?? 1} Seiten geprüft). ${scanResult.findings[0]?.title ?? ""}`,
          findings: scanResult.findings,
          scan_data: scanResult.scan,
          pitch_angle: scanResult.suggestedPitchAngle,
          is_sample: false,
        };

        const savedLead = saveToPipeline
          ? await upsertLead(leadPayload)
          : {
              ...leadPayload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

        results.push({ url: rawUrl, ok: true, lead: savedLead });
      } catch (err) {
        results.push({
          url: rawUrl,
          ok: false,
          error:
            err instanceof Error ? err.message : "Scan fehlgeschlagen.",
        });
      }
    }

    return NextResponse.json(
      { results },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  let existingLead: Lead | null = null;
  const leadId = cleanStr(body.leadId, 80);
  if (leadId) {
    existingLead = await getLeadById(auth.scopeKey, leadId);
    if (!existingLead) {
      return NextResponse.json(
        { error: "Lead nicht gefunden." },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }
  }

  const targetUrl =
    cleanStr(body.url, 400) || existingLead?.website_url || "";
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
      deepSubpages: true,
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
    (cleanStr(body.companyName, 160) ||
      scanResult.scan.title.split(/[|\-–]/)[0]?.trim() ||
      hostname);

  const draftLead: Lead = {
    id: existingLead?.id ?? crypto.randomUUID(),
    owner_sub: auth.scopeKey,
    company_name: derivedCompany.slice(0, 160),
    industry: existingLead?.industry || cleanStr(body.industry, 100),
    target_track: scanResult.suggestedTrack,
    city: existingLead?.city || cleanStr(body.city, 80),
    postal_address: existingLead?.postal_address || "",
    website_url: scanResult.scan.finalUrl,
    decision_maker:
      existingLead?.decision_maker ||
      scanResult.scan.decisionMakerHint ||
      "",
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
    research_summary: `${scanResult.scan.detectedCms} erkannt (${scanResult.scan.responseTimeMs} ms, HTTPS: ${scanResult.scan.httpsEnabled ? "Ja" : "Nein"}, ${scanResult.scan.checkedPagesCount ?? 1} Seiten geprüft). ${scanResult.findings[0]?.title ?? ""}`,
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
    autoDowngraded?: boolean;
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
        maxTokens: 700,
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
        autoDowngraded: aiRes.autoDowngraded,
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
