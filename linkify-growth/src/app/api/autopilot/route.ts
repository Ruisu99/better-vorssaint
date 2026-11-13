import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { HARD_EUR_PER_USD_RATE, HARD_MAX_BATCH_LEADS } from "@/lib/budget-guard";
import { runAiTask } from "@/lib/openrouter";
import {
  buildFallbackOutreach,
  buildLinkifySystemPrompt,
  buildOutreachPrompt,
  buildQualificationPrompt,
} from "@/lib/prompts";
import {
  searchLocalBusinesses,
  searchWebProspectsWithOpenRouter,
  type RadarCategory,
} from "@/lib/radar";
import { scanWebsite } from "@/lib/scanner";
import type {
  Lead,
  LeadPriority,
  OutreachChannel,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";
import { cleanStr, errorResponse, parseSafeJsonBody } from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  listLeads,
  saveOutreachItem,
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

function splitSubjectAndBody(
  rawText: string,
  fallbackSubject: string,
): { subject: string; body: string } {
  const match = rawText.match(/^BETREFF:\s*(.+?)\s*\n-{3,}\s*\n([\s\S]+)$/i);
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
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

/**
 * 1-Click Autonomous Client Acquisition Pipeline:
 * 1. Discover real companies (0-EUR OSM Radar or OpenRouter Sonar live web search)
 * 2. Verify websites live via DNS-pinned scanner (0 EUR AI tokens)
 * 3. Qualify with Muse Ember ($0.10/$0.50, privacy-masked)
 * 4. Generate personalized E-Mail + 90s Video-Audit script (privacy-masked)
 * 5. Save everything into Postgres Pipeline
 */
export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 16_384);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  const track: TargetTrack = body.track === "startup" ? "startup" : "kmu";
  const city = cleanStr(body.city, 80) || brand.city || "Erfurt";
  const query =
    cleanStr(body.query, 80) ||
    (track === "startup" ? "B2B SaaS Software" : "Handwerk");
  const count = Math.min(
    Math.max(Math.round(Number(body.count) || 3), 1),
    HARD_MAX_BATCH_LEADS,
  );
  const discoverySource =
    cleanStr(body.source, 30) === "web" || track === "startup"
      ? "web"
      : "osm_then_web";
  const generateOutreach = body.generateOutreach !== false;

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

  let totalCostUsd = 0;
  let candidates: RadarCandidate[] = [];
  let searchModeLabel = "";

  // Step 1: Discovery
  if (discoverySource === "osm_then_web") {
    const osm = await searchLocalBusinesses({
      city,
      category: "alle" as RadarCategory,
      keyword: query,
      onlyWithWebsite: true,
      limit: 18,
      existingNames,
      existingWebsites,
    }).catch(() => ({ resolvedLocation: city, candidates: [] }));

    candidates = osm.candidates.filter((c) => !c.alreadyInPipeline && c.websiteUrl);
    searchModeLabel = "OpenStreetMap DACH Radar (0,00 €)";
  }

  if (candidates.length < count) {
    const web = await searchWebProspectsWithOpenRouter({
      scopeKey: auth.scopeKey,
      query,
      city,
      track,
      limit: Math.max(count + 3, 6),
      existingNames,
      existingWebsites,
    });
    const seenUrls = new Set(candidates.map((c) => c.websiteUrl.toLowerCase()));
    for (const wc of web.candidates) {
      if (!wc.alreadyInPipeline && !seenUrls.has(wc.websiteUrl.toLowerCase())) {
        candidates.push(wc);
        seenUrls.add(wc.websiteUrl.toLowerCase());
      }
    }
    searchModeLabel =
      web.providerMode === "openrouter"
        ? `Live-Websuche (${web.modelUsed})`
        : searchModeLabel || "Lokale Suche";
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error:
          "Keine neuen passenden Unternehmen mit Website gefunden. Versuche einen anderen Begriff oder Ort.",
      },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  // Step 2: Live DNS-pinned technical verification (0 EUR AI tokens)
  const scanned: Array<{
    candidate: RadarCandidate;
    scanResult: Awaited<ReturnType<typeof scanWebsite>>;
    score: number;
  }> = [];

  for (const cand of candidates.slice(0, Math.min(candidates.length, count + 4))) {
    if (!cand.websiteUrl) continue;
    try {
      const scanResult = await scanWebsite(cand.websiteUrl, {
        includePageSpeed: false,
        deepSubpages: true,
      });
      const score =
        (scanResult.suggestedPriority === "heiss"
          ? 30
          : scanResult.suggestedPriority === "warm"
            ? 15
            : 5) + scanResult.findings.length;
      scanned.push({ candidate: cand, scanResult, score });
      if (scanned.length >= count + 2) break;
    } catch {
      // Skip unreachable or invalid URLs automatically
    }
  }

  scanned.sort((a, b) => b.score - a.score);
  const topProspects = scanned.slice(0, count);

  if (topProspects.length === 0) {
    return NextResponse.json(
      {
        error:
          "Gefundene Websites waren technisch nicht erreichbar. Bitte Suchbegriff anpassen.",
      },
      { status: 422, headers: PRIVATE_JSON_HEADERS },
    );
  }

  // Step 3 & 4: AI Qualification + Personalized Outreach + Save
  const createdLeads: Array<{
    lead: Lead;
    outreachCount: number;
    aiModelUsed: string;
    limitBlockedReason?: string;
  }> = [];

  for (const { candidate, scanResult } of topProspects) {
    const draftLead: Lead = {
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      company_name: candidate.companyName,
      industry: candidate.industry || query,
      target_track: track,
      city: candidate.city || city,
      postal_address: candidate.postalAddress,
      website_url: scanResult.scan.finalUrl,
      decision_maker: scanResult.scan.decisionMakerHint ?? "",
      contact_email:
        candidate.contactEmail || scanResult.scan.extractedEmails[0] || "",
      contact_phone:
        candidate.contactPhone || scanResult.scan.extractedPhones[0] || "",
      source: "autopilot",
      priority: scanResult.suggestedPriority,
      status: "analysiert",
      contact_channel: scanResult.suggestedPriority === "heiss" ? "video_audit" : "email",
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let lastModel = "lokal-basis";
    let lastBlocked: string | undefined;

    try {
      const qualRes = await runAiTask({
        scopeKey: auth.scopeKey,
        taskType: "autopilot_qualify",
        model: brand.openrouter_config.researchModel,
        systemPrompt: buildLinkifySystemPrompt(brand),
        userPrompt: buildQualificationPrompt(draftLead),
        temperature: 0.25,
        maxTokens: 650,
        privacyMode: true,
        piiContext: {
          companyName: draftLead.company_name,
          websiteUrl: draftLead.website_url,
          decisionMaker: draftLead.decision_maker,
          contactEmail: draftLead.contact_email,
          contactPhone: draftLead.contact_phone,
          postalAddress: draftLead.postal_address,
        },
        summaryLabel: `Autopilot Qualifizierung: ${draftLead.company_name}`,
        fallbackFn: () =>
          JSON.stringify({
            priority: scanResult.suggestedPriority,
            targetTrack: track,
            researchSummary: draftLead.research_summary,
            pitchAngle: scanResult.suggestedPitchAngle,
            recommendedChannel: draftLead.contact_channel,
          }),
      });
      totalCostUsd += qualRes.estimatedCostUsd;
      lastModel = qualRes.modelUsed;
      lastBlocked = qualRes.limitBlockedReason;

      const parsed = parseJsonSafe<{
        priority?: LeadPriority;
        researchSummary?: string;
        pitchAngle?: string;
        recommendedChannel?: Lead["contact_channel"];
      }>(qualRes.text);
      if (parsed) {
        if (
          parsed.priority === "heiss" ||
          parsed.priority === "warm" ||
          parsed.priority === "kalt"
        ) {
          draftLead.priority = parsed.priority;
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
    } catch {
      // Keep technical baseline if AI fails
    }

    const savedLead = await upsertLead({
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
      is_sample: false,
    });

    let outreachCount = 0;
    if (generateOutreach) {
      const channels: OutreachChannel[] = ["email", "video_audit"];
      for (const ch of channels) {
        const fallback = buildFallbackOutreach({
          brand,
          lead: savedLead,
          channel: ch,
        });
        try {
          const outRes = await runAiTask({
            scopeKey: auth.scopeKey,
            taskType: "autopilot_outreach",
            model: brand.openrouter_config.writingModel,
            systemPrompt: buildLinkifySystemPrompt(brand),
            userPrompt: buildOutreachPrompt({
              brand,
              lead: savedLead,
              channel: ch,
            }),
            temperature: brand.openrouter_config.temperature,
            maxTokens: 900,
            privacyMode: true,
            piiContext: {
              companyName: savedLead.company_name,
              websiteUrl: savedLead.website_url,
              decisionMaker: savedLead.decision_maker,
              contactEmail: savedLead.contact_email,
              contactPhone: savedLead.contact_phone,
              postalAddress: savedLead.postal_address,
            },
            summaryLabel: `Autopilot ${ch}: ${savedLead.company_name}`,
            fallbackFn: () =>
              `BETREFF: ${fallback.subject}\n---\n${fallback.body}`,
          });
          totalCostUsd += outRes.estimatedCostUsd;
          lastModel = outRes.modelUsed;
          if (outRes.limitBlockedReason) lastBlocked = outRes.limitBlockedReason;

          const split = splitSubjectAndBody(outRes.text, fallback.subject);
          await saveOutreachItem({
            id: crypto.randomUUID(),
            owner_sub: auth.scopeKey,
            lead_id: savedLead.id,
            channel: ch,
            subject: split.subject.slice(0, 200),
            body: split.body.slice(0, 8000),
            notes: `Autopilot (${outRes.modelUsed})`,
            status: "entwurf",
            model_used: outRes.modelUsed,
            privacy_masked: true,
          });
          outreachCount += 1;
        } catch {
          // continue cleanly
        }
      }
    }

    createdLeads.push({
      lead: savedLead,
      outreachCount,
      aiModelUsed: lastModel,
      limitBlockedReason: lastBlocked,
    });
  }

  return NextResponse.json(
    {
      searchModeLabel,
      discoveredCount: candidates.length,
      verifiedCount: scanned.length,
      createdLeads,
      estimatedCostEur: Number((totalCostUsd * HARD_EUR_PER_USD_RATE).toFixed(4)),
    },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}
