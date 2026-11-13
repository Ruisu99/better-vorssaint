/**
 * Server-enforced hard cost guardrails for Linkify Growth OS.
 * These ceilings CANNOT be raised or disabled via client settings or API payloads.
 */
export const HARD_MAX_MONTHLY_EUR = 15;
export const HARD_MAX_DAILY_CALLS = 40;
export const HARD_MAX_TOKENS_PER_CALL = 1800;
export const HARD_MAX_BATCH_LEADS = 5;
export const HARD_EUR_PER_USD_RATE = 0.92;
export const HARD_MAX_MODEL_PROMPT_USD_PER_1M = 3.0;
export const HARD_MAX_MODEL_COMPLETION_USD_PER_1M = 15.0;

export interface CuratedModelSpec {
  id: string;
  name: string;
  tier: "ultra_sparen" | "ausgewogen" | "premium_text" | "websuche";
  promptPerMillionUsd: number;
  completionPerMillionUsd: number;
  supportsReasoning: boolean;
  intelligenceIndex?: number;
  note: string;
}

/**
 * Verified November 2026 OpenRouter + Artificial Analysis model lineup within Linkify's budget spectrum.
 */
export const APPROVED_OPENROUTER_MODELS: CuratedModelSpec[] = [
  {
    id: "meta/muse-ember",
    name: "Meta: Muse Ember",
    tier: "ultra_sparen",
    promptPerMillionUsd: 0.1,
    completionPerMillionUsd: 0.5,
    supportsReasoning: true,
    intelligenceIndex: 36,
    note: "Pareto-Spitze (AA-Index 36, 443 tok/s, minimale Halluzinationen) – Standard für Analyse & Qualifizierung",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek: V4.1 Flash",
    tier: "ultra_sparen",
    promptPerMillionUsd: 0.022,
    completionPerMillionUsd: 0.4,
    supportsReasoning: true,
    note: "Extrem günstig für schnelle Vor-Qualifizierung & kurze Extraktionen",
  },
  {
    id: "qwen/qwen3.7-flash",
    name: "Qwen: 3.7 Flash",
    tier: "ultra_sparen",
    promptPerMillionUsd: 0.03,
    completionPerMillionUsd: 0.13,
    supportsReasoning: true,
    note: "Niedrigster Token-Preis im Katalog",
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Anthropic: Claude Haiku 5.5",
    tier: "ultra_sparen",
    promptPerMillionUsd: 0.1,
    completionPerMillionUsd: 0.5,
    supportsReasoning: true,
    intelligenceIndex: 36,
    note: "Sehr starkes Deutsch im Ultra-Spar-Segment",
  },
  {
    id: "openai/gpt-6-luna",
    name: "OpenAI: GPT-6 Luna",
    tier: "ultra_sparen",
    promptPerMillionUsd: 0.1,
    completionPerMillionUsd: 0.5,
    supportsReasoning: true,
    note: "Kompaktes, schnelles OpenAI-Sparmodell",
  },
  {
    id: "perplexity/sonar",
    name: "Perplexity: Sonar (Live-Websuche)",
    tier: "websuche",
    promptPerMillionUsd: 1.0,
    completionPerMillionUsd: 1.0,
    supportsReasoning: false,
    note: "Findet echte Unternehmen & Startups direkt im Live-Web (~0,003 € pro Suche)",
  },
  {
    id: "openai/gpt-6.1-terra",
    name: "OpenAI: GPT-6.1 Terra",
    tier: "ausgewogen",
    promptPerMillionUsd: 1.0,
    completionPerMillionUsd: 5.0,
    supportsReasoning: true,
    note: "Ausgewogen für Konzepte & Scope-Entwürfe",
  },
  {
    id: "meta/muse-spark-open",
    name: "Meta: Muse Spark Open",
    tier: "ausgewogen",
    promptPerMillionUsd: 1.25,
    completionPerMillionUsd: 4.25,
    supportsReasoning: true,
    note: "Starkes Allround-Modell im mittleren Preisspektrum",
  },
  {
    id: "google/gemini-4-hydrogen",
    name: "Google: Gemini 4 Hydrogen",
    tier: "ausgewogen",
    promptPerMillionUsd: 1.5,
    completionPerMillionUsd: 7.5,
    supportsReasoning: true,
    intelligenceIndex: 54,
    note: "Starkes Reasoning & natürliches Deutsch (AA-Index 54 Xhigh / 41 Medium) – Standard für Akquise & Content",
  },
  {
    id: "x-ai/grok-4.7",
    name: "SpaceXAI: Grok 4.7",
    tier: "ausgewogen",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 6.0,
    supportsReasoning: true,
    note: "Direkter Stil, gutes Preis-Leistungs-Verhältnis für Output",
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Anthropic: Claude Sonnet 5.5",
    tier: "premium_text",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 10.0,
    supportsReasoning: true,
    intelligenceIndex: 54,
    note: "Exzellente deutsche Tonalität für wichtige Kundenmails & Briefe (~0,01 € pro Brief)",
  },
  {
    id: "google/gemini-4-carbon",
    name: "Google: Gemini 4 Carbon",
    tier: "premium_text",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 10.0,
    supportsReasoning: true,
    intelligenceIndex: 60,
    note: "Sehr hohes Niveau (AA-Index 60) für komplexe Angebote & Strategien",
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "OpenAI: GPT-6.1 Sol",
    tier: "premium_text",
    promptPerMillionUsd: 2.0,
    completionPerMillionUsd: 10.0,
    supportsReasoning: true,
    note: "Präzises Flaggschiff im 2$/10$-Spektrum",
  },
];

