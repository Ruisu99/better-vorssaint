"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckSquare,
  ExternalLink,
  Globe,
  Layers,
  MapPin,
  Search,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { PRIORITY_LABELS, safeHref } from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type {
  Lead,
  LeadPriority,
  RadarCandidate,
  TargetTrack,
} from "@/lib/types";

const CATEGORIES = [
  { id: "alle", label: "Alle Zielbranchen" },
  { id: "handwerk", label: "Handwerk & Betriebe" },
  { id: "gesundheit", label: "Praxen, Pflege & Gesundheit" },
  { id: "kanzlei", label: "Kanzleien, Beratung & Architektur" },
  { id: "auto", label: "Autohäuser & Kfz" },
  { id: "bau", label: "Bau & Haustechnik" },
] as const;

interface RadarPreview {
  osmId: string;
  ok: boolean;
  priority: LeadPriority;
  cms: string;
  httpsEnabled: boolean;
  hasViewport: boolean;
  responseTimeMs: number;
  topFinding: string;
  extractedEmail?: string;
  extractedPhone?: string;
}

export function RadarView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [tab, setTab] = useState<"local" | "web" | "batch" | "scanner">(
    "local",
  );

  // Local OpenStreetMap + Photon Radar state
  const [city, setCity] = useState(snapshot.brand.city || "Erfurt");
  const [category, setCategory] = useState<string>("alle");
  const [keyword, setKeyword] = useState<string>("");
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RadarCandidate[]>([]);
  const [previews, setPreviews] = useState<Record<string, RadarPreview>>({});
  const [prescanning, setPrescanning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoScanOnImport, setAutoScanOnImport] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importedLeads, setImportedLeads] = useState<Lead[]>([]);

  // Live OpenRouter Web Discovery (perplexity/sonar)
  const [webTrack, setWebTrack] = useState<TargetTrack>("startup");
  const [webCity, setWebCity] = useState("Thüringen / DACH");
  const [webQuery, setWebQuery] = useState("B2B SaaS Software Plattform");
  const [webSearching, setWebSearching] = useState(false);

  // Batch URL / Startup Track Scanner
  const [batchText, setBatchText] = useState("");
  const [batchTrack, setBatchTrack] = useState<TargetTrack>("startup");
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<
    Array<{ url: string; ok: boolean; lead?: Lead; error?: string }>
  >([]);

  // Direct Single Website + PageSpeed + AI Scanner state
  const [scanUrl, setScanUrl] = useState("");
  const [scanCompany, setScanCompany] = useState("");
  const [scanCity, setScanCity] = useState("");
  const [includePageSpeed, setIncludePageSpeed] = useState(false);
  const [runAi, setRunAi] = useState(snapshot.openRouterConnected);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    lead: Lead;
    aiMeta: {
      providerMode: string;
      modelUsed: string;
      limitBlockedReason?: string;
      autoDowngraded?: boolean;
      nextVisualCheckHints?: string[];
    } | null;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const maxBatch = snapshot.brand.budget_config.batchMaxLeads || 5;

  async function handleRadarSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    setImportedLeads([]);
    setPreviews({});
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "search",
          city,
          category,
          keyword: keyword.trim() || undefined,
          onlyWithWebsite,
          limit: 25,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Branchensuche fehlgeschlagen.");
        return;
      }
      setResolvedLocation(data.resolvedLocation ?? city);
      setCandidates(data.candidates ?? []);
      setSelectedIds(new Set());
    } catch {
      setSearchError("Verbindung zur Branchensuche fehlgeschlagen.");
    } finally {
      setSearching(false);
    }
  }

  async function handleLiveWebSearch(e: React.FormEvent) {
    e.preventDefault();
    setWebSearching(true);
    setSearchError(null);
    setImportedLeads([]);
    setPreviews({});
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "web_search",
          track: webTrack,
          city: webCity.trim() || "Deutschland",
          keyword: webQuery.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "KI-Websuche fehlgeschlagen.");
        return;
      }
      if (data.limitBlockedReason) {
        setSearchError(`Budget-Limit aktiv: ${data.limitBlockedReason}`);
      } else if (data.providerMode === "local_fallback") {
        setSearchError(
          "OpenRouter Key fehlt – für die Live-Websuche bitte in den Cursor Secrets OPENROUTER_API_KEY hinterlegen.",
        );
      }
      setResolvedLocation(
        `${data.resolvedLocation ?? webCity} · Modell: ${data.modelUsed}`,
      );
      setCandidates(data.candidates ?? []);
      setSelectedIds(new Set());
    } catch {
      setSearchError("Verbindung zur KI-Websuche fehlgeschlagen.");
    } finally {
      setWebSearching(false);
    }
  }

  async function handleFreePrescan() {
    const withWeb = candidates.filter((c) => c.websiteUrl).slice(0, 8);
    if (withWeb.length === 0) return;
    setPrescanning(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prescan_candidates",
          candidates: withWeb,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Vorcheck fehlgeschlagen.");
        return;
      }
      const nextMap: Record<string, RadarPreview> = { ...previews };
      for (const p of (data.previews ?? []) as RadarPreview[]) {
        nextMap[p.osmId] = p;
      }
      setPreviews(nextMap);

      const score = (c: RadarCandidate) => {
        const p = nextMap[c.osmId];
        if (!p) return 2;
        return p.priority === "heiss" ? 0 : p.priority === "warm" ? 1 : 2;
      };
      setCandidates((prev) => [...prev].sort((a, b) => score(a) - score(b)));
    } catch {
      setSearchError("Netzwerkfehler beim kostenlosen Vorcheck.");
    } finally {
      setPrescanning(false);
    }
  }

  function toggleCandidate(osmId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(osmId)) {
        next.delete(osmId);
      } else if (next.size < maxBatch) {
        next.add(osmId);
      }
      return next;
    });
  }

  async function handleImportSelected() {
    const picked = candidates.filter((c) => selectedIds.has(c.osmId));
    if (picked.length === 0) return;
    setImporting(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import_candidates",
          candidates: picked,
          autoScanWebsites: autoScanOnImport,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Import fehlgeschlagen.");
        return;
      }
      setImportedLeads(data.leads ?? []);
      setCandidates((prev) =>
        prev.map((c) =>
          selectedIds.has(c.osmId) ? { ...c, alreadyInPipeline: true } : c,
        ),
      );
      setSelectedIds(new Set());
    } catch {
      setSearchError("Netzwerkfehler beim Importieren.");
    } finally {
      setImporting(false);
    }
  }

  async function handleBatchScan(e: React.FormEvent) {
    e.preventDefault();
    const urls = batchText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (urls.length === 0) return;
    setBatchScanning(true);
    setBatchError(null);
    setBatchResults([]);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          urls,
          targetTrack: batchTrack,
          saveToPipeline: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBatchError(data.error ?? "Batch-Scan fehlgeschlagen.");
        return;
      }
      setBatchResults(data.results ?? []);
    } catch {
      setBatchError("Netzwerkfehler beim Batch-Scan.");
    } finally {
      setBatchScanning(false);
    }
  }

  async function handleSingleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scanUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: scanUrl.trim(),
          companyName: scanCompany.trim(),
          city: scanCity.trim(),
          includePageSpeed,
          runAiQualification: runAi,
          saveToPipeline: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Scan fehlgeschlagen.");
        return;
      }
      setScanResult({ lead: data.lead, aiMeta: data.aiMeta ?? null });
    } catch {
      setScanError("Netzwerkfehler beim Scan.");
    } finally {
      setScanning(false);
    }
  }

  const showCandidateList = tab === "local" || tab === "web";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            Kundensuche & Kostenlose Vor-Qualifizierung
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
            Kunden-Radar
          </h1>
          <p className="mt-1 text-[14px] text-[#6B7280] max-w-2xl">
            Finde reale Unternehmen über OpenStreetMap (0,00 €) oder durchsuche
            mit Perplexity Sonar über OpenRouter direkt das Live-Web nach
            Startups & KMU.
          </p>
        </div>

        <div className="inline-flex items-center flex-nowrap rounded-full bg-white border border-[#E5E7EB] p-1 shrink-0 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setTab("local")}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
              tab === "local"
                ? "bg-[#0000F5] text-white"
                : "text-[#6B7280] hover:text-[#1A1A2E]"
            }`}
          >
            Branchen-Radar (0 €)
          </button>
          <button
            type="button"
            onClick={() => setTab("web")}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
              tab === "web"
                ? "bg-[#0000F5] text-white"
                : "text-[#6B7280] hover:text-[#1A1A2E]"
            }`}
          >
            KI-Live-Websuche
          </button>
          <button
            type="button"
            onClick={() => setTab("batch")}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
              tab === "batch"
                ? "bg-[#0000F5] text-white"
                : "text-[#6B7280] hover:text-[#1A1A2E]"
            }`}
          >
            5er-Batch
          </button>
          <button
            type="button"
            onClick={() => setTab("scanner")}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
              tab === "scanner"
                ? "bg-[#0000F5] text-white"
                : "text-[#6B7280] hover:text-[#1A1A2E]"
            }`}
          >
            Einzel-URL
          </button>
        </div>
      </div>

      {tab === "local" && (
        <form
          onSubmit={handleRadarSearch}
          className="rounded-2xl bg-white border border-[#E5E7EB] p-5 sm:p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Stadt / Region (DACH)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="z. B. Erfurt, Weimar, Jena"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Zielbranche
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px] focus:outline-none focus:border-[#0000F5]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Spezifischer Begriff (optional)
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="z. B. Tischlerei, Pflege, Bau"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
              />
            </div>

            <div className="flex flex-col justify-end gap-2">
              <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyWithWebsite}
                  onChange={(e) => setOnlyWithWebsite(e.target.checked)}
                  className="accent-[#0000F5]"
                />
                <span>Nur mit Website</span>
              </label>
              <button
                type="submit"
                disabled={searching}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>
                  {searching ? "Suche läuft..." : "Unternehmen finden (0 €)"}
                </span>
              </button>
            </div>
          </div>

          {searchError && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {searchError}
            </p>
          )}
        </form>
      )}

      {tab === "web" && (
        <form
          onSubmit={handleLiveWebSearch}
          className="rounded-2xl bg-white border border-[#E5E7EB] p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-semibold text-[#1A1A2E] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0000F5]" />
                <span>
                  Live-Websuche für Startups & Nischen-KMU (Perplexity Sonar)
                </span>
              </h2>
              <p className="text-[13px] text-[#6B7280] mt-0.5">
                Findet reale Firmen & Software-Startups im offenen Web
                (~0,003 € pro Suche) und verifiziert danach jede Domain live.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Zielgruppe
              </label>
              <select
                value={webTrack}
                onChange={(e) => {
                  const t = e.target.value as TargetTrack;
                  setWebTrack(t);
                  setWebQuery(
                    t === "startup"
                      ? "B2B SaaS Software Plattform"
                      : "Pflegedienst oder Bauunternehmen",
                  );
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
              >
                <option value="startup">Startups & Produktteams</option>
                <option value="kmu">Lokale KMU & Praxen</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Region / Land
              </label>
              <input
                type="text"
                value={webCity}
                onChange={(e) => setWebCity(e.target.value)}
                placeholder="z. B. Thüringen, Berlin, DACH"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Suchfokus
              </label>
              <input
                type="text"
                value={webQuery}
                onChange={(e) => setWebQuery(e.target.value)}
                placeholder="z. B. Logistik SaaS, Maschinenbau"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px]"
              />
            </div>

            <button
              type="submit"
              disabled={webSearching}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>{webSearching ? "Durchsuche Web..." : "Web durchsuchen"}</span>
            </button>
          </div>

          {searchError && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {searchError}
            </p>
          )}
        </form>
      )}

      {showCandidateList && importedLeads.length > 0 && (
        <div className="rounded-2xl bg-[#F0F3FF] border border-[#0000F5]/20 p-5 space-y-3">
          <p className="text-[14px] font-semibold text-[#1A1A2E]">
            {importedLeads.length} Unternehmen in die Pipeline übernommen
            {autoScanOnImport
              ? " & inkl. Impressum/Technik analysiert (0 € KI)"
              : ""}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            {importedLeads.map((l) => (
              <Link
                key={l.id}
                href={`/pipeline/${l.id}`}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E5E7EB] text-[13px] font-medium text-[#1A1A2E] hover:border-[#0000F5]"
              >
                <span>{l.company_name}</span>
                <span className="text-[#0000F5]">Öffnen</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {showCandidateList && candidates.length > 0 && (
        <section className="rounded-2xl bg-white border border-[#E5E7EB] overflow-hidden">
          <div className="p-5 border-b border-[#E5E7EB] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                {candidates.length} Treffer gefunden
              </h2>
              {resolvedLocation && (
                <p className="text-[12px] text-[#6B7280] mt-0.5 truncate max-w-xl">
                  {resolvedLocation}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleFreePrescan}
                disabled={
                  prescanning || !candidates.some((c) => c.websiteUrl)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#0000F5]/30 bg-[#F0F3FF] text-[#0000F5] text-[12px] font-medium cursor-pointer disabled:opacity-40"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {prescanning
                    ? "Vorcheck läuft..."
                    : "Websites vorprüfen & sortieren (0 €)"}
                </span>
              </button>

              <label className="inline-flex items-center gap-1.5 text-[12px] text-[#6B7280] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScanOnImport}
                  onChange={(e) => setAutoScanOnImport(e.target.checked)}
                  className="accent-[#0000F5]"
                />
                <span>Impressum-Check</span>
              </label>

              <button
                type="button"
                disabled={selectedIds.size === 0 || importing}
                onClick={handleImportSelected}
                className="px-5 py-2 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-40 text-white text-[13px] font-medium cursor-pointer"
              >
                {importing
                  ? "Übernehme..."
                  : `Übernehmen (${selectedIds.size}/${maxBatch})`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#E5E7EB]">
            {candidates.map((c) => {
              const selected = selectedIds.has(c.osmId);
              const safeUrl = safeHref(c.websiteUrl);
              const preview = previews[c.osmId];
              return (
                <div
                  key={c.osmId}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8F9FC]"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCandidate(c.osmId)}
                      disabled={c.alreadyInPipeline}
                      className="mt-0.5 text-[#0000F5] disabled:text-[#6B7280]/40 cursor-pointer"
                      aria-label={`${c.companyName} auswählen`}
                    >
                      {selected ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[14px] text-[#1A1A2E]">
                          {c.companyName}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">
                          {c.industry}
                        </span>
                        {preview && (
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              preview.priority === "heiss"
                                ? "bg-[#F0F3FF] text-[#0000F5]"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            Bedarf: {PRIORITY_LABELS[preview.priority]}
                          </span>
                        )}
                        {c.alreadyInPipeline && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            In Pipeline
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#6B7280] mt-0.5">
                        {c.postalAddress || c.city}
                        {c.contactEmail ? ` · ${c.contactEmail}` : ""}
                        {c.contactPhone ? ` · ${c.contactPhone}` : ""}
                      </p>
                      {preview && (
                        <p className="text-[12px] text-[#1A1A2E] mt-1">
                          {preview.cms} ·{" "}
                          {preview.httpsEnabled ? "HTTPS" : "Kein HTTPS"} ·{" "}
                          {preview.hasViewport
                            ? "Viewport OK"
                            : "Kein Mobile-Viewport"}{" "}
                          · <strong>{preview.topFinding}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {safeUrl ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0000F5] hover:underline"
                      >
                        <span>Website</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-[12px] text-[#6B7280]">
                        Keine Website hinterlegt
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "batch" && (
        <div className="space-y-6">
          <form
            onSubmit={handleBatchScan}
            className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-[#1A1A2E] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0000F5]" />
                  <span>
                    Startup- & Produkt-Batch-Scanner (bis zu 5 URLs · 0 € KI)
                  </span>
                </h2>
                <p className="text-[13px] text-[#6B7280] mt-0.5">
                  Ideal für SaaS-Teams, Agentur-Partner oder Betriebe aus deinen
                  Notizen: prüft Technik, Impressum, Entscheider &
                  Karriere-Signale.
                </p>
              </div>
              <select
                value={batchTrack}
                onChange={(e) => setBatchTrack(e.target.value as TargetTrack)}
                className="px-3.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
              >
                <option value="startup">Track: Startups & Produktteams</option>
                <option value="kmu">Track: Lokale Unternehmen / KMU</option>
              </select>
            </div>

            <textarea
              rows={5}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={
                "https://produkt-startup-1.de\nhttps://agentur-partner-2.de\nhttps://betrieb-3.de"
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px] font-mono focus:outline-none focus:border-[#0000F5]"
            />

            {batchError && (
              <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {batchError}
              </p>
            )}

            <button
              type="submit"
              disabled={batchScanning || !batchText.trim()}
              className="px-6 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium cursor-pointer"
            >
              {batchScanning
                ? "Scanne URLs & Impressum..."
                : "Bis zu 5 URLs kostenlos scannen & anlegen"}
            </button>
          </form>

          {batchResults.length > 0 && (
            <div className="rounded-2xl bg-white border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
              {batchResults.map((r, i) => (
                <div
                  key={i}
                  className="p-4 flex items-center justify-between gap-4 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#1A1A2E] truncate">
                      {r.ok && r.lead ? r.lead.company_name : r.url}
                    </p>
                    <p className="text-[#6B7280] truncate">
                      {r.ok && r.lead
                        ? r.lead.research_summary
                        : r.error ?? "Fehler"}
                    </p>
                  </div>
                  {r.ok && r.lead ? (
                    <Link
                      href={`/pipeline/${r.lead.id}`}
                      className="px-4 py-1.5 rounded-full bg-[#F0F3FF] text-[#0000F5] font-medium shrink-0"
                    >
                      Öffnen
                    </Link>
                  ) : (
                    <span className="text-red-700 text-[12px] shrink-0">
                      Fehlgeschlagen
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "scanner" && (
        <div className="space-y-6">
          <form
            onSubmit={handleSingleScan}
            className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                  Website-URL *
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={scanUrl}
                    onChange={(e) => setScanUrl(e.target.value)}
                    placeholder="https://zielunternehmen.de"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                  Ort (optional)
                </label>
                <input
                  type="text"
                  value={scanCity}
                  onChange={(e) => setScanCity(e.target.value)}
                  placeholder="z. B. Erfurt"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                  Unternehmensname (optional – sonst aus Seitentitel)
                </label>
                <input
                  type="text"
                  value={scanCompany}
                  onChange={(e) => setScanCompany(e.target.value)}
                  placeholder="z. B. Mustermann Bau GmbH"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePageSpeed}
                    onChange={(e) => setIncludePageSpeed(e.target.checked)}
                    className="accent-[#0000F5]"
                  />
                  <span>Google PageSpeed Mobil messen (dauert ~8s, 0 €)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={runAi}
                    onChange={(e) => setRunAi(e.target.checked)}
                    className="accent-[#0000F5]"
                  />
                  <Sparkles className="w-3.5 h-3.5 text-[#0000F5]" />
                  <span>
                    Anschließend qualifizieren (
                    {snapshot.brand.openrouter_config.researchModel})
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={scanning || !scanUrl.trim()}
                className="px-6 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium cursor-pointer"
              >
                {scanning ? "Analysiere Website..." : "Technik & Fit prüfen"}
              </button>
            </div>

            {scanError && (
              <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {scanError}
              </p>
            )}
          </form>

          {scanResult && (
            <div className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1A1A2E]">
                    {scanResult.lead.company_name}
                  </h2>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    {scanResult.lead.research_summary}
                  </p>
                </div>
                <Link
                  href={`/pipeline/${scanResult.lead.id}`}
                  className="px-5 py-2 rounded-full bg-[#0000F5] text-white text-[13px] font-medium shrink-0 text-center"
                >
                  Zur visuellen Prüfung & Akquise
                </Link>
              </div>

              {scanResult.lead.scan_data && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8F9FC] rounded-xl p-4 text-[13px]">
                  <div>
                    <span className="text-[#6B7280] block text-[11px]">
                      HTTPS / Status
                    </span>
                    <span className="font-medium">
                      {scanResult.lead.scan_data.httpsEnabled
                        ? "HTTPS OK"
                        : "Kein HTTPS"}{" "}
                      ({scanResult.lead.scan_data.statusCode})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280] block text-[11px]">
                      Erkanntes System
                    </span>
                    <span className="font-medium">
                      {scanResult.lead.scan_data.detectedCms}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280] block text-[11px]">
                      Mobile Viewport
                    </span>
                    <span className="font-medium">
                      {scanResult.lead.scan_data.hasViewportMeta
                        ? "Vorhanden"
                        : "Fehlt"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280] block text-[11px]">
                      Seiten & Tempo
                    </span>
                    <span className="font-medium">
                      {scanResult.lead.scan_data.checkedPagesCount ?? 1} Seiten
                      · {scanResult.lead.scan_data.responseTimeMs} ms
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-[14px] font-semibold text-[#1A1A2E]">
                  Messbare Befunde ({scanResult.lead.findings.length})
                </h3>
                {scanResult.lead.findings.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-[13px]"
                  >
                    <p className="font-medium text-[#1A1A2E]">{f.title}</p>
                    <p className="text-[#6B7280] mt-0.5">{f.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
