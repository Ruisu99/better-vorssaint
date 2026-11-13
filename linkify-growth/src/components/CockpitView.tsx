"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  Globe,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  apiFetchJson,
  formatBerlinDate,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type {
  Lead,
  LeadPriority,
  OutreachItem,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";

const PRESET_TOPICS: Array<{ label: string; query: string; track: TargetTrack }> = [
  { label: "Handwerk", query: "Handwerk", track: "kmu" },
  { label: "Praxen & Gesundheit", query: "Gesundheit", track: "kmu" },
  { label: "Kanzleien", query: "Kanzlei", track: "kmu" },
  { label: "Autohäuser & Bau", query: "Bauunternehmen", track: "kmu" },
  { label: "B2B SaaS / Startups", query: "B2B SaaS Plattform", track: "startup" },
];

export function CockpitView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(snapshot.leads);

  // 1-Click Step-by-Step Auto-Pilot state (fast atomic calls, never times out)
  const [autoTrack, setAutoTrack] = useState<TargetTrack>("kmu");
  const [autoCity, setAutoCity] = useState(snapshot.brand.city || "Erfurt");
  const [autoQuery, setAutoQuery] = useState("Handwerk");
  const [autoCount, setAutoCount] = useState(3);
  const [autoOutreach, setAutoOutreach] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoStatusText, setAutoStatusText] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoCostEur, setAutoCostEur] = useState(0);
  const [autoModeLabel, setAutoModeLabel] = useState<string | null>(null);
  const [autoCreated, setAutoCreated] = useState<
    Array<{
      lead: Lead;
      outreachItems: OutreachItem[];
      aiModelUsed: string;
    }>
  >([]);
  const cancelRef = useRef(false);

  // Quick URL scan state
  const [quickUrl, setQuickUrl] = useState("");
  const [runAi, setRunAi] = useState(snapshot.openRouterConnected);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const [monthEurLive, setMonthEurLive] = useState(
    snapshot.usageSummary.monthCostUsd *
      snapshot.brand.budget_config.eurPerUsdRate,
  );
  const budgetEur = snapshot.brand.budget_config.monthlyBudgetEur;

  const activeLeads = leads.filter((l) => l.status !== "kein_interesse");
  const kmuCount = activeLeads.filter((l) => l.target_track === "kmu").length;
  const startupCount = activeLeads.filter(
    (l) => l.target_track === "startup",
  ).length;
  const contactedCount = leads.filter(
    (l) =>
      l.status === "kontaktiert" ||
      l.status === "follow_up_faellig" ||
      l.status === "im_gespraech" ||
      l.status === "angebot" ||
      l.status === "gewonnen",
  ).length;
  const callsOrOffers = leads.filter(
    (l) =>
      l.status === "im_gespraech" ||
      l.status === "angebot" ||
      l.status === "gewonnen",
  ).length;
  const visuallyCheckedCount = leads.filter(
    (l) => l.visual_checked_desktop && l.visual_checked_mobile,
  ).length;

  const pendingVisualChecks = leads.filter(
    (l) =>
      l.website_url &&
      (!l.visual_checked_desktop || !l.visual_checked_mobile) &&
      l.status !== "kein_interesse",
  );

  // Prioritize due follow-ups & hot leads, then fall back to newest leads so Cockpit is always actionable
  const nowMs = Date.now();
  const priorityLeads = [...leads]
    .filter((l) => l.status !== "kein_interesse" && l.status !== "gewonnen")
    .sort((a, b) => {
      const aDue =
        a.status === "follow_up_faellig" ||
        (a.next_follow_up_at &&
          new Date(a.next_follow_up_at).getTime() <= nowMs)
          ? 0
          : 1;
      const bDue =
        b.status === "follow_up_faellig" ||
        (b.next_follow_up_at &&
          new Date(b.next_follow_up_at).getTime() <= nowMs)
          ? 0
          : 1;
      if (aDue !== bDue) return aDue - bDue;
      const pWeight = (p: LeadPriority) =>
        p === "heiss" ? 0 : p === "warm" ? 1 : 2;
      if (pWeight(a.priority) !== pWeight(b.priority))
        return pWeight(a.priority) - pWeight(b.priority);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, 6);

  async function handleAutopilot(e: React.FormEvent) {
    e.preventDefault();
    cancelRef.current = false;
    setAutoRunning(true);
    setAutoError(null);
    setAutoCreated([]);
    setAutoCostEur(0);
    setAutoModeLabel(null);

    const effectiveCity = autoCity.trim() || snapshot.brand.city || "Erfurt";
    const effectiveQuery =
      autoQuery.trim() ||
      (autoTrack === "startup" ? "B2B SaaS Plattform" : "Handwerk");

    // Step 1: Fast Discovery
    setAutoStatusText(
      `Schritt 1/3: Suche passende Unternehmen für "${effectiveQuery}" in ${effectiveCity}...`,
    );
    const step1 = await apiFetchJson<{
      candidates: RadarCandidate[];
      searchModeLabel: string;
      estimatedCostEur: number;
    }>("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        step: "discover",
        track: autoTrack,
        city: effectiveCity,
        query: effectiveQuery,
        count: autoCount,
      }),
    });

    if (!step1.ok) {
      setAutoError(step1.error);
      setAutoStatusText(null);
      setAutoRunning(false);
      return;
    }

    let runningCost = step1.data.estimatedCostEur || 0;
    setAutoCostEur(runningCost);
    setAutoModeLabel(step1.data.searchModeLabel);

    if (cancelRef.current) {
      setAutoStatusText("Autopilot gestoppt.");
      setAutoRunning(false);
      return;
    }

    // Step 2: Parallel fast website triage (0 EUR)
    const foundCount = step1.data.candidates.length;
    setAutoStatusText(
      `Schritt 2/3: Prüfe ${foundCount} Websites parallel auf Technik & Relaunch-Bedarf (0 €)...`,
    );
    const step2 = await apiFetchJson<{
      scannedCount: number;
      reachable: Array<{
        candidate: RadarCandidate;
        score: number;
        priority: LeadPriority;
        cms: string;
        topFinding: string;
      }>;
    }>("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        step: "scan_batch",
        candidates: step1.data.candidates.slice(0, 8),
      }),
    });

    if (!step2.ok) {
      setAutoError(step2.error);
      setAutoStatusText(null);
      setAutoRunning(false);
      return;
    }

    const targets = step2.data.reachable.slice(0, autoCount);
    let lastBlocked: string | undefined;

    // Step 3: Process one lead per fast API call (qualify + outreach in parallel)
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const current = targets[i];
      setAutoStatusText(
        `Schritt 3/3: Analysiere & erstelle Akquise für "${current.candidate.companyName}" (${i + 1}/${targets.length})...`,
      );

      const step3 = await apiFetchJson<{
        lead: Lead;
        outreachItems: OutreachItem[];
        aiModelUsed: string;
        limitBlockedReason?: string;
        estimatedCostEur: number;
      }>("/api/autopilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "process_one",
          candidate: current.candidate,
          track: autoTrack,
          generateOutreach: autoOutreach,
        }),
      });

      if (!step3.ok) {
        setAutoError(
          `Fehler bei ${current.candidate.companyName}: ${step3.error}`,
        );
        continue;
      }

      runningCost += step3.data.estimatedCostEur || 0;
      setAutoCostEur(runningCost);
      setMonthEurLive((prev) => prev + (step3.data.estimatedCostEur || 0));
      if (step3.data.limitBlockedReason) {
        lastBlocked = step3.data.limitBlockedReason;
      }

      setAutoCreated((prev) => [
        ...prev,
        {
          lead: step3.data.lead,
          outreachItems: step3.data.outreachItems ?? [],
          aiModelUsed: step3.data.aiModelUsed,
        },
      ]);
      setLeads((prev) => [
        step3.data.lead,
        ...prev.filter((l) => l.id !== step3.data.lead.id),
      ]);
    }

    setAutoStatusText(
      lastBlocked
        ? `Fertig (Budget-Stopp aktiv: ${lastBlocked}).`
        : cancelRef.current
          ? "Autopilot angehalten – bereits erstellte Leads wurden gespeichert."
          : `Fertig: ${targets.length} Leads geprüft und inkl. Entwürfen gespeichert.`,
    );
    setAutoRunning(false);
    router.refresh();
  }

  async function handleQuickScan(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    setScanNotice(null);

    const res = await apiFetchJson<{
      lead: Lead;
      aiMeta?: {
        providerMode: string;
        modelUsed: string;
        limitBlockedReason?: string;
        estimatedCostUsd: number;
      } | null;
    }>("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: quickUrl.trim(),
        includePageSpeed: false,
        runAiQualification: runAi,
        saveToPipeline: true,
      }),
    });

    setScanning(false);
    if (!res.ok) {
      setScanError(res.error);
      return;
    }

    setLeads((prev) => [
      res.data.lead,
      ...prev.filter((item) => item.id !== res.data.lead.id),
    ]);
    if (res.data.aiMeta?.estimatedCostUsd) {
      setMonthEurLive(
        (prev) =>
          prev +
          res.data.aiMeta!.estimatedCostUsd *
            snapshot.brand.budget_config.eurPerUsdRate,
      );
    }
    setQuickUrl("");
    const aiHint = res.data.aiMeta?.limitBlockedReason
      ? ` (${res.data.aiMeta.limitBlockedReason})`
      : res.data.aiMeta?.providerMode === "openrouter"
        ? ` (KI-Analyse via ${res.data.aiMeta.modelUsed})`
        : " (Technischer Scan – 0,00 € KI-Kosten)";
    setScanNotice(
      `"${res.data.lead.company_name}" geprüft und gespeichert${aiHint}.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            {snapshot.brand.brand_name} Akquise-System · {snapshot.brand.city}
          </p>
          <h1 className="mt-1 text-[28px] sm:text-[32px] font-semibold tracking-tight text-[#1A1A2E]">
            Guten Tag, {snapshot.brand.owner_name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-[15px] text-[#6B7280] max-w-2xl">
            Finde automatisch passende Unternehmen oder Startups, prüfe ihre
            Websites live und bereite persönliche Akquise-Entwürfe mit harter
            15-€-Kostenkontrolle vor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/radar"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#E5E7EB] bg-white hover:border-[#0000F5] text-[#1A1A2E] text-[14px] font-medium transition-colors"
          >
            <span>Zum Kunden-Radar</span>
            <ArrowRight className="w-4 h-4 text-[#0000F5]" />
          </Link>
        </div>
      </div>

      {/* 1-Click Autonomous Acquisition Engine */}
      <section className="rounded-2xl bg-white border border-[#0000F5]/25 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0000F5] text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
                1-Klick KI-Akquise-Autopilot
              </h2>
              <p className="text-[13px] text-[#6B7280]">
                Sucht in schnellen Einzelschritten reale Unternehmen, scannt
                Websites parallel, qualifiziert mit{" "}
                <strong>{snapshot.brand.openrouter_config.researchModel}</strong>{" "}
                und erstellt fertige E-Mail- & Video-Audit-Entwürfe.
              </p>
            </div>
          </div>
          <span className="text-[12px] font-medium px-3 py-1 rounded-full bg-[#F0F3FF] text-[#0000F5] shrink-0">
            ca. 0,005–0,03 € pro Lauf
          </span>
        </div>

        {/* Clickable quick-fill presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-[#6B7280] mr-1">
            Schnellwahl:
          </span>
          {PRESET_TOPICS.map((p) => {
            const active =
              autoQuery.toLowerCase() === p.query.toLowerCase() &&
              autoTrack === p.track;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setAutoTrack(p.track);
                  setAutoQuery(p.query);
                }}
                className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#0000F5] text-white"
                    : "bg-[#F8F9FC] text-[#6B7280] hover:text-[#1A1A2E] border border-[#E5E7EB]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={handleAutopilot}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
              Zielgruppe
            </label>
            <select
              value={autoTrack}
              onChange={(e) => {
                const next = e.target.value as TargetTrack;
                setAutoTrack(next);
                if (next === "startup" && autoQuery === "Handwerk") {
                  setAutoQuery("B2B SaaS Plattform");
                } else if (next === "kmu" && autoQuery === "B2B SaaS Plattform") {
                  setAutoQuery("Handwerk");
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
            >
              <option value="kmu">Lokale KMU & Praxen</option>
              <option value="startup">Startups & Produktteams</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
              Branche / Suchfokus
            </label>
            <input
              type="text"
              value={autoQuery}
              onChange={(e) => setAutoQuery(e.target.value)}
              placeholder="z. B. Zahnarzt, Dachdecker, SaaS"
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
              Stadt / Region
            </label>
            <input
              type="text"
              value={autoCity}
              onChange={(e) => setAutoCity(e.target.value)}
              placeholder="z. B. Leipzig, Erfurt"
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
              Leads pro Lauf (1–5)
            </label>
            <select
              value={autoCount}
              onChange={(e) => setAutoCount(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
            >
              <option value={1}>1 Lead</option>
              <option value={2}>2 Leads</option>
              <option value={3}>3 Leads</option>
              <option value={5}>5 Leads (Max)</option>
            </select>
          </div>

          {autoRunning ? (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stoppen</span>
            </button>
          ) : (
            <button
              type="submit"
              className="w-full px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] text-white text-[13px] font-medium cursor-pointer"
            >
              Autopilot starten
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#6B7280]">
          <label className="inline-flex items-center gap-2 text-[#1A1A2E] cursor-pointer">
            <input
              type="checkbox"
              checked={autoOutreach}
              onChange={(e) => setAutoOutreach(e.target.checked)}
              className="accent-[#0000F5]"
            />
            <span>
              Direkt fertige Erstansprache (E-Mail + Video-Audit-Skript) für
              jeden Lead anlegen
            </span>
          </label>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0000F5]" />
            Firmen- & Kontaktdaten werden vor KI-Aufruf maskiert
          </span>
        </div>

        {autoStatusText && (
          <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB] px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex items-center gap-2 text-[#1A1A2E]">
              {autoRunning && (
                <Loader2 className="w-4 h-4 text-[#0000F5] animate-spin shrink-0" />
              )}
              <span>{autoStatusText}</span>
            </span>
            {autoModeLabel && (
              <span className="text-[11px] text-[#6B7280] shrink-0">
                {autoModeLabel}
              </span>
            )}
          </div>
        )}

        {autoError && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {autoError}
          </p>
        )}

        {autoCreated.length > 0 && (
          <div className="rounded-xl bg-[#F0F3FF] border border-[#0000F5]/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="font-semibold text-[#1A1A2E]">
                {autoCreated.length} neue Leads geprüft & gespeichert
              </span>
              <span className="text-[#0000F5] font-medium">
                Bisherige Lauf-Kosten: {autoCostEur.toFixed(4)} €
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {autoCreated.map(({ lead, outreachItems, aiModelUsed }) => (
                <Link
                  key={lead.id}
                  href={`/pipeline/${lead.id}`}
                  className="rounded-xl bg-white border border-[#E5E7EB] p-3.5 hover:border-[#0000F5] transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#1A1A2E] truncate">
                      {lead.company_name}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F0F3FF] text-[#0000F5] shrink-0">
                      {PRIORITY_LABELS[lead.priority]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] truncate">
                    {lead.scan_data?.detectedCms ?? lead.industry} ·{" "}
                    {outreachItems.length} Entwürfe ({aiModelUsed})
                  </p>
                  <p className="text-[11px] text-[#1A1A2E] line-clamp-2">
                    {lead.findings[0]?.title ?? lead.research_summary}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quick Website Scan Bar */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
              Konkrete Website sofort prüfen & als Lead anlegen
            </h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Der technische Check (HTTPS, Mobile Viewport, CMS, Impressum,
              Karriere-Signal) kostet 0,00 € KI-Tokens.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runAi}
              onChange={(e) => setRunAi(e.target.checked)}
              className="rounded border-[#E5E7EB] accent-[#0000F5]"
            />
            <Sparkles className="w-3.5 h-3.5 text-[#0000F5]" />
            <span>
              Mit KI qualifizieren (
              {snapshot.brand.openrouter_config.researchModel})
            </span>
          </label>
        </div>

        <form
          onSubmit={handleQuickScan}
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              placeholder="z. B. https://zielunternehmen.de"
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#E5E7EB] text-[14px] text-[#1A1A2E] placeholder:text-[#6B7280] focus:outline-none focus:border-[#0000F5]"
            />
          </div>
          <button
            type="submit"
            disabled={scanning || !quickUrl.trim()}
            className="px-6 py-2.5 rounded-full bg-[#1A1A2E] hover:bg-[#0000F5] disabled:opacity-50 text-white text-[14px] font-medium transition-colors cursor-pointer shrink-0"
          >
            {scanning ? "Prüfe Website..." : "Website analysieren"}
          </button>
        </form>

        {scanError && (
          <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2">
            {scanError}
          </p>
        )}
        {scanNotice && (
          <p className="mt-3 text-[13px] text-[#1A1A2E] bg-[#F0F3FF] border border-[#0000F5]/20 rounded-lg px-3.5 py-2">
            {scanNotice}
          </p>
        )}
      </section>

      {/* Open Overview Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-[#E5E7EB] py-5">
        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Aktive Leads (KMU / Startup)
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {activeLeads.length}{" "}
            <span className="text-[13px] font-normal text-[#6B7280]">
              ({kmuCount} / {startupCount})
            </span>
          </p>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Visuell geprüft (Ziel {snapshot.brand.weekly_targets.leadsChecked})
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {visuallyCheckedCount}
          </p>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Kontaktiert / Im Gespräch
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {contactedCount}{" "}
            <span className="text-[13px] font-normal text-[#0000F5]">
              ({callsOrOffers} Gespräche)
            </span>
          </p>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            KI-Kosten diesen Monat
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {monthEurLive.toFixed(2)} €{" "}
            <span className="text-[13px] font-normal text-[#6B7280]">
              / {budgetEur.toFixed(0)} € Limit
            </span>
          </p>
        </div>
      </section>

      {/* Priority Queue + Cost Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
                Aktive Leads & nächste Akquise-Schritte
              </h2>
              <Link
                href="/pipeline"
                className="text-[13px] font-medium text-[#0000F5] hover:underline"
              >
                Pipeline verwalten ({leads.length})
              </Link>
            </div>

            <div className="mt-4 divide-y divide-[#E5E7EB]">
              {priorityLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/pipeline/${lead.id}`}
                  className="py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8F9FC] -mx-3 px-3 rounded-xl transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[14px] text-[#1A1A2E] truncate">
                        {lead.company_name}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          lead.priority === "heiss"
                            ? "bg-[#F0F3FF] text-[#0000F5]"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                        }`}
                      >
                        {PRIORITY_LABELS[lead.priority]}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F8F9FC] border border-[#E5E7EB] text-[#6B7280]">
                        {STATUS_LABELS[lead.status]}
                      </span>
                      {lead.city && (
                        <span className="text-[11px] text-[#6B7280]">
                          {lead.city}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-[#6B7280] truncate">
                      {lead.pitch_angle ||
                        lead.research_summary ||
                        lead.industry}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-[12px] text-[#6B7280]">
                      {lead.next_follow_up_at
                        ? `Follow-up: ${formatBerlinDate(lead.next_follow_up_at)}`
                        : "Bereit für Entwurf"}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#0000F5]">
                      Öffnen <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}

              {priorityLeads.length === 0 && (
                <p className="py-6 text-[14px] text-[#6B7280]">
                  Noch keine Leads in der Pipeline. Starte oben den 1-Klick
                  KI-Akquise-Autopilot oder nutze das{" "}
                  <Link href="/radar" className="text-[#0000F5] underline">
                    Kunden-Radar
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1A1A2E] flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#0000F5]" />
                  <span>Wartet auf deine visuelle Prüfung (Desktop & Mobil)</span>
                </h2>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  Technische Scans liefern messbare Signale – das endgültige
                  Qualitätsurteil vor Versand oder Briefdruck liegt bei dir.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {pendingVisualChecks.slice(0, 4).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/pipeline/${lead.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] px-4 py-3 hover:border-[#0000F5]/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[#1A1A2E] truncate">
                      {lead.company_name}
                    </p>
                    <p className="text-[12px] text-[#6B7280] truncate">
                      {lead.website_url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[12px]">
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        lead.visual_checked_desktop
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      Desktop {lead.visual_checked_desktop ? "OK" : "offen"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        lead.visual_checked_mobile
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      Mobil {lead.visual_checked_mobile ? "OK" : "offen"}
                    </span>
                  </div>
                </Link>
              ))}
              {pendingVisualChecks.length === 0 && (
                <div className="flex items-center gap-2 text-[13px] text-emerald-700 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Keine offenen visuellen Prüfungen in der Warteschlange.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                KI- & Kostenkontrolle
              </h2>
              <Link
                href="/settings"
                className="text-[12px] font-medium text-[#0000F5] hover:underline inline-flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Regler
              </Link>
            </div>

            <div className="space-y-2.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">OpenRouter Status</span>
                <span className="font-medium text-[#1A1A2E]">
                  {snapshot.openRouterConnected
                    ? "Aktiv verbunden"
                    : "Lokale Vorlagen (0 €)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Tageslimit</span>
                <span className="font-medium text-[#1A1A2E]">
                  {snapshot.usageSummary.todayCalls} /{" "}
                  {snapshot.brand.budget_config.dailyMaxCalls} Anfragen
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Harter Kosten-Stopp</span>
                <span className="font-medium text-[#0000F5]">
                  Serverseitig aktiv
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Analyse-Modell</span>
                <span className="font-medium text-[#1A1A2E] truncate max-w-[140px]">
                  {snapshot.brand.openrouter_config.researchModel}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#E5E7EB]">
                <span className="text-[#6B7280] inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0000F5]" />
                  Privacy-Maskierung
                </span>
                <span className="font-medium text-[#0000F5]">Immer aktiv</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-3">
            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
              Schnellzugriff
            </h2>
            <div className="pt-1 flex flex-col gap-2">
              <Link
                href="/outreach"
                className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl border border-[#E5E7EB] hover:border-[#0000F5]/40 text-[13px] font-medium text-[#1A1A2E]"
              >
                <span>Akquise & Kundenantworten</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#0000F5]" />
              </Link>
              <Link
                href="/content"
                className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl border border-[#E5E7EB] hover:border-[#0000F5]/40 text-[13px] font-medium text-[#1A1A2E]"
              >
                <span>Content- & Wochen-Paket</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#0000F5]" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
