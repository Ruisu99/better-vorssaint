import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { listOpenRouterModels } from "@/lib/openrouter";
import type { BrandProfile } from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  ensureWorkspaceSeeded,
  getBrandProfile,
  saveBrandProfile,
} from "@/lib/workspace-data";

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const includeModels = url.searchParams.get("models") === "1";

  const brand = await getBrandProfile(auth.scopeKey);
  const modelsResult = includeModels
    ? await listOpenRouterModels()
    : null;

  return NextResponse.json(
    {
      brand,
      modelsResult,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);
  const current = await getBrandProfile(auth.scopeKey);

  let patch: Partial<BrandProfile>;
  try {
    patch = (await request.json()) as Partial<BrandProfile>;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const sanitizedWebsite =
    patch.website_url !== undefined
      ? sanitizeExternalHref(patch.website_url) ?? current.website_url
      : current.website_url;

  const updated: BrandProfile = {
    ...current,
    brand_name:
      typeof patch.brand_name === "string" && patch.brand_name.trim()
        ? patch.brand_name.trim().slice(0, 100)
        : current.brand_name,
    owner_name:
      typeof patch.owner_name === "string" && patch.owner_name.trim()
        ? patch.owner_name.trim().slice(0, 100)
        : current.owner_name,
    city:
      typeof patch.city === "string"
        ? patch.city.trim().slice(0, 80)
        : current.city,
    website_url: sanitizedWebsite,
    contact_email:
      typeof patch.contact_email === "string"
        ? patch.contact_email.trim().slice(0, 120)
        : current.contact_email,
    phone_mobile:
      typeof patch.phone_mobile === "string"
        ? patch.phone_mobile.trim().slice(0, 40)
        : current.phone_mobile,
    phone_landline:
      typeof patch.phone_landline === "string"
        ? patch.phone_landline.trim().slice(0, 40)
        : current.phone_landline,
    postal_address:
      typeof patch.postal_address === "string"
        ? patch.postal_address.trim().slice(0, 240)
        : current.postal_address,
    tax_note:
      typeof patch.tax_note === "string"
        ? patch.tax_note.trim().slice(0, 300)
        : current.tax_note,
    positioning_statement:
      typeof patch.positioning_statement === "string"
        ? patch.positioning_statement.trim().slice(0, 800)
        : current.positioning_statement,
    tone_rules:
      typeof patch.tone_rules === "string"
        ? patch.tone_rules.trim().slice(0, 1200)
        : current.tone_rules,
    core_services: Array.isArray(patch.core_services)
      ? patch.core_services.slice(0, 15)
      : current.core_services,
    excluded_services: Array.isArray(patch.excluded_services)
      ? patch.excluded_services.map(String).slice(0, 15)
      : current.excluded_services,
    verified_references: Array.isArray(patch.verified_references)
      ? patch.verified_references.slice(0, 15)
      : current.verified_references,
    discovery_questions: Array.isArray(patch.discovery_questions)
      ? patch.discovery_questions.map(String).slice(0, 20)
      : current.discovery_questions,
    pricing_benchmarks: Array.isArray(patch.pricing_benchmarks)
      ? patch.pricing_benchmarks.slice(0, 20)
      : current.pricing_benchmarks,
    openrouter_config:
      patch.openrouter_config && typeof patch.openrouter_config === "object"
        ? {
            researchModel: String(
              patch.openrouter_config.researchModel ??
                current.openrouter_config.researchModel,
            ).slice(0, 120),
            writingModel: String(
              patch.openrouter_config.writingModel ??
                current.openrouter_config.writingModel,
            ).slice(0, 120),
            contentModel: String(
              patch.openrouter_config.contentModel ??
                current.openrouter_config.contentModel,
            ).slice(0, 120),
            privacyMode: Boolean(
              patch.openrouter_config.privacyMode ??
                current.openrouter_config.privacyMode,
            ),
            temperature: Math.min(
              Math.max(
                Number(
                  patch.openrouter_config.temperature ??
                    current.openrouter_config.temperature,
                ),
                0,
              ),
              1,
            ),
          }
        : current.openrouter_config,
    budget_config:
      patch.budget_config && typeof patch.budget_config === "object"
        ? {
            monthlyBudgetEur: Math.min(
              Math.max(Number(patch.budget_config.monthlyBudgetEur ?? 15), 0),
              500,
            ),
            dailyMaxCalls: Math.min(
              Math.max(
                Math.round(Number(patch.budget_config.dailyMaxCalls ?? 40)),
                1,
              ),
              300,
            ),
            maxTokensPerCall: Math.min(
              Math.max(
                Math.round(Number(patch.budget_config.maxTokensPerCall ?? 1200)),
                200,
              ),
              3200,
            ),
            batchMaxLeads: Math.min(
              Math.max(
                Math.round(Number(patch.budget_config.batchMaxLeads ?? 5)),
                1,
              ),
              10,
            ),
            stopOnLimit: Boolean(
              patch.budget_config.stopOnLimit ?? current.budget_config.stopOnLimit,
            ),
            eurPerUsdRate: Math.min(
              Math.max(Number(patch.budget_config.eurPerUsdRate ?? 0.92), 0.5),
              1.5,
            ),
          }
        : current.budget_config,
    weekly_targets:
      patch.weekly_targets && typeof patch.weekly_targets === "object"
        ? {
            leadsChecked: Math.min(
              Math.max(Number(patch.weekly_targets.leadsChecked || 12), 1),
              200,
            ),
            auditsSent: Math.min(
              Math.max(Number(patch.weekly_targets.auditsSent || 5), 1),
              100,
            ),
            callsBooked: Math.min(
              Math.max(Number(patch.weekly_targets.callsBooked || 2), 1),
              50,
            ),
          }
        : current.weekly_targets,
  };

  const saved = await saveBrandProfile(updated);
  return NextResponse.json({ brand: saved }, { headers: PRIVATE_JSON_HEADERS });
}
