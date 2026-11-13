"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Coins,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatBerlinDateTime } from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type { OpenRouterModelOption } from "@/lib/openrouter";
import type { BrandProfile } from "@/lib/types";

const CURATED_MODELS_FALLBACK: OpenRouterModelOption[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Google Gemini 2.5 Flash (schnell & extrem sparsam)",
    category: "fast",
    promptPerMillionUsd: 0.15,
    completionPerMillionUsd: 0.6,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini (sehr günstig für Qualifizierung)",
    category: "fast",
    promptPerMillionUsd: 0.15,
    completionPerMillionUsd: 0.6,
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3 (kosteneffizient für Research & Texte)",
    category: "reasoning",
    promptPerMillionUsd: 0.27,
    completionPerMillionUsd: 1.1,
  },
  {
    id: "openai/gpt-4.1",
    name: "OpenAI GPT-4.1 (präzise Konzepte & Outreach)",
    category: "writing",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 8.0,
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Anthropic Claude Sonnet 4 (sehr starkes Deutsch)",
    category: "writing",
    promptPerMillionUsd: 3.0,
    completionPerMillionUsd: 15.0,
  },
  {
    id: "mistralai/mistral-large-2411",
    name: "Mistral Large (europäisches Modell)",
    category: "writing",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 6.0,
  },
];

