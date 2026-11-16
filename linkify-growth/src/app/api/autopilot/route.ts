import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { HARD_EUR_PER_USD_RATE } from "@/lib/budget-guard";
import { isHistoricalNotionLead, normalizeDomain } from "@/lib/notion-history";
import { isOpenRouterConfigured, runAiTask } from "@/lib/openrouter";
import {
  buildFallbackOutreach,
  buildLinkifySystemPrompt,
  buildStrictNotionQualificationPrompt,
  parseAndValidateNotionOutput,
} from "@/lib/prompts";
import {
  GERMANY_CITIES,
  isEligibleBusinessCandidate,
  searchLocalBusinesses,
  searchWebProspectsWithOpenRouter,
  THURINGIA_CITIES,
  type RadarCategory,
} from "@/lib/radar";
import { scanWebsite } from "@/lib/scanner";
import type {
  Lead,
  LeadPriority,
  OutreachItem,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";
import {
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeRadarCandidates,
  sanitizeStringList,
} from "@/lib/validation";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  listLeads,
  saveOutreachItem,
  upsertLead,
} from "@/lib/workspace-data";

export const maxDuration = 60;

const INDUSTRY_SEARCH_MAP: Record<
  string,
  { radarCategory: RadarCategory; label: string }
> = {
  gesundheit: { radarCategory: "gesundheit", label: "Zahnarzt- und Arztpraxen" },
  kanzlei: { radarCategory: "kanzlei", label: "Steuer- und Rechtskanzleien" },
  auto: { radarCategory: "auto", label: "Autohäuser" },
  handwerk: { radarCategory: "handwerk", label: "Handwerk" },
  bau: { radarCategory: "bau", label: "Bauunternehmen" },
  moebel: { radarCategory: "moebel", label: "Möbelhandel" },
  industrie: { radarCategory: "industrie", label: "Maschinenbau und Industrie" },
  startup: { radarCategory: "alle", label: "B2B Software und SaaS" },
};

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 49_152);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);
  const step = cleanStr(body.step, 30) || "discover_round";

  // STEP 1: Discover a batch of real German business candidates across rotating cities & industries
  if (step === "discover_round") {
    const regionPreset = cleanStr(body.regionPreset, 30) || "thueringen";
    const customCity = cleanStr(body.city, 80);
    const customKeyword = cleanStr(body.keyword, 80);
    const track: TargetTrack = body.track === "startup" ? "startup" : "kmu";
    const onlyDeDomains = body.onlyDeDomains !== false;
    const roundIndex = Math.max(0, Math.round(Number(body.roundIndex) || 0));
    const industries = sanitizeStringList(
      body.industries,
      ["handwerk", "gesundheit", "bau", "auto", "kanzlei", "industrie"],
      10,
      60,
    );
    const excludeDomains = sanitizeStringList(body.excludeDomains, [], 150, 120);

    const cityPool =
      regionPreset === "custom" && customCity
        ? [customCity]
        : regionPreset === "deutschland"
          ? GERMANY_CITIES
          : THURINGIA_CITIES;

    const chosenCity = cityPool[roundIndex % cityPool.length];
    const industryKey =
      industries[
        Math.floor(roundIndex / Math.max(cityPool.length, 1)) %
          Math.max(industries.length, 1)
      ] || "alle";
    const industrySpec = INDUSTRY_SEARCH_MAP[industryKey] ?? {
      radarCategory: "alle" as RadarCategory,
      label: customKeyword || "Mittelstand",
    };
    const effectiveKeyword = customKeyword || industrySpec.label;

    const existingLeads = await listLeads(auth.scopeKey);
    const existingNames = new Set(
      existingLeads.map((l) => l.company_name.toLowerCase()),
    );
    const existingWebsites = new Set([
      ...existingLeads
        .map((l) => (l.website_url ? normalizeDomain(l.website_url) : ""))
        .filter(Boolean),
      ...excludeDomains.map((d) => normalizeDomain(d)).filter(Boolean),
    ]);

    const candidates: RadarCandidate[] = [];
    const seenDomains = new Set<string>(existingWebsites);
    let searchModeLabel = "";
    let costUsd = 0;

    if (track === "kmu") {
      const osm = await searchLocalBusinesses({
        city: chosenCity,
        category: industrySpec.radarCategory,
        keyword: customKeyword || undefined,
        onlyWithWebsite: true,
        onlyDeDomains,
        limit: 20,
        existingNames,
        existingWebsites: seenDomains,
      }).catch(() => ({ resolvedLocation: chosenCity, candidates: [] }));

      for (const c of osm.candidates) {
        const dom = normalizeDomain(c.websiteUrl);
        if (!c.alreadyInPipeline && dom && !seenDomains.has(dom)) {
          seenDomains.add(dom);
          candidates.push(c);
        }
      }
      searchModeLabel = `OSM (${chosenCity})`;
    }

    // Use Perplexity Sonar live web search to enrich pool (especially for startups, Deutschland-wide, or sparse OSM)
    if (candidates.length < 10 && isOpenRouterConfigured()) {
      try {
        const web = await searchWebProspectsWithOpenRouter({
          scopeKey: auth.scopeKey,
          query: effectiveKeyword,
          city: chosenCity,
          track,
          onlyDeDomains,
          excludeDomains: Array.from(seenDomains).slice(0, 20),
          limit: 12,
          existingNames,
          existingWebsites: seenDomains,
        });
        costUsd += web.estimatedCostUsd;
        if (web.providerMode === "openrouter") {
          searchModeLabel =
            candidates.length > 0
              ? `${searchModeLabel} + Sonar (${chosenCity})`
              : `Sonar Websuche (${chosenCity})`;
        }
        for (const wc of web.candidates) {
          const dom = normalizeDomain(wc.websiteUrl);
          if (!wc.alreadyInPipeline && dom && !seenDomains.has(dom)) {
            seenDomains.add(dom);
            candidates.push(wc);
          }
        }
      } catch {
        // continue with OSM candidates
      }
    }

    return NextResponse.json(
      {
        city: chosenCity,
        industry: effectiveKeyword,
        candidates,
        searchModeLabel: searchModeLabel || chosenCity,
        estimatedCostEur: Number((costUsd * HARD_EUR_PER_USD_RATE).toFixed(4)),
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  // STEP 2: Fast parallel homepage triage (0 EUR AI tokens)
  if (step === "triage_batch") {
    const candidates = sanitizeRadarCandidates(body.candidates, 10);
    const onlyDeDomains = body.onlyDeDomains !== false;
    if (candidates.length === 0) {
      return NextResponse.json(
        { plausible: [], skipped: [] },
        { headers: PRIVATE_JSON_HEADERS },
      );
    }

    const checks = await Promise.allSettled(
      candidates.map(async (c) => {
        if (
          !isEligibleBusinessCandidate({
            companyName: c.companyName,
            websiteUrl: c.websiteUrl,
            onlyDeDomains,
          })
        ) {
          throw new Error("Ausgeschlossen (Domain-/Branchenfilter)");
        }
        const res = await scanWebsite(c.websiteUrl, {
          includePageSpeed: false,
          deepSubpages: false,
          timeoutMs: 4200,
        });
        if (res.scan.statusCode >= 400 || res.scan.visibleSummary.length < 120) {
          throw new Error(`Website nicht sinnvoll auswertbar (HTTP ${res.scan.statusCode})`);
        }
        if (onlyDeDomains && !normalizeDomain(res.scan.finalUrl).endsWith(".de")) {
          throw new Error("Finale URL endet nicht auf .de");
        }
        if (isHistoricalNotionLead(c.companyName, res.scan.finalUrl)) {
          throw new Error("Bereits in Notion-Historie enthalten");
        }
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
            decisionMaker: res.scan.decisionMakerHint ?? "",
            postalAddress: c.postalAddress || res.scan.extractedAddressHint || "",
            contactEmail: c.contactEmail || res.scan.extractedEmails[0] || "",
            contactPhone: c.contactPhone || res.scan.extractedPhones[0] || "",
          },
          score,
          topFinding: res.findings[0]?.title ?? "Basis-Prüfung OK",
        };
      }),
    );

    const plausible: Array<{
      candidate: RadarCandidate;
      score: number;
      topFinding: string;
    }> = [];
    const skipped: Array<{ companyName: string; reason: string }> = [];

    checks.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        plausible.push(res.value);
      } else {
        skipped.push({
          companyName: candidates[idx]?.companyName ?? "Unbekannt",
          reason:
            res.reason instanceof Error
              ? res.reason.message
              : "Nicht erreichbar",
        });
      }
    });

    plausible.sort((a, b) => b.score - a.score);

    return NextResponse.json(
      { plausible, skipped },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  // STEP 3: Deep multi-page verification + strict 5-condition Notion Qualification + Formal E-Mail & Brief
  if (step === "qualify_one") {
    const candidates = sanitizeRadarCandidates(
      body.candidate ? [body.candidate] : [],
      1,
    );
    const candidate = candidates[0];
    if (!candidate || !candidate.websiteUrl) {
      return NextResponse.json(
        { error: "Ungültiger Kandidat." },
        { status: 400, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const track: TargetTrack = body.track === "startup" ? "startup" : "kmu";
    const strictMode = body.strictMode !== false;

    let scanResult: Awaited<ReturnType<typeof scanWebsite>>;
    try {
      scanResult = await scanWebsite(candidate.websiteUrl, {
        includePageSpeed: false,
        deepSubpages: true,
        timeoutMs: 4800,
      });
    } catch (err) {
      return NextResponse.json(
        {
          qualified: false,
          companyName: candidate.companyName,
          websiteUrl: candidate.websiteUrl,
          rejectionReason:
            err instanceof Error
              ? err.message
              : "Website konnte nicht stabil geladen werden.",
          estimatedCostEur: 0,
        },
        { headers: PRIVATE_JSON_HEADERS },
      );
    }

    const decisionMaker =
      scanResult.scan.decisionMakerHint || "";
    const postalAddress =
      candidate.postalAddress || scanResult.scan.extractedAddressHint || "";
    const contactEmail =
      candidate.contactEmail || scanResult.scan.extractedEmails[0] || "";
    const contactPhone =
      candidate.contactPhone || scanResult.scan.extractedPhones[0] || "";

    const draftLead: Lead = {
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      company_name: candidate.companyName,
      industry: candidate.industry || "Mittelstand",
      target_track: track,
      city: candidate.city || brand.city || "",
      postal_address: postalAddress,
      website_url: scanResult.scan.finalUrl,
      decision_maker: decisionMaker,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      source: "notion_radar",
      priority: scanResult.suggestedPriority,
      status: "neu",
      contact_channel:
        decisionMaker && postalAddress ? "brief" : contactEmail ? "email" : "brief",
      first_contact_at: null,
      next_follow_up_at: null,
      visual_checked_desktop: false,
      visual_checked_mobile: false,
      visual_notes: "",
      research_summary: "",
      findings: scanResult.findings,
      buying_signals: [],
      score_reason: "",
      relaunch_benefit: "",
      follow_up_note: "",
      scan_data: scanResult.scan,
      pitch_angle: scanResult.suggestedPitchAngle,
      letter_printed_at: null,
      found_at: new Date().toISOString(),
      is_sample: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const piiContext = {
      contactEmail: draftLead.contact_email,
      contactPhone: draftLead.contact_phone,
    };

    const aiRes = await runAiTask({
      scopeKey: auth.scopeKey,
      taskType: "notion_qualify_and_write",
      model: brand.openrouter_config.writingModel,
      systemPrompt: buildLinkifySystemPrompt(brand),
      userPrompt: buildStrictNotionQualificationPrompt({
        brand,
        lead: draftLead,
      }),
      temperature: 0.2,
      maxTokens: 1800,
      reasoningEffort: "low",
      privacyMode: true,
      piiContext,
      summaryLabel: `Qualifizierung & Brief/Mail: ${draftLead.company_name}`,
      fallbackFn: () => {
        const emailFb = buildFallbackOutreach({
          brand,
          lead: draftLead,
          channel: "email",
        });
        const letterFb = buildFallbackOutreach({
          brand,
          lead: draftLead,
          channel: "brief",
        });
        const realBusinessHard = scanResult.findings.filter(
          (f) =>
            f.severity === "hoch" &&
            !/viewport|meta-tag|response/i.test(f.title),
        );
        const hasTwoHard = realBusinessHard.length >= 2;
        return JSON.stringify({
          qualified: hasTwoHard || !strictMode,
          rejectionReason:
            hasTwoHard || !strictMode
              ? ""
              : "Im lokalen Modus ohne OpenRouter-Key wurden weniger als 2 harte geschäftliche Signale erkannt.",
          decisionMaker: draftLead.decision_maker,
          salutationGender: "unbekannt",
          postalAddress: draftLead.postal_address,
          contactEmail: draftLead.contact_email,
          contactPhone: draftLead.contact_phone,
          score: scanResult.suggestedPriority === "heiss" ? "heiss" : "warm",
          contactChannel: draftLead.contact_channel,
          kurzprofil: `${draftLead.company_name} aus ${draftLead.city || "Deutschland"} (${draftLead.industry}) betreibt einen eigenen Webauftritt unter ${draftLead.website_url}.`,
          relaunchBenefit:
            "Ein vollständiger Relaunch ordnet Leistungen, Vertrauen und Bewerbungswege auf dem Stand von heute.",
          scoreReason:
            "Sichtbare geschäftliche Befunde belegen strukturellen Nachholbedarf.",
          hardSignals: scanResult.findings.slice(0, 3),
          buyingSignals: scanResult.scan.hasHiringSignal
            ? [
                {
                  strength: "moderat",
                  signal: "Aktive Stellenangebote",
                  evidence: "Offene Positionen oder Karrierebereich erkannt.",
                  sourceUrl: draftLead.website_url,
                },
              ]
            : [
                {
                  strength: "moderat",
                  signal: "Etablierter Fachbetrieb",
                  evidence: "Erklärungsbedürftige Leistungen mit direkter Kundenanfrage.",
                  sourceUrl: draftLead.website_url,
                },
                {
                  strength: "moderat",
                  signal: "Relevanz für Anfragen",
                  evidence: "Website dient direkt der Kontaktaufnahme.",
                  sourceUrl: draftLead.website_url,
                },
              ],
          followUpNote: `${draftLead.decision_maker || "Geschäftsführung"} nach 8 bis 10 Tagen kurz auf den Befund ansprechen.`,
          emailSubject: emailFb.subject,
          emailBody: emailFb.body,
          letterSubject: letterFb.subject,
          letterBody: letterFb.body,
        });
      },
    });

    const costEur = Number(
      (aiRes.estimatedCostUsd * HARD_EUR_PER_USD_RATE).toFixed(4),
    );

    const validated = parseAndValidateNotionOutput({
      rawJsonText: aiRes.text,
      lead: draftLead,
      brand,
    });

    if (!validated) {
      return NextResponse.json(
        {
          qualified: false,
          companyName: draftLead.company_name,
          websiteUrl: draftLead.website_url,
          rejectionReason: "KI-Ausgabe konnte nicht strukturiert geprüft werden.",
          limitBlockedReason: aiRes.limitBlockedReason,
          estimatedCostEur: costEur,
        },
        { headers: PRIVATE_JSON_HEADERS },
      );
    }

    if (!validated.qualified && strictMode) {
      return NextResponse.json(
        {
          qualified: false,
          companyName: draftLead.company_name,
          websiteUrl: draftLead.website_url,
          rejectionReason: validated.rejectionReason,
          limitBlockedReason: aiRes.limitBlockedReason,
          estimatedCostEur: costEur,
        },
        { headers: PRIVATE_JSON_HEADERS },
      );
    }

    const finalPriority: LeadPriority =
      validated.score === "heiss" ? "heiss" : "warm";

    const savedLead = await upsertLead({
      id: draftLead.id,
      owner_sub: draftLead.owner_sub,
      company_name: draftLead.company_name,
      industry: draftLead.industry,
      target_track: draftLead.target_track,
      city: draftLead.city,
      postal_address: validated.postalAddress || draftLead.postal_address,
      website_url: draftLead.website_url,
      decision_maker: validated.decisionMaker || draftLead.decision_maker,
      contact_email: validated.contactEmail || draftLead.contact_email,
      contact_phone: validated.contactPhone || draftLead.contact_phone,
      source: draftLead.source,
      priority: finalPriority,
      status: "neu",
      contact_channel: validated.contactChannel,
      first_contact_at: null,
      next_follow_up_at: null,
      visual_checked_desktop: false,
      visual_checked_mobile: false,
      visual_notes: "",
      research_summary: validated.kurzprofil || draftLead.research_summary,
      findings:
        validated.findings.length > 0
          ? validated.findings
          : draftLead.findings,
      buying_signals: validated.buyingSignals,
      score_reason: validated.scoreReason,
      relaunch_benefit: validated.relaunchBenefit,
      follow_up_note: validated.followUpNote,
      scan_data: draftLead.scan_data,
      pitch_angle: validated.relaunchBenefit || draftLead.pitch_angle,
      letter_printed_at: null,
      found_at: new Date().toISOString(),
      is_sample: false,
    });

    const [briefItem, emailItem]: [OutreachItem, OutreachItem] =
      await Promise.all([
        saveOutreachItem({
          id: crypto.randomUUID(),
          owner_sub: auth.scopeKey,
          lead_id: savedLead.id,
          channel: "brief",
          subject: validated.letterSubject,
          body: validated.letterBody,
          notes: `Notion-Qualifizierung (${aiRes.modelUsed})`,
          status: "entwurf",
          model_used: aiRes.modelUsed,
          privacy_masked: true,
        }),
        saveOutreachItem({
          id: crypto.randomUUID(),
          owner_sub: auth.scopeKey,
          lead_id: savedLead.id,
          channel: "email",
          subject: validated.emailSubject,
          body: validated.emailBody,
          notes: `Notion-Qualifizierung (${aiRes.modelUsed})`,
          status: "entwurf",
          model_used: aiRes.modelUsed,
          privacy_masked: true,
        }),
      ]);

    return NextResponse.json(
      {
        qualified: true,
        lead: savedLead,
        briefItem,
        emailItem,
        aiModelUsed: aiRes.modelUsed,
        limitBlockedReason: aiRes.limitBlockedReason,
        estimatedCostEur: costEur,
      },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  }

  return NextResponse.json(
    { error: "Unbekannter Autopilot-Schritt." },
    { status: 400, headers: PRIVATE_JSON_HEADERS },
  );
}
