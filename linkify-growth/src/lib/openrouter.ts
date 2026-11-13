import {
  getAiUsageSummary,
  getBrandProfile,
  logAiRun,
} from "./workspace-data";

export interface OpenRouterModelOption {
  id: string;
  name: string;
  contextLength?: number;
  category: "fast" | "writing" | "reasoning";
  promptPerMillionUsd: number;
  completionPerMillionUsd: number;
}

export const CURATED_OPENROUTER_MODELS: OpenRouterModelOption[] = [
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

const MODEL_PRICE_CACHE = new Map<
  string,
  { promptPerToken: number; completionPerToken: number }
>();

for (const m of CURATED_OPENROUTER_MODELS) {
  MODEL_PRICE_CACHE.set(m.id, {
    promptPerToken: m.promptPerMillionUsd / 1_000_000,
    completionPerToken: m.completionPerMillionUsd / 1_000_000,
  });
}

export function estimateCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const prices = MODEL_PRICE_CACHE.get(modelId) ?? {
    promptPerToken: 1.0 / 1_000_000,
    completionPerToken: 3.0 / 1_000_000,
  };
  return (
    promptTokens * prices.promptPerToken +
    completionTokens * prices.completionPerToken
  );
}

export function isOpenRouterConfigured(): boolean {
  return (process.env.OPENROUTER_API_KEY?.trim() ?? "") !== "";
}

export interface OpenRouterKeyStatus {
  connected: boolean;
  limitUsd: number | null;
  limitRemainingUsd: number | null;
  usageDailyUsd: number | null;
  usageMonthlyUsd: number | null;
  isFreeTier: boolean | null;
}

export async function getOpenRouterKeyStatus(): Promise<OpenRouterKeyStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      connected: false,
      limitUsd: null,
      limitRemainingUsd: null,
      usageDailyUsd: null,
      usageMonthlyUsd: null,
      isFreeTier: null,
    };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      return {
        connected: true,
        limitUsd: null,
        limitRemainingUsd: null,
        usageDailyUsd: null,
        usageMonthlyUsd: null,
        isFreeTier: null,
      };
    }
    const json = (await res.json()) as {
      data?: {
        limit?: number | null;
        limit_remaining?: number | null;
        usage_daily?: number | null;
        usage_monthly?: number | null;
        is_free_tier?: boolean | null;
      };
    };
    return {
      connected: true,
      limitUsd: json.data?.limit ?? null,
      limitRemainingUsd: json.data?.limit_remaining ?? null,
      usageDailyUsd: json.data?.usage_daily ?? null,
      usageMonthlyUsd: json.data?.usage_monthly ?? null,
      isFreeTier: json.data?.is_free_tier ?? null,
    };
  } catch {
    return {
      connected: true,
      limitUsd: null,
      limitRemainingUsd: null,
      usageDailyUsd: null,
      usageMonthlyUsd: null,
      isFreeTier: null,
    };
  }
}

export interface PiiMaskContext {
  decisionMaker?: string;
  contactEmail?: string;
  contactPhone?: string;
  postalAddress?: string;
}

export function applyPrivacyMask(
  text: string,
  ctx: PiiMaskContext,
): { maskedText: string; restore: (output: string) => string } {
  const pairs: Array<[string, string]> = [];
  if (ctx.decisionMaker?.trim()) {
    pairs.push([ctx.decisionMaker.trim(), "[ANSPRECHPARTNER]"]);
  }
  if (ctx.contactEmail?.trim()) {
    pairs.push([ctx.contactEmail.trim(), "[KONTAKT_EMAIL]"]);
  }
  if (ctx.contactPhone?.trim()) {
    pairs.push([ctx.contactPhone.trim(), "[KONTAKT_TELEFON]"]);
  }
  if (ctx.postalAddress?.trim()) {
    pairs.push([ctx.postalAddress.trim(), "[POSTANSCHRIFT]"]);
  }

  let maskedText = text;
  for (const [original, token] of pairs) {
    if (original.length < 3) continue;
    maskedText = maskedText.split(original).join(token);
  }

  const restore = (output: string): string => {
    let restored = output;
    for (const [original, token] of pairs) {
      restored = restored.split(token).join(original);
    }
    return restored;
  };

  return { maskedText, restore };
}

export async function listOpenRouterModels(): Promise<{
  connected: boolean;
  models: OpenRouterModelOption[];
}> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { connected: false, models: CURATED_OPENROUTER_MODELS };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      return { connected: true, models: CURATED_OPENROUTER_MODELS };
    }
    const payload = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const apiModels = (payload.data ?? [])
      .filter((m) => typeof m.id === "string" && typeof m.name === "string")
      .slice(0, 90)
      .map((m) => {
        const promptPerToken = Number.parseFloat(m.pricing?.prompt ?? "0") || 0;
        const completionPerToken =
          Number.parseFloat(m.pricing?.completion ?? "0") || 0;
        if (promptPerToken > 0 || completionPerToken > 0) {
          MODEL_PRICE_CACHE.set(m.id!, {
            promptPerToken,
            completionPerToken,
          });
        }
        return {
          id: m.id!,
          name: m.name!,
          contextLength: m.context_length,
          category: (m.id!.includes("flash") || m.id!.includes("mini")
            ? "fast"
            : "writing") as OpenRouterModelOption["category"],
          promptPerMillionUsd: Number((promptPerToken * 1_000_000).toFixed(3)),
          completionPerMillionUsd: Number(
            (completionPerToken * 1_000_000).toFixed(3),
          ),
        };
      });

    const merged = [...CURATED_OPENROUTER_MODELS];
    const seen = new Set(merged.map((m) => m.id));
    for (const m of apiModels) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
    return { connected: true, models: merged };
  } catch {
    return { connected: true, models: CURATED_OPENROUTER_MODELS };
  }
}