export function SettingsView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const [brand, setBrand] = useState<BrandProfile>(snapshot.brand);
  const [models, setModels] = useState<OpenRouterModelOption[]>(
    CURATED_MODELS_FALLBACK,
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const monthEur =
    snapshot.usageSummary.monthCostUsd * brand.budget_config.eurPerUsdRate;
  const todayEur =
    snapshot.usageSummary.todayCostUsd * brand.budget_config.eurPerUsdRate;
  const budgetPct =
    brand.budget_config.monthlyBudgetEur > 0
      ? Math.min(
          Math.round((monthEur / brand.budget_config.monthlyBudgetEur) * 100),
          100,
        )
      : 100;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brand),
      });
      const data = await res.json();
      if (res.ok && data.brand) {
        setBrand(data.brand);
        setSaveMessage("Einstellungen, Budget-Limits & Marken-Profil gespeichert.");
      } else {
        setSaveMessage(data.error ?? "Speichern fehlgeschlagen.");
      }
    } catch {
      setSaveMessage("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadModels() {
    setLoadingModels(true);
    try {
      const res = await fetch("/api/settings?models=1");
      if (res.ok) {
        const data = await res.json();
        if (data.modelsResult?.models) {
          setModels(data.modelsResult.models);
        }
      }
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleTestOpenRouter() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: brand.openrouter_config.researchModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult(data.error ?? "Test fehlgeschlagen.");
      } else if (!data.connected) {
        setTestResult(data.message);
      } else {
        setTestResult(
          `Verbunden (${data.modelUsed}): "${data.reply}"`,
        );
      }
    } catch {
      setTestResult("Verbindungstest fehlgeschlagen.");
    } finally {
      setTesting(false);
    }
  }

  function updateBenchmarkAmount(id: string, amountEur: number) {
    setBrand((prev) => ({
      ...prev,
      pricing_benchmarks: prev.pricing_benchmarks.map((p) =>
        p.id === id ? { ...p, amountEur: Math.max(0, amountEur) } : p,
      ),
    }));
  }

  function toggleBenchmarkConfirmed(id: string, confirmed: boolean) {
    setBrand((prev) => ({
      ...prev,
      pricing_benchmarks: prev.pricing_benchmarks.map((p) =>
        p.id === id ? { ...p, confirmed } : p,
      ),
    }));
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            OpenRouter API, Budget-Schutz & Linkify-Kontext
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
            KI-Steuerung & Kostenkontrolle
          </h1>
          <p className="mt-1 text-[14px] text-[#6B7280] max-w-2xl">
            Du behältst volle Kostenkontrolle durch feste Tages- und
            Monatslimits, harte Token-Obergrenzen und automatischen Stopp im
            Vorschau-Modus.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium cursor-pointer shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Speichere..." : "Einstellungen speichern"}</span>
        </button>
      </div>

      {saveMessage && (
        <div className="rounded-xl bg-[#F0F3FF] border border-[#0000F5]/20 px-4 py-3 text-[13px] text-[#1A1A2E] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#0000F5]" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Section 1: Hard Budget & Cost Guardrails */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F0F3FF] text-[#0000F5] flex items-center justify-center shrink-0">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
                Budget- & Kosten-Schutzschalter
              </h2>
              <p className="text-[13px] text-[#6B7280]">
                OpenRouter wird serverseitig über das Secret{" "}
                <code className="text-[#1A1A2E]">OPENROUTER_API_KEY</code>{" "}
                gebunden – der Schlüssel verlässt niemals den Server.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestOpenRouter}
              disabled={testing}
              className="px-4 py-2 rounded-full border border-[#E5E7EB] text-[13px] font-medium text-[#1A1A2E] hover:border-[#0000F5] cursor-pointer"
            >
              {testing ? "Teste..." : "Verbindung testen"}
            </button>
          </div>
        </div>

        {testResult && (
          <p className="text-[13px] bg-[#F8F9FC] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-[#1A1A2E]">
            {testResult}
          </p>
        )}

        {/* Current Spend Meters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-[#F8F9FC] rounded-xl p-4">
          <div>
            <span className="text-[11px] text-[#6B7280] block">
              App-Ausgaben Monat
            </span>
            <span className="text-[18px] font-semibold text-[#1A1A2E]">
              {monthEur.toFixed(2)} €{" "}
              <span className="text-[12px] font-normal text-[#6B7280]">
                / {brand.budget_config.monthlyBudgetEur.toFixed(0)} € ({budgetPct}%)
              </span>
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[#6B7280] block">
              Heute verbraucht
            </span>
            <span className="text-[18px] font-semibold text-[#1A1A2E]">
              {todayEur.toFixed(3)} €{" "}
              <span className="text-[12px] font-normal text-[#6B7280]">
                ({snapshot.usageSummary.todayCalls} Calls)
              </span>
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[#6B7280] block">
              Tokens diesen Monat
            </span>
            <span className="text-[18px] font-semibold text-[#1A1A2E]">
              {snapshot.usageSummary.monthTokens.toLocaleString("de-DE")}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[#6B7280] block">
              OpenRouter Key-Limit
            </span>
            <span className="text-[14px] font-semibold text-[#1A1A2E]">
              {snapshot.keyStatus.connected
                ? snapshot.keyStatus.limitRemainingUsd !== null
                  ? `$${snapshot.keyStatus.limitRemainingUsd.toFixed(2)} Rest`
                  : "Aktiv (ohne Key-Cap)"
                : "Noch nicht hinterlegt"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Monatsbudget (EUR) · 0 = nur gratis
            </label>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={brand.budget_config.monthlyBudgetEur}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  budget_config: {
                    ...p.budget_config,
                    monthlyBudgetEur: Number(e.target.value) || 0,
                  },
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Max. KI-Anfragen pro Tag
            </label>
            <input
              type="number"
              min={1}
              max={300}
              value={brand.budget_config.dailyMaxCalls}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  budget_config: {
                    ...p.budget_config,
                    dailyMaxCalls: Number(e.target.value) || 1,
                  },
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Max. Output-Tokens / Anfrage
            </label>
            <input
              type="number"
              min={200}
              max={3200}
              step={100}
              value={brand.budget_config.maxTokensPerCall}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  budget_config: {
                    ...p.budget_config,
                    maxTokensPerCall: Number(e.target.value) || 800,
                  },
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Max. Batch-Leads pro Import
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={brand.budget_config.batchMaxLeads}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  budget_config: {
                    ...p.budget_config,
                    batchMaxLeads: Number(e.target.value) || 5,
                  },
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-1">
          <label className="inline-flex items-center gap-2 text-[14px] text-[#1A1A2E] cursor-pointer">
            <input
              type="checkbox"
              checked={brand.budget_config.stopOnLimit}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  budget_config: {
                    ...p.budget_config,
                    stopOnLimit: e.target.checked,
                  },
                }))
              }
              className="w-4 h-4 accent-[#0000F5]"
            />
            <span>
              Bei Limit-Erreichung automatisch stoppen & auf kostenlosen lokalen
              Modus wechseln
            </span>
          </label>

          <label className="inline-flex items-center gap-2 text-[14px] text-[#1A1A2E] cursor-pointer">
            <input
              type="checkbox"
              checked={brand.openrouter_config.privacyMode}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  openrouter_config: {
                    ...p.openrouter_config,
                    privacyMode: e.target.checked,
                  },
                }))
              }
              className="w-4 h-4 accent-[#0000F5]"
            />
            <ShieldCheck className="w-4 h-4 text-[#0000F5]" />
            <span>
              Privacy-Mode: Personen-Namen, E-Mails, Telefon & Adressen vor
              OpenRouter-Prompt maskieren
            </span>
          </label>
        </div>
      </section>

      {/* Section 2: OpenRouter Multi-Model Routing */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1A1A2E] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0000F5]" />
              <span>OpenRouter Modell-Routing nach Aufgabe</span>
            </h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Nutze günstige Fast-Modelle für Analyse & Vorfilterung und starke
              Sprachmodelle nur dort, wo Kunden-Texte entstehen.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadModels}
            disabled={loadingModels}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingModels ? "animate-spin" : ""}`}
            />
            <span>Live-Modelle von OpenRouter laden</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Analyse & Lead-Qualifizierung
            </label>
            <select
              value={brand.openrouter_config.researchModel}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  openrouter_config: {
                    ...p.openrouter_config,
                    researchModel: e.target.value,
                  },
                }))
              }
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (${m.promptPerMillionUsd}/${m.completionPerMillionUsd})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Akquise, Briefe & Kundenantworten
            </label>
            <select
              value={brand.openrouter_config.writingModel}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  openrouter_config: {
                    ...p.openrouter_config,
                    writingModel: e.target.value,
                  },
                }))
              }
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (${m.promptPerMillionUsd}/${m.completionPerMillionUsd})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Content- & Fallstudien-Studio
            </label>
            <select
              value={brand.openrouter_config.contentModel}
              onChange={(e) =>
                setBrand((p) => ({
                  ...p,
                  openrouter_config: {
                    ...p.openrouter_config,
                    contentModel: e.target.value,
                  },
                }))
              }
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (${m.promptPerMillionUsd}/${m.completionPerMillionUsd})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Section 3: Brand Brain & Editable Internal Pricing Benchmarks */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-5">
        <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
          Linkify Marken- & Angebots-Gehirn
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Markenname
            </label>
            <input
              type="text"
              value={brand.brand_name}
              onChange={(e) =>
                setBrand((p) => ({ ...p, brand_name: e.target.value }))
              }
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Inhaber
            </label>
            <input
              type="text"
              value={brand.owner_name}
              onChange={(e) =>
                setBrand((p) => ({ ...p, owner_name: e.target.value }))
              }
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Standort / Stadt
            </label>
            <input
              type="text"
              value={brand.city}
              onChange={(e) =>
                setBrand((p) => ({ ...p, city: e.target.value }))
              }
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Geschäfts-E-Mail
            </label>
            <input
              type="email"
              value={brand.contact_email}
              onChange={(e) =>
                setBrand((p) => ({ ...p, contact_email: e.target.value }))
              }
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Telefon / Mobil (optional, für Briefkopf)
            </label>
            <input
              type="text"
              value={brand.phone_mobile}
              onChange={(e) =>
                setBrand((p) => ({ ...p, phone_mobile: e.target.value }))
              }
              placeholder="+49 ..."
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Absender-Postanschrift (für DIN-5008 Brief)
            </label>
            <input
              type="text"
              value={brand.postal_address}
              onChange={(e) =>
                setBrand((p) => ({ ...p, postal_address: e.target.value }))
              }
              placeholder="Straße Hausnr., PLZ Erfurt"
              className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
            Positionierung (für alle KI-Prompts)
          </label>
          <textarea
            rows={2}
            value={brand.positioning_statement}
            onChange={(e) =>
              setBrand((p) => ({ ...p, positioning_statement: e.target.value }))
            }
            className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
            Kommunikations- & Tonalitätsregeln
          </label>
          <textarea
            rows={3}
            value={brand.tone_rules}
            onChange={(e) =>
              setBrand((p) => ({ ...p, tone_rules: e.target.value }))
            }
            className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
          />
        </div>

        <div className="pt-2 border-t border-[#E5E7EB] space-y-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#1A1A2E]">
              Interne Richtwerte für Scope-Rechner (nicht verbindlich)
            </h3>
            <p className="text-[12px] text-[#6B7280]">
              Werte werden in deiner privaten Datenbank gespeichert – erst nach
              Bestätigung im Rechner aktiv.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {brand.pricing_benchmarks.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#E5E7EB] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#1A1A2E]">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-[#6B7280]">
                    {item.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={item.amountEur}
                      onChange={(e) =>
                        updateBenchmarkAmount(
                          item.id,
                          Number(e.target.value) || 0,
                        )
                      }
                      className="w-24 px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] text-[13px]"
                    />
                    <span className="text-[13px] text-[#6B7280]">€</span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-[#1A1A2E] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.confirmed}
                      onChange={(e) =>
                        toggleBenchmarkConfirmed(item.id, e.target.checked)
                      }
                      className="accent-[#0000F5]"
                    />
                    <span>Bestätigt</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: AI Usage Audit Table */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] overflow-hidden">
        <div className="p-5 border-b border-[#E5E7EB]">
          <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
            KI-Verbrauchs- & Kostenprotokoll ({snapshot.aiRuns.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F8F9FC] border-b border-[#E5E7EB] text-[12px] text-[#6B7280]">
                <th className="py-2.5 px-4">Zeitpunkt (Berlin)</th>
                <th className="py-2.5 px-4">Aktion</th>
                <th className="py-2.5 px-4">Modell</th>
                <th className="py-2.5 px-4">Tokens</th>
                <th className="py-2.5 px-4 text-right">Geschätzte Kosten</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {snapshot.aiRuns.map((run) => {
                const eur =
                  run.estimated_cost_usd * brand.budget_config.eurPerUsdRate;
                return (
                  <tr key={run.id}>
                    <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">
                      {formatBerlinDateTime(run.created_at)}
                    </td>
                    <td className="py-2.5 px-4 text-[#1A1A2E]">{run.summary}</td>
                    <td className="py-2.5 px-4 text-[#6B7280]">{run.model}</td>
                    <td className="py-2.5 px-4 text-[#6B7280]">
                      {(run.prompt_tokens + run.completion_tokens).toLocaleString(
                        "de-DE",
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-[#1A1A2E]">
                      {run.provider_mode === "local_fallback"
                        ? "0,0000 €"
                        : `${eur.toFixed(4)} €`}
                    </td>
                  </tr>
                );
              })}
              {snapshot.aiRuns.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-[#6B7280]"
                  >
                    Noch keine KI-Anfragen ausgeführt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </form>
  );
}
