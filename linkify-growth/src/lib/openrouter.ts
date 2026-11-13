import {
  APPROVED_OPENROUTER_MODELS,
  HARD_EUR_PER_USD_RATE,
  HARD_MAX_DAILY_CALLS,
  HARD_MAX_MODEL_COMPLETION_USD_PER_1M,
  HARD_MAX_MODEL_PROMPT_USD_PER_1M,
  HARD_MAX_MONTHLY_EUR,
  HARD_MAX_TOKENS_PER_CALL,
  resolveApprovedModel,
  type CuratedModelSpec,
} from "./budget-guard";
import {
  getAiUsageSummary,
  getBrandProfile,
  getGlobalAiUsageSummary,
  logAiRun,
} from "./workspace-data";

export interface OpenRouterModelOption {
  id: string;
  name: string;
  contextLength?: number;
  category: "fast" | "writing" | "reasoning";
  promptPerMillionUsd: number;
  completionPerMillionUsd: number;
  intelligenceIndex?: number;
  note?: string;
}

export const CURATED_OPENROUTER_MODELS: OpenRouterModelOption[] =
  APPROVED_OPENROUTER_MODELS.map((m: CuratedModelSpec) => ({
    id: m.id,
    name: m.name,
    category:
      m.tier === "ultra_sparen"
        ? "fast"
        : m.tier === "ausgewogen"
          ? "reasoning"
          : "writing",
    promptPerMillionUsd: m.promptPerMillionUsd,
    completionPerMillionUsd: m.completionPerMillionUsd,
    intelligenceIndex: m.intelligenceIndex,
    note: m.note,
  }));

const MODEL_PRICE_CACHE = new Map<
  string,
  { promptPerToken: number; completionPerToken: number }
>();

for (const m of APPROVED_OPENROUTER_MODELS) {
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
    promptPerToken: 1.5 / 1_000_000,
    completionPerToken: 7.5 / 1_000_000,
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
  companyName?: string;
  websiteUrl?: string;
  decisionMaker?: string;
  contactEmail?: string;
  contactPhone?: string;
  postalAddress?: string;
}

/**
 * Unconditionally masks identifying lead fields AND stray emails/phone numbers
 * before sending any text to third-party OpenRouter endpoints, then restores them locally.
 */
