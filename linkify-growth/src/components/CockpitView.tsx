"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Globe,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  formatBerlinDate,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type { Lead } from "@/lib/types";

export function CockpitView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(snapshot.leads);
  const [quickUrl, setQuickUrl] = useState("");
  const [runAi, setRunAi] = useState(snapshot.openRouterConnected);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [clearingSamples, setClearingSamples] = useState(false);

  const hasSamples = leads.some((l) => l.is_sample);
  const nowMs = Date.now();

  const dueFollowUps = leads.filter(
    (l) =>
      l.status === "follow_up_faellig" ||
      (l.next_follow_up_at &&
        new Date(l.next_follow_up_at).getTime() <= nowMs &&
        l.status !== "gewonnen" &&
        l.status !== "kein_interesse"),
  );

  const pendingVisualChecks = leads.filter(
    (l) =>
      l.website_url &&
      (!l.visual_checked_desktop || !l.visual_checked_mobile) &&
      l.status !== "kein_interesse",
  );

  const hotReadyLeads = leads.filter(
    (l) =>
      l.priority === "heiss" &&
      (l.status === "neu" || l.status === "analysiert"),
  );

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

  const monthEur =
    snapshot.usageSummary.monthCostUsd *
    snapshot.brand.budget_config.eurPerUsdRate;
  const budgetEur = snapshot.brand.budget_config.monthlyBudgetEur;

  async function handleQuickScan(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    setScanNotice(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: quickUrl.trim(),
          includePageSpeed: false,
          runAiQualification: runAi,
          saveToPipeline: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Website-Scan fehlgeschlagen.");
        return;
      }
      setLeads((prev) => [
        data.lead,
        ...prev.filter((item) => item.id !== data.lead.id),
      ]);
      setQuickUrl("");
      const aiHint = data.aiMeta?.limitBlockedReason
        ? ` (${data.aiMeta.limitBlockedReason})`
        : data.aiMeta?.providerMode === "openrouter"
          ? ` (KI-Analyse via ${data.aiMeta.modelUsed})`
          : " (Technischer Scan – 0,00 € KI-Kosten)";
      setScanNotice(
        `"${data.lead.company_name}" geprüft und in der Pipeline gespeichert${aiHint}.`,
      );
      router.refresh();
    } catch {
      setScanError("Netzwerkfehler beim Website-Check.");
    } finally {
      setScanning(false);
    }
  }

  async function handleClearSamples() {
    setClearingSamples(true);
    try {
      const res = await fetch("/api/workspace/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_samples" }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => !l.is_sample));
        router.refresh();
      }
    } finally {
      setClearingSamples(false);
    }
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
            Fokus auf echte Anfragen und Erstgespräche – mit kontrolliertem
            KI-Budget und klarer Trennung zwischen technischem Scan und deiner
            visuellen Prüfung.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/radar"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] text-white text-[14px] font-medium transition-colors"
          >
            <span>Neue Kunden suchen</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Demo Data Banner */}
      {hasSamples && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[13px] text-[#6B7280]">
            <span className="font-medium text-[#1A1A2E]">
              Beispieldaten aktiv:
            </span>{" "}
            Zum Einstieg sind 3 Demo-Leads und 1 Demo-Post geladen. Sobald du
            eigene Unternehmen scannst, kannst du die Demo-Einträge entfernen.
          </p>
          <button
            type="button"
            onClick={handleClearSamples}
            disabled={clearingSamples}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B7280] hover:text-[#1A1A2E] shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {clearingSamples ? "Entferne..." : "Beispieldaten entfernen"}
            </span>
          </button>
        </div>
      )}

      {/* Quick Website Scan Bar */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
              Website sofort prüfen & als Lead anlegen
            </h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Der technische Check (HTTPS, Mobile Viewport, CMS, Ladezeit,
              Impressum) kostet 0,00 € KI-Tokens.
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
              Zusätzlich mit KI qualifizieren ({snapshot.brand.openrouter_config.researchModel})
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
              placeholder="z. B. https://unternehmen-beispiel.de"
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#E5E7EB] text-[14px] text-[#1A1A2E] placeholder:text-[#6B7280] focus:outline-none focus:border-[#0000F5]"
            />
          </div>
          <button
            type="submit"
            disabled={scanning || !quickUrl.trim()}
            className="px-6 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium transition-colors cursor-pointer shrink-0"
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

      {/* Open Overview Metrics (no uniform heavy boxes, clean typographic bar) */}
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
            {monthEur.toFixed(2)} €{" "}
            <span className="text-[13px] font-normal text-[#6B7280]">
              / {budgetEur.toFixed(0)} € Limit
            </span>
          </p>
        </div>
      </section>

      {/* Priority Queue + Budget Guardrail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Due Follow-ups & Hot Leads */}
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
                Heutige Prioritäten für Akquise
              </h2>
              <Link
                href="/pipeline"
                className="text-[13px] font-medium text-[#0000F5] hover:underline"
              >
                Alle Leads
              </Link>
            </div>

            <div className="mt-4 divide-y divide-[#E5E7EB]">
              {[...dueFollowUps, ...hotReadyLeads]
                .filter(
                  (item, index, arr) =>
                    arr.findIndex((x) => x.id === item.id) === index,
                )
                .slice(0, 6)
                .map((lead) => (
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
                      </div>
                      <p className="mt-1 text-[13px] text-[#6B7280] truncate">
                        {lead.pitch_angle || lead.research_summary || lead.industry}
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

              {dueFollowUps.length === 0 && hotReadyLeads.length === 0 && (
                <p className="py-6 text-[14px] text-[#6B7280]">
                  Aktuell keine überfälligen Follow-ups. Starte eine Suche im{" "}
                  <Link href="/radar" className="text-[#0000F5] underline">
                    Kunden-Radar
                  </Link>
                  , um neue lokale Unternehmen oder Startups aufzunehmen.
                </p>
              )}
            </div>
          </section>

          {/* Luis' Visual Verification Queue */}
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1A1A2E] flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#0000F5]" />
                  <span>Wartet auf deine visuelle Prüfung (Desktop & Mobil)</span>
                </h2>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  Technische Scans zeigen messbare Signale – das endgültige
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
                  <span>Alle aktuellen Leads mit Website wurden visuell geprüft.</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Cost & AI Control Summary + Fast Actions */}
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
                    : "Vorschau-Modus (0 €)"}
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
                <span className="text-[#6B7280]">Max. Tokens / Anfrage</span>
                <span className="font-medium text-[#1A1A2E]">
                  {snapshot.brand.budget_config.maxTokensPerCall}
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
                <span className="font-medium text-[#1A1A2E]">
                  {snapshot.brand.openrouter_config.privacyMode
                    ? "Aktiv"
                    : "Deaktiviert"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-3">
            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
              Nächster sinnvoller Schritt
            </h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed">
              Kombiniere einen kurzen kostenlosen Scan im Kunden-Radar mit einem
              persönlichen 2-Minuten-Video-Audit oder einem ruhigen
              LinkedIn-Beitrag aus einem echten Projekt.
            </p>
            <div className="pt-2 flex flex-col gap-2">
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
                <span>Sichtbarkeits-Beitrag entwerfen</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#0000F5]" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
