"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Printer,
  Rocket,
  ShieldCheck,
  Square,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetchJson, PRIORITY_LABELS, safeHref } from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type {
  Lead,
  OutreachItem,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";

const INDUSTRY_CHOICES = [
  { id: "handwerk", label: "Handwerk" },
  { id: "gesundheit", label: "Zahnarzt- & Arztpraxen" },
  { id: "bau", label: "Bauunternehmen" },
  { id: "auto", label: "Autohäuser" },
  { id: "kanzlei", label: "Steuer- & Rechtskanzleien" },
  { id: "moebel", label: "Möbelhandel" },
  { id: "industrie", label: "Maschinenbau & Industrie" },
] as const;

const COUNT_OPTIONS = [3, 5, 10, 20, 30, 50] as const;

export function CockpitView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(snapshot.leads);

  // Order configuration ("Auf Befehl")
  const [regionPreset, setRegionPreset] = useState<
    "thueringen" | "deutschland" | "custom"
  >("thueringen");
  const [customCity, setCustomCity] = useState(snapshot.brand.city || "Erfurt");
  const [customKeyword, setCustomKeyword] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([
    "handwerk",
    "gesundheit",
    "bau",
    "auto",
    "kanzlei",
    "industrie",
  ]);
  const [track, setTrack] = useState<TargetTrack>("kmu");
  const [targetCount, setTargetCount] = useState<number>(5);
  const [onlyDeDomains, setOnlyDeDomains] = useState(true);
  const [strictHurdle, setStrictHurdle] = useState(true);

  // Live Funnel Run State
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runCostEur, setRunCostEur] = useState(0);
  const [discoveredTotal, setDiscoveredTotal] = useState(0);
  const [triagedTotal, setTriagedTotal] = useState(0);
  const [qualifiedLeads, setQualifiedLeads] = useState<Lead[]>([]);
  const [rejectedList, setRejectedList] = useState<
    Array<{ companyName: string; reason: string }>
  >([]);
  const cancelRef = useRef(false);

  const [monthEurLive, setMonthEurLive] = useState(
    snapshot.usageSummary.monthCostUsd *
      snapshot.brand.budget_config.eurPerUsdRate,
  );
  const budgetEur = snapshot.brand.budget_config.monthlyBudgetEur;

  const unprintedBriefLeads = leads.filter(
    (l) => !l.letter_printed_at && l.status !== "kein_interesse",
  );
  const hotCount = leads.filter((l) => l.priority === "heiss").length;
  const contactedCount = leads.filter(
    (l) =>
      l.status === "kontaktiert" ||
      l.status === "follow_up_faellig" ||
      l.status === "im_gespraech" ||
      l.status === "angebot" ||
      l.status === "gewonnen",
  ).length;

  function toggleIndustry(id: string) {
    setSelectedIndustries((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  }

  async function handleStartOrder(e: React.FormEvent) {
    e.preventDefault();
    cancelRef.current = false;
    setRunning(true);
    setErrorMsg(null);
    setQualifiedLeads([]);
    setRejectedList([]);
    setDiscoveredTotal(0);
    setTriagedTotal(0);
    setRunCostEur(0);

    const seenDomains = new Set<string>(
      leads
        .map((l) =>
          l.website_url
            .replace(/^https?:\/\/(www\.)?/i, "")
            .replace(/\/.*$/, "")
            .toLowerCase(),
        )
        .filter(Boolean),
    );

    let qualifiedCount = 0;
    let totalCheckedCandidates = 0;
    const maxCandidatesToInspect = Math.max(targetCount * 3, 18);
    const maxRounds = Math.min(Math.max(Math.ceil(targetCount / 2) + 4, 6), 30);

    for (let round = 0; round < maxRounds; round++) {
      if (cancelRef.current || qualifiedCount >= targetCount) break;
      if (totalCheckedCandidates >= maxCandidatesToInspect) break;

      setStatusLine(
        `Runde ${round + 1}: Suche neue .de-Unternehmen (${qualifiedCount}/${targetCount} qualifiziert)...`,
      );

      const disc = await apiFetchJson<{
        city: string;
        industry: string;
        candidates: RadarCandidate[];
        searchModeLabel: string;
        estimatedCostEur: number;
      }>("/api/autopilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "discover_round",
          regionPreset,
          city: customCity.trim(),
          keyword: customKeyword.trim() || undefined,
          industries: selectedIndustries,
          track,
          onlyDeDomains,
          roundIndex: round,
          excludeDomains: Array.from(seenDomains).slice(0, 120),
        }),
      });

      if (!disc.ok) {
        setErrorMsg(disc.error);
        break;
      }

      const roundCost = disc.data.estimatedCostEur || 0;
      setRunCostEur((p) => p + roundCost);
      setMonthEurLive((p) => p + roundCost);

      const freshBatch = (disc.data.candidates ?? []).filter((c) => {
        const dom = c.websiteUrl
          .replace(/^https?:\/\/(www\.)?/i, "")
          .replace(/\/.*$/, "")
          .toLowerCase();
        if (!dom || seenDomains.has(dom)) return false;
        seenDomains.add(dom);
        return true;
      });

      if (freshBatch.length === 0) {
        continue;
      }

      setDiscoveredTotal((p) => p + freshBatch.length);

      // Step 2: Triage in chunks of up to 8 URLs (0 EUR AI tokens)
      for (let i = 0; i < freshBatch.length; i += 8) {
        if (cancelRef.current || qualifiedCount >= targetCount) break;

        const slice = freshBatch.slice(i, i + 8);
        setStatusLine(
          `Prüfe ${slice.length} Websites im Schnellcheck (${disc.data.city} · 0 € KI)...`,
        );

        const triage = await apiFetchJson<{
          plausible: Array<{
            candidate: RadarCandidate;
            score: number;
            topFinding: string;
          }>;
          skipped: Array<{ companyName: string; reason: string }>;
        }>("/api/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            step: "triage_batch",
            candidates: slice,
            onlyDeDomains,
          }),
        });

        if (!triage.ok) continue;

        setTriagedTotal((p) => p + slice.length);
        if (triage.data.skipped?.length) {
          setRejectedList((prev) => [
            ...triage.data.skipped.slice(0, 5),
            ...prev,
          ].slice(0, 30));
        }

        // Step 3: Qualify each plausible candidate against the 5-condition Notion hurdle
        for (const item of triage.data.plausible ?? []) {
          if (cancelRef.current || qualifiedCount >= targetCount) break;
          if (totalCheckedCandidates >= maxCandidatesToInspect) break;
          totalCheckedCandidates += 1;

          setStatusLine(
            `Prüfe Qualifikationshürde & erstelle Brief + E-Mail für „${item.candidate.companyName}“ (${qualifiedCount}/${targetCount})...`,
          );

          const qual = await apiFetchJson<{
            qualified: boolean;
            companyName?: string;
            rejectionReason?: string;
            lead?: Lead;
            briefItem?: OutreachItem;
            emailItem?: OutreachItem;
            limitBlockedReason?: string;
            estimatedCostEur: number;
          }>("/api/autopilot", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              step: "qualify_one",
              candidate: item.candidate,
              track,
              strictMode: strictHurdle,
            }),
          });

          if (!qual.ok) {
            setRejectedList((prev) => [
              { companyName: item.candidate.companyName, reason: qual.error },
              ...prev,
            ].slice(0, 30));
            continue;
          }

          const qCost = qual.data.estimatedCostEur || 0;
          setRunCostEur((p) => p + qCost);
          setMonthEurLive((p) => p + qCost);

          if (qual.data.limitBlockedReason) {
            setErrorMsg(`Budget-Schutz aktiv: ${qual.data.limitBlockedReason}`);
            cancelRef.current = true;
            break;
          }

          if (qual.data.qualified && qual.data.lead) {
            qualifiedCount += 1;
            const newLead = qual.data.lead;
            setQualifiedLeads((prev) => [newLead, ...prev]);
            setLeads((prev) => [
              newLead,
              ...prev.filter((x) => x.id !== newLead.id),
            ]);
          } else {
            setRejectedList((prev) => [
              {
                companyName:
                  qual.data.companyName || item.candidate.companyName,
                reason:
                  qual.data.rejectionReason ||
                  "Qualifikationshürde nicht erfüllt",
              },
              ...prev,
            ].slice(0, 30));
          }
        }
      }
    }

    setStatusLine(
      cancelRef.current
        ? `Gestoppt. ${qualifiedCount} qualifizierte Leads gespeichert.`
        : `Auftrag abgeschlossen: ${qualifiedCount} von ${targetCount} gewünschten Leads qualifiziert (inkl. Brief & E-Mail).`,
    );
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            Linkify Lead-Radar & Brief-Automatisierung
          </p>
          <h1 className="mt-1 text-[28px] sm:text-[32px] font-semibold tracking-tight text-[#1A1A2E]">
            Akquise-Auftrag starten
          </h1>
          <p className="mt-1 text-[15px] text-[#6B7280] max-w-2xl">
            Suche auf Befehl nach deutschen Unternehmen mit{" "}
            <code className="text-[#1A1A2E]">.de</code>-Domain, filtere starke
            Websites hart heraus und erzeuge sofort druckfertige DIN-5008-Briefe
            und formelle E-Mails.
          </p>
        </div>

        <Link
          href="/briefe"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] text-white text-[14px] font-medium shrink-0"
        >
          <Printer className="w-4 h-4" />
          <span>Briefstudio ({unprintedBriefLeads.length} druckbereit)</span>
        </Link>
      </div>

      {/* Key Stats Bar */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-[#E5E7EB] py-5">
        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Druckbereite Briefe
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#0000F5]">
            {unprintedBriefLeads.length}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Qualifizierte Leads (Heiß)
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {leads.length}{" "}
            <span className="text-[13px] font-normal text-[#6B7280]">
              ({hotCount} Heiß)
            </span>
          </p>
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#6B7280]">
            Gedruckt / Kontaktiert
          </p>
          <p className="mt-1 text-[24px] font-semibold text-[#1A1A2E]">
            {contactedCount}
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

      {/* Main Command Form */}
      <form
        onSubmit={handleStartOrder}
        className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0000F5] text-white flex items-center justify-center shrink-0">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
                Neuer Such- & Qualifizierungs-Auftrag
              </h2>
              <p className="text-[13px] text-[#6B7280]">
                Bereits kontaktierte Firmen aus deinem Notion-Export (38
                Domains) sowie laufende Pipeline-Leads werden automatisch
                ausgeschlossen.
              </p>
            </div>
          </div>
          <span className="text-[12px] font-medium px-3 py-1 rounded-full bg-[#F0F3FF] text-[#0000F5] shrink-0">
            Briefing-KI: {snapshot.brand.openrouter_config.writingModel}
          </span>
        </div>

        {/* Region, Count, Track */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Suchgebiet
            </label>
            <select
              value={regionPreset}
              onChange={(e) =>
                setRegionPreset(
                  e.target.value as "thueringen" | "deutschland" | "custom",
                )
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
            >
              <option value="thueringen">Ganz Thüringen (18 Städte)</option>
              <option value="deutschland">Ganz Deutschland (38 Städte)</option>
              <option value="custom">Bestimmte Stadt / Region</option>
            </select>
          </div>

          {regionPreset === "custom" ? (
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Stadt / Region
              </label>
              <input
                type="text"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                placeholder="z. B. Leipzig, Erfurt, Jena"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px]"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Spezifischer Suchfokus (optional)
              </label>
              <input
                type="text"
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                placeholder="leer = rotierende Zielbranchen"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px]"
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Zielgruppe
            </label>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as TargetTrack)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
            >
              <option value="kmu">KMU, Praxen, Handwerk & Bau (5–50 MA)</option>
              <option value="startup">Startups & Software-Teams</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Anzahl qualifizierter Leads
            </label>
            <select
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px] font-medium"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} qualifizierte Unternehmen
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Industry Multi-Select */}
        {track === "kmu" && !customKeyword.trim() && (
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-[#6B7280]">
              Aktive Zielbranchen (rotieren automatisch pro Suchrunde):
            </p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRY_CHOICES.map((ind) => {
                const active = selectedIndustries.includes(ind.id);
                return (
                  <button
                    key={ind.id}
                    type="button"
                    onClick={() => toggleIndustry(ind.id)}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-[#F0F3FF] text-[#0000F5] border border-[#0000F5]/30"
                        : "bg-[#F8F9FC] text-[#6B7280] border border-[#E5E7EB]"
                    }`}
                  >
                    {ind.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quality & Domain Switches */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E5E7EB]">
          <div className="flex flex-wrap gap-5">
            <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyDeDomains}
                onChange={(e) => setOnlyDeDomains(e.target.checked)}
                className="accent-[#0000F5]"
              />
              <span>Nur Unternehmen mit .de-Domain</span>
            </label>

            <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
              <input
                type="checkbox"
                checked={strictHurdle}
                onChange={(e) => setStrictHurdle(e.target.checked)}
                className="accent-[#0000F5]"
              />
              <span>
                Strenge 5-Punkte-Qualifikationshürde (starke Websites
                ausschließen)
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#6B7280] inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0000F5]" />
              ca. {(targetCount * 0.002).toFixed(2)}–{(targetCount * 0.006).toFixed(2)} €
            </span>

            {running ? (
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[14px] font-medium cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stoppen</span>
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] text-white text-[14px] font-medium cursor-pointer"
              >
                <span>{targetCount} Leads + Briefe erzeugen</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Live Funnel Status */}
      {(running || statusLine || errorMsg) && (
        <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-[14px] font-medium text-[#1A1A2E]">
              {running ? (
                <Loader2 className="w-4 h-4 text-[#0000F5] animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              )}
              <span>{statusLine}</span>
            </div>
            <span className="text-[12px] font-medium text-[#0000F5]">
              Laufkosten: {runCostEur.toFixed(4)} €
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8F9FC] rounded-xl p-4 text-[13px]">
            <div>
              <span className="text-[#6B7280] block text-[11px]">
                Kandidaten gefunden
              </span>
              <span className="font-semibold text-[#1A1A2E]">
                {discoveredTotal}
              </span>
            </div>
            <div>
              <span className="text-[#6B7280] block text-[11px]">
                Websites vorgeprüft (0 €)
              </span>
              <span className="font-semibold text-[#1A1A2E]">
                {triagedTotal}
              </span>
            </div>
            <div>
              <span className="text-[#6B7280] block text-[11px]">
                Qualifiziert (Brief + E-Mail)
              </span>
              <span className="font-semibold text-[#0000F5]">
                {qualifiedLeads.length} / {targetCount}
              </span>
            </div>
            <div>
              <span className="text-[#6B7280] block text-[11px]">
                Ausgeschlossen / Verworfen
              </span>
              <span className="font-semibold text-[#6B7280]">
                {rejectedList.length}
              </span>
            </div>
          </div>

          {errorMsg && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {errorMsg}
            </p>
          )}

          {qualifiedLeads.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-[15px] font-semibold text-[#1A1A2E]">
                  Neu qualifizierte Leads ({qualifiedLeads.length})
                </h3>
                <Link
                  href="/briefe"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0000F5] text-white text-[13px] font-medium"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Jetzt im Briefstudio drucken / herunterladen</span>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {qualifiedLeads.map((l) => {
                  const siteHref = safeHref(l.website_url);
                  return (
                    <div
                      key={l.id}
                      className="rounded-xl border border-[#E5E7EB] p-4 hover:border-[#0000F5] transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/pipeline/${l.id}`}
                          className="font-semibold text-[14px] text-[#1A1A2E] hover:text-[#0000F5] truncate"
                        >
                          {l.company_name}
                        </Link>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              l.priority === "heiss"
                                ? "bg-[#F0F3FF] text-[#0000F5]"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {PRIORITY_LABELS[l.priority]}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#1A1A2E]">
                            {l.contact_channel === "brief" ? "Brief" : "E-Mail"}
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-[#6B7280] truncate">
                        {l.city} · {l.decision_maker || "Entscheider offen"} ·{" "}
                        {l.findings.length} harte Signale
                      </p>
                      <p className="text-[12px] text-[#1A1A2E] line-clamp-2">
                        {l.findings[0]?.title}
                        {l.findings[0]?.quote ? ` („${l.findings[0].quote}“)` : ""}
                      </p>
                      <div className="pt-1 flex items-center justify-between gap-3 text-[12px]">
                        {siteHref ? (
                          <a
                            href={siteHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-[#0000F5] hover:underline truncate"
                          >
                            <span>Website prüfen</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-[#6B7280]">Keine URL</span>
                        )}
                        <Link
                          href={`/pipeline/${l.id}`}
                          className="text-[#6B7280] hover:text-[#1A1A2E] shrink-0"
                        >
                          Dossier öffnen →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rejectedList.length > 0 && (
            <details className="pt-2 text-[12px] text-[#6B7280]">
              <summary className="cursor-pointer font-medium text-[#1A1A2E]">
                Ausgeschlossene Kandidaten ansehen ({rejectedList.length})
              </summary>
              <div className="mt-2 space-y-1 max-h-44 overflow-y-auto">
                {rejectedList.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-[#6B7280] mt-0.5 shrink-0" />
                    <span>
                      <strong className="text-[#1A1A2E]">
                        {r.companyName}:
                      </strong>{" "}
                      {r.reason}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/briefe"
          className="rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#0000F5]/40 p-5 flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <p className="text-[15px] font-semibold text-[#1A1A2E]">
              Brief- & Druckstudio
            </p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              DIN-5008-Briefe als Sammel-PDF drucken oder als Pages-DOCX laden.
            </p>
          </div>
          <Printer className="w-5 h-5 text-[#0000F5] shrink-0" />
        </Link>

        <Link
          href="/outreach"
          className="rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#0000F5]/40 p-5 flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <p className="text-[15px] font-semibold text-[#1A1A2E]">
              E-Mail-Pitches
            </p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Alle formellen E-Mail-Entwürfe & 8–10-Tage-Follow-ups im Blick.
            </p>
          </div>
          <Mail className="w-5 h-5 text-[#0000F5] shrink-0" />
        </Link>

        <Link
          href="/pipeline"
          className="rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#0000F5]/40 p-5 flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <p className="text-[15px] font-semibold text-[#1A1A2E]">
              Lead-Pipeline & Notion
            </p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Befunde, Zitate, Quellen, CSV-Import und Notion-Export verwalten.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-[#0000F5] shrink-0" />
        </Link>
      </div>
    </div>
  );
}