const APPROVED_MAP = new Map(APPROVED_OPENROUTER_MODELS.map((m) => [m.id, m]));

export function resolveApprovedModel(
  requestedModel: string | undefined,
  fallbackModel = "meta/muse-ember",
): CuratedModelSpec {
  const clean = (requestedModel ?? "").trim();
  const found = APPROVED_MAP.get(clean);
  if (found) return found;
  return APPROVED_MAP.get(fallbackModel) ?? APPROVED_OPENROUTER_MODELS[0];
}

export function clampBudgetSettings(input: {
  monthlyBudgetEur?: unknown;
  dailyMaxCalls?: unknown;
  maxTokensPerCall?: unknown;
  batchMaxLeads?: unknown;
  autoDowngradeAt75Pct?: unknown;
}) {
  const rawMonth = Number(input.monthlyBudgetEur ?? HARD_MAX_MONTHLY_EUR);
  const rawDaily = Number(input.dailyMaxCalls ?? HARD_MAX_DAILY_CALLS);
  const rawTokens = Number(input.maxTokensPerCall ?? 1200);
  const rawBatch = Number(input.batchMaxLeads ?? HARD_MAX_BATCH_LEADS);

  return {
    monthlyBudgetEur: Number.isFinite(rawMonth)
      ? Math.min(
          Math.max(Math.round(rawMonth * 100) / 100, 0),
          HARD_MAX_MONTHLY_EUR,
        )
      : HARD_MAX_MONTHLY_EUR,
    dailyMaxCalls: Number.isFinite(rawDaily)
      ? Math.min(Math.max(Math.round(rawDaily), 1), HARD_MAX_DAILY_CALLS)
      : HARD_MAX_DAILY_CALLS,
    maxTokensPerCall: Number.isFinite(rawTokens)
      ? Math.min(Math.max(Math.round(rawTokens), 200), HARD_MAX_TOKENS_PER_CALL)
      : 1200,
    batchMaxLeads: Number.isFinite(rawBatch)
      ? Math.min(Math.max(Math.round(rawBatch), 1), HARD_MAX_BATCH_LEADS)
      : HARD_MAX_BATCH_LEADS,
    stopOnLimit: true as const,
    autoDowngradeAt75Pct:
      input.autoDowngradeAt75Pct === undefined
        ? true
        : Boolean(input.autoDowngradeAt75Pct),
    eurPerUsdRate: HARD_EUR_PER_USD_RATE,
  };
}