export async function runAiTask(params: {
  scopeKey: string;
  taskType: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  privacyMode?: boolean;
  piiContext?: PiiMaskContext;
  summaryLabel: string;
  fallbackFn: () => string;
}): Promise<{
  text: string;
  modelUsed: string;
  providerMode: "openrouter" | "local_fallback";
  privacyMasked: boolean;
  limitBlockedReason?: string;
  estimatedCostUsd: number;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const privacyMasked = params.privacyMode ?? true;
  const masker =
    privacyMasked && params.piiContext
      ? applyPrivacyMask(params.userPrompt, params.piiContext)
      : {
          maskedText: params.userPrompt,
          restore: (s: string) => s,
        };

  const brand = await getBrandProfile(params.scopeKey);
  const budget = brand.budget_config;
  const usageSummary = await getAiUsageSummary(params.scopeKey);
  const currentMonthEur = usageSummary.monthCostUsd * budget.eurPerUsdRate;

  let limitBlockedReason: string | undefined;
  if (apiKey && budget.stopOnLimit) {
    if (budget.monthlyBudgetEur <= 0) {
      limitBlockedReason =
        "Monatsbudget steht auf 0 € (nur kostenloser lokaler Modus aktiv).";
    } else if (currentMonthEur >= budget.monthlyBudgetEur) {
      limitBlockedReason = `Monatsbudget erreicht (${currentMonthEur.toFixed(2)} € / ${budget.monthlyBudgetEur.toFixed(2)} €).`;
    } else if (
      budget.dailyMaxCalls > 0 &&
      usageSummary.todayCalls >= budget.dailyMaxCalls
    ) {
      limitBlockedReason = `Tageslimit erreicht (${usageSummary.todayCalls} / ${budget.dailyMaxCalls} Anfragen heute).`;
    }
  }

  if (!apiKey || limitBlockedReason) {
    const fallbackText = params.fallbackFn();
    await logAiRun({
      id: crypto.randomUUID(),
      owner_sub: params.scopeKey,
      task_type: params.taskType,
      model: "lokal-vorschau",
      provider_mode: "local_fallback",
      privacy_masked: privacyMasked,
      prompt_tokens: 0,
      completion_tokens: 0,
      estimated_cost_usd: 0,
      summary: limitBlockedReason
        ? `${params.summaryLabel} (${limitBlockedReason})`
        : `${params.summaryLabel} (Vorschau-Modus ohne OpenRouter-Key)`,
    });
    return {
      text: fallbackText,
      modelUsed: "lokal-vorschau",
      providerMode: "local_fallback",
      privacyMasked,
      limitBlockedReason,
      estimatedCostUsd: 0,
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  const chosenModel = params.model.trim() || "google/gemini-2.5-flash";
  const tokenCap = Math.min(Math.max(budget.maxTokensPerCall || 1200, 200), 3200);
  const maxTokens = Math.min(Math.max(params.maxTokens ?? tokenCap, 150), tokenCap);
  const temperature =
    typeof params.temperature === "number"
      ? Math.min(Math.max(params.temperature, 0), 1)
      : 0.4;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://linkify.tech",
      "x-title": "Linkify Growth OS",
    },
    body: JSON.stringify({
      model: chosenModel,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: masker.maskedText },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter Anfrage fehlgeschlagen (${response.status}): ${errText.slice(0, 180)}`,
    );
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    };
  };

  const rawContent = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!rawContent) {
    throw new Error("OpenRouter hat keine Antwort geliefert.");
  }

  const finalContent = masker.restore(rawContent);
  const actualModel = data.model ?? chosenModel;
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const computedCostUsd =
    typeof data.usage?.cost === "number" && data.usage.cost >= 0
      ? data.usage.cost
      : estimateCostUsd(actualModel, promptTokens, completionTokens);

  await logAiRun({
    id: crypto.randomUUID(),
    owner_sub: params.scopeKey,
    task_type: params.taskType,
    model: actualModel,
    provider_mode: "openrouter",
    privacy_masked: privacyMasked,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: computedCostUsd,
    summary: params.summaryLabel,
  });

  return {
    text: finalContent,
    modelUsed: actualModel,
    providerMode: "openrouter",
    privacyMasked,
    estimatedCostUsd: computedCostUsd,
    usage: { promptTokens, completionTokens },
  };
}
