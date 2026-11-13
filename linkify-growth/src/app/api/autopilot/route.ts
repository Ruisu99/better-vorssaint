import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { HARD_EUR_PER_USD_RATE, HARD_MAX_BATCH_LEADS } from "@/lib/budget-guard";
import { isOpenRouterConfigured, runAiTask } from "@/lib/openrouter";
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
  OutreachItem,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";
import {
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeRadarCandidates,
} from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  listLeads,
  saveOutreachItem,
  upsertLead,
} from "@/lib/workspace-data";

export const maxDuration = 60;

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

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 32_768);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);
  const step = cleanStr(body.step, 30) || "discover";

  // STEP 1: Fast Discovery (< 4 seconds)
  if (step === "discover") {
    const track: TargetTrack = body.track === "startup" ? "startup" : "kmu";
    const city = cleanStr(body.city, 80) || brand.city || "Erfurt";
    const query =
      cleanStr(body.query, 80) ||
      (track === "startup" ? "B2B SaaS Plattform" : "Handwerk");
    const count = Math.min(
      Math.max(Math.round(Number(body.count) || 3), 1),
      HARD_MAX_BATCH_LEADS,
    );

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

    let candidates: RadarCandidate[] = [];
    let searchModeLabel = "";
    let discoveryCostUsd = 0;

    if (track === "kmu") {
      const osm = await searchLocalBusinesses({
        city,
        category: "alle" as RadarCategory,
        keyword: query,
        onlyWithWebsite: true,
        limit: 18,
        existingNames,
        existingWebsites,
      }).catch(() => ({ resolvedLocation: city, candidates: [] }));

      candidates = osm.candidates.filter(
        (c) => !c.alreadyInPipeline && c.websiteUrl,
      );
      searchModeLabel = "OpenStreetMap DACH Radar (0,00 €)";
    }

    if (candidates.length < Math.max(count + 2, 5) && isOpenRouterConfigured()) {
      try {
        const web = await searchWebProspectsWithOpenRouter({
          scopeKey: auth.scopeKey,
          query,
          city,
          track,
          limit: Math.max(count + 4, 8),
          existingNames,
          existingWebsites,
        });
        if (web.providerMode === "openrouter") {
          discoveryCostUsd += 0.002;
          searchModeLabel =
            candidates.length > 0
              ? `${searchModeLabel} + Live-Websuche (${web.modelUsed})`
              : `Live-Websuche (${web.modelUsed})`;
        }
        const seenDomains = new Set(
          candidates.map((c) =>
            c.websiteUrl
              .replace(/^https?:\/\/(www\.)?/i, "")
              .replace(/\/.*$/, "")
              .toLowerCase(),
          ),
        );
        for (const wc of web.candidates) {
          const dom = wc.websiteUrl
            .replace(/^https?:\/\/(www\.)?/i, "")
            .replace(/\/.*$/, "")
            .toLowerCase();
          if (!wc.alreadyInPipeline && dom && !seenDomains.has(dom)) {
            candidates.push(wc);
            seenDomains.add(dom);
          }
        }
      } catch {
        // Keep OSM candidates if Sonar call fails
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            track === "startup" && !isOpenRouterConfigured()
              ? "Für die automatische Startup-Suche fehlt OPENROUTER_API_KEY – nutze sonst im Kunden-Radar den 5er-Batch-Scanner."
              : `Keine neuen Unternehmen mit Website für "${query}" in "${city}" gefunden. Versuche einen konkreteren Begriff (z. B. Zahnarzt, Dachdecker, Autohaus).`,
        },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      {
        candidates: candidates.slice(0, 10),
        searchModeLabel: searchModeLabel || "Lokale Suche",
        estimatedCostEur: Number(
          (discoveryCostUsd * HARD_EUR_PER_USD_RATE).toFixed(4),
        ),
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  // STEP 2: Parallel fast homepage technical triage (0 EUR, < 4.5 seconds)
  if (step === "scan_batch") {
    const candidates = sanitizeRadarCandidates(body.candidates, 8);
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Keine Kandidaten für die Vorprüfung übergeben." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const checks = await Promise.allSettled(
      candidates.map(async (c) => {
        if (!c.websiteUrl) throw new Error("Keine Website");
        const res = await scanWebsite(c.websiteUrl, {
          includePageSpeed: false,
          deepSubpages: false,
          timeoutMs: 4000,
        });
        const score =
          (res.suggestedPriority === "heiss"
            ? 30
            : res.suggestedPriority === "warm"
              ? 15
              : 5) + res.findings.length;
        return {
          candidate: {
            ...c,
            websiteUrl: res.scan.finalUrl,
            contactEmail: c.contactEmail || res.scan.extractedEmails[0] || "",
            contactPhone: c.contactPhone || res.scan.extractedPhones[0] || "",
          },
          score,
          priority: res.suggestedPriority,
          cms: res.scan.detectedCms,
          httpsEnabled: res.scan.httpsEnabled,
          hasViewport: res.scan.hasViewportMeta,
          topFinding: res.findings[0]?.title ?? "Basis-Check OK",
        };
      }),
    );

    const reachable = checks
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          candidate: RadarCandidate;
          score: number;
          priority: LeadPriority;
          cms: string;
          httpsEnabled: boolean;
          hasViewport: boolean;
          topFinding: string;
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value)
      .sort((a, b) => b.score - a.score);

    if (reachable.length === 0) {
      return NextResponse.json(
        {
          error:
            "Keine der gefundenen Websites war im Schnellcheck erreichbar. Bitte einen anderen Suchbegriff oder eine andere Stadt versuchen.",
        },
        { status: 422, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      {
        scannedCount: candidates.length,
        reachable,
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  // STEP 3: Process ONE lead (deep subpage scan + parallel AI qualification & outreach, < 4 seconds)
  if (step === "process_one") {
    const candidates = sanitizeRadarCandidates(
      body.candidate ? [body.candidate] : [],
      1,
    );
    const candidate = candidates[0];
    if (!candidate || !candidate.websiteUrl) {
      return NextResponse.json(
        { error: "Ungültiger Lead-Kandidat." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const track: TargetTrack = body.track === "startup" ? "startup" : "kmu";
    const generateOutreach = body.generateOutreach !== false;

    const scanResult = await scanWebsite(candidate.websiteUrl, {
      includePageSpeed: false,
      deepSubpages: true,
      timeoutMs: 4500,
    });

    const draftLead: Lead = {
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      company_name: candidate.companyName,
      industry: candidate.industry || (track === "startup" ? "SaaS / Produkt" : "KMU"),
      target_track: track,
      city: candidate.city || brand.city || "",
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
      contact_channel:
        scanResult.suggestedPriority === "heiss" ? "video_audit" : "email",
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

    const piiContext = {
      companyName: draftLead.company_name,
      websiteUrl: draftLead.website_url,
      decisionMaker: draftLead.decision_maker,
      contactEmail: draftLead.contact_email,
      contactPhone: draftLead.contact_phone,
      postalAddress: draftLead.postal_address,
    };

    const qualifyPromise = runAiTask({
      scopeKey: auth.scopeKey,
      taskType: "autopilot_qualify",
      model: brand.openrouter_config.researchModel,
      systemPrompt: buildLinkifySystemPrompt(brand),
      userPrompt: buildQualificationPrompt(draftLead),
      temperature: 0.25,
      maxTokens: 600,
      reasoningEffort: "low",
      privacyMode: true,
      piiContext,
      summaryLabel: `Autopilot Qualifizierung: ${draftLead.company_name}`,
      fallbackFn: () =>
        JSON.stringify({
          priority: scanResult.suggestedPriority,
          targetTrack: track,
          researchSummary: draftLead.research_summary,
          pitchAngle: scanResult.suggestedPitchAngle,
          recommendedChannel: draftLead.contact_channel,
        }),
    }).catch(() => null);

    const outreachChannels: OutreachChannel[] = generateOutreach
      ? ["email", "video_audit"]
      : [];

    const outreachPromises = outreachChannels.map((ch) => {
      const fallback = buildFallbackOutreach({
        brand,
        lead: draftLead,
        channel: ch,
      });
      return runAiTask({
        scopeKey: auth.scopeKey,
        taskType: "autopilot_outreach",
        model: brand.openrouter_config.writingModel,
        systemPrompt: buildLinkifySystemPrompt(brand),
        userPrompt: buildOutreachPrompt({
          brand,
          lead: draftLead,
          channel: ch,
        }),
        temperature: brand.openrouter_config.temperature,
        maxTokens: 850,
        reasoningEffort: "low",
        privacyMode: true,
        piiContext,
        summaryLabel: `Autopilot ${ch}: ${draftLead.company_name}`,
        fallbackFn: () => `BETREFF: ${fallback.subject}\n---\n${fallback.body}`,
      })
        .then((res) => ({ ch, fallback, res }))
        .catch(() => ({
          ch,
          fallback,
          res: {
            text: `BETREFF: ${fallback.subject}\n---\n${fallback.body}`,
            modelUsed: "lokal-basis",
            providerMode: "local_fallback" as const,
            privacyMasked: true,
            estimatedCostUsd: 0,
            limitBlockedReason: undefined,
          },
        }));
    });

    const [qualRes, ...outreachResults] = await Promise.all([
      qualifyPromise,
      ...outreachPromises,
    ]);

    let totalCostUsd = 0;
    let lastModel = "lokal-basis";
    let limitBlockedReason: string | undefined;

    if (qualRes) {
      totalCostUsd += qualRes.estimatedCostUsd;
      lastModel = qualRes.modelUsed;
      if (qualRes.limitBlockedReason) {
        limitBlockedReason = qualRes.limitBlockedReason;
      }
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

    const savedOutreach: OutreachItem[] = [];
    for (const entry of outreachResults) {
      totalCostUsd += entry.res.estimatedCostUsd;
      lastModel = entry.res.modelUsed;
      if (entry.res.limitBlockedReason) {
        limitBlockedReason = entry.res.limitBlockedReason;
      }
      const split = splitSubjectAndBody(
        entry.res.text,
        entry.fallback.subject,
      );
      const savedItem = await saveOutreachItem({
        id: crypto.randomUUID(),
        owner_sub: auth.scopeKey,
        lead_id: savedLead.id,
        channel: entry.ch,
        subject: split.subject.slice(0, 200),
        body: split.body.slice(0, 8000),
        notes: `Autopilot (${entry.res.modelUsed})`,
        status: "entwurf",
        model_used: entry.res.modelUsed,
        privacy_masked: true,
      });
      savedOutreach.push(savedItem);
    }

    return NextResponse.json(
      {
        lead: savedLead,
        outreachItems: savedOutreach,
        aiModelUsed: lastModel,
        limitBlockedReason,
        estimatedCostEur: Number(
          (totalCostUsd * HARD_EUR_PER_USD_RATE).toFixed(4),
        ),
      },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  }

  return NextResponse.json(
    { error: "Unbekannter Autopilot-Schritt." },
    { status: 400, headers: PRIVATE_JSON_HEADERS },
  );
}