export function applyPrivacyMask(
  text: string,
  ctx: PiiMaskContext = {},
): { maskedText: string; restore: (output: string) => string } {
  const pairs: Array<[string, string]> = [];
  const pushPair = (val: string | undefined, token: string) => {
    const clean = val?.trim() ?? "";
    if (clean.length >= 3) {
      pairs.push([clean, token]);
    }
  };

  pushPair(ctx.decisionMaker, "[ANSPRECHPARTNER]");
  pushPair(ctx.contactEmail, "[KONTAKT_EMAIL]");
  pushPair(ctx.contactPhone, "[KONTAKT_TELEFON]");
  pushPair(ctx.postalAddress, "[POSTANSCHRIFT]");
  pushPair(ctx.websiteUrl, "[WEBSITE_URL]");
  pushPair(ctx.companyName, "[UNTERNEHMEN]");

  // Longest strings first so partial names never corrupt full names/addresses
  pairs.sort((a, b) => b[0].length - a[0].length);

  let maskedText = text;
  for (const [original, token] of pairs) {
    maskedText = maskedText.split(original).join(token);
  }

  // Scrub any residual email addresses or phone numbers in arbitrary notes/context
  maskedText = maskedText.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL_ENTFERNT]",
  );
  maskedText = maskedText.replace(
    /(?:\+49|0)[1-9][0-9\s/()-]{6,18}\d/g,
    "[TELEFON_ENTFERNT]",
  );

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

    const apiById = new Map<string, { p: number; c: number; ctx?: number }>();
    for (const m of payload.data ?? []) {
      if (typeof m.id !== "string") continue;
      const p = (Number.parseFloat(m.pricing?.prompt ?? "0") || 0) * 1_000_000;
      const c =
        (Number.parseFloat(m.pricing?.completion ?? "0") || 0) * 1_000_000;
      if (
        p <= HARD_MAX_MODEL_PROMPT_USD_PER_1M &&
        c <= HARD_MAX_MODEL_COMPLETION_USD_PER_1M
      ) {
        apiById.set(m.id, { p, c, ctx: m.context_length });
      }
    }

    const updatedCurated = CURATED_OPENROUTER_MODELS.map((m) => {
      const live = apiById.get(m.id);
      if (!live) return m;
      MODEL_PRICE_CACHE.set(m.id, {
        promptPerToken: live.p / 1_000_000,
        completionPerToken: live.c / 1_000_000,
      });
      return {
        ...m,
        contextLength: live.ctx,
        promptPerMillionUsd: Number(live.p.toFixed(4)),
        completionPerMillionUsd: Number(live.c.toFixed(4)),
      };
    });

    return { connected: true, models: updatedCurated };
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
  autoDowngraded?: boolean;
  estimatedCostUsd: number;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  // Privacy scrubbing is always enforced on third-party AI calls
  const privacyMasked = true;
  const masker = applyPrivacyMask(params.userPrompt, params.piiContext ?? {});

  const brand = await getBrandProfile(params.scopeKey);
  const [userUsage, globalUsage] = await Promise.all([
    getAiUsageSummary(params.scopeKey),
    getGlobalAiUsageSummary(),
  ]);

  const effectiveMonthlyLimitEur = Math.min(
    Math.max(brand.budget_config.monthlyBudgetEur, 0),
    HARD_MAX_MONTHLY_EUR,
  );
  const effectiveDailyLimitCalls = Math.min(
    Math.max(brand.budget_config.dailyMaxCalls, 1),
    HARD_MAX_DAILY_CALLS,
  );

  const userMonthEur = userUsage.monthCostUsd * HARD_EUR_PER_USD_RATE;
  const globalMonthEur = globalUsage.monthCostUsd * HARD_EUR_PER_USD_RATE;

  let limitBlockedReason: string | undefined;
  if (apiKey) {
    if (effectiveMonthlyLimitEur <= 0) {
      limitBlockedReason =
        "Monatsbudget steht auf 0 € (nur kostenloser lokaler Modus aktiv).";
    } else if (globalMonthEur >= HARD_MAX_MONTHLY_EUR) {
      limitBlockedReason = `Globales Monatsbudget erreicht (${globalMonthEur.toFixed(2)} € / ${HARD_MAX_MONTHLY_EUR.toFixed(2)} €).`;
    } else if (userMonthEur >= effectiveMonthlyLimitEur) {
      limitBlockedReason = `Monatsbudget erreicht (${userMonthEur.toFixed(2)} € / ${effectiveMonthlyLimitEur.toFixed(2)} €).`;
    } else if (globalUsage.todayCalls >= HARD_MAX_DAILY_CALLS) {
      limitBlockedReason = `Globales Tageslimit erreicht (${globalUsage.todayCalls} / ${HARD_MAX_DAILY_CALLS} Anfragen heute).`;
    } else if (userUsage.todayCalls >= effectiveDailyLimitCalls) {
      limitBlockedReason = `Tageslimit erreicht (${userUsage.todayCalls} / ${effectiveDailyLimitCalls} Anfragen heute).`;
    }
  }

  if (!apiKey || limitBlockedReason) {
    const fallbackText = params.fallbackFn();
    await logAiRun({
      id: crypto.randomUUID(),
      owner_sub: params.scopeKey,
      task_type: params.taskType,
      model: "lokal-basis",
      provider_mode: "local_fallback",
      privacy_masked: privacyMasked,
      prompt_tokens: 0,
      completion_tokens: 0,
      estimated_cost_usd: 0,
      summary: limitBlockedReason
        ? `${params.summaryLabel} (${limitBlockedReason})`
        : `${params.summaryLabel} (Lokale Vorlage – kein Key)`,
    });
    return {
      text: fallbackText,
      modelUsed: "lokal-basis",
      providerMode: "local_fallback",
      privacyMasked,
      limitBlockedReason,
      estimatedCostUsd: 0,
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  let chosenSpec = resolveApprovedModel(params.model, "meta/muse-ember");
  let autoDowngraded = false;
  if (
    brand.budget_config.autoDowngradeAt75Pct &&
    effectiveMonthlyLimitEur > 0 &&
    userMonthEur >= effectiveMonthlyLimitEur * 0.75 &&
    chosenSpec.id !== "meta/muse-ember" &&
    chosenSpec.id !== "perplexity/sonar"
  ) {
    chosenSpec = resolveApprovedModel("meta/muse-ember");
    autoDowngraded = true;
  }

  const tokenCap = Math.min(
    Math.max(brand.budget_config.maxTokensPerCall || 1200, 200),
    HARD_MAX_TOKENS_PER_CALL,
  );
  const maxTokens = Math.min(
    Math.max(params.maxTokens ?? tokenCap, 80),
    tokenCap,
  );
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
      model: chosenSpec.id,
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
  const actualModel = data.model ?? chosenSpec.id;
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const computedCostUsd =
    typeof data.usage?.cost === "number" && data.usage.cost >= 0
      ? data.usage.cost
      : estimateCostUsd(chosenSpec.id, promptTokens, completionTokens);

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
    summary: autoDowngraded
      ? `${params.summaryLabel} (Auto-Sparmodus -> Muse Ember)`
      : params.summaryLabel,
  });

  return {
    text: finalContent,
    modelUsed: actualModel,
    providerMode: "openrouter",
    privacyMasked,
    autoDowngraded,
    estimatedCostUsd: computedCostUsd,
    usage: { promptTokens, completionTokens },
  };
}
