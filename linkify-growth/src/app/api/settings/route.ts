import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import {
  clampBudgetSettings,
  resolveApprovedModel,
} from "@/lib/budget-guard";
import { listOpenRouterModels } from "@/lib/openrouter";
import type { BrandProfile } from "@/lib/types";
import { sanitizeExternalHref } from "@/lib/url-safety";
import {
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
  sanitizeCoreServices,
  sanitizePricingBenchmarks,
  sanitizeStringList,
  sanitizeVerifiedReferences,
} from "@/lib/validation";
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
  const modelsResult = includeModels ? await listOpenRouterModels() : null;

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

  let patch: Record<string, unknown>;
  try {
    patch = await parseSafeJsonBody(request, 65_536);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const current = await getBrandProfile(auth.scopeKey);

  const sanitizedWebsite =
    typeof patch.website_url === "string"
      ? sanitizeExternalHref(patch.website_url) ?? current.website_url
      : current.website_url;

  const rawOrConfig =
    typeof patch.openrouter_config === "object" &&
    patch.openrouter_config !== null
      ? (patch.openrouter_config as Record<string, unknown>)
      : null;

  const rawBudgetConfig =
    typeof patch.budget_config === "object" && patch.budget_config !== null
      ? (patch.budget_config as Record<string, unknown>)
      : null;

  const rawWeeklyTargets =
    typeof patch.weekly_targets === "object" && patch.weekly_targets !== null
      ? (patch.weekly_targets as Record<string, unknown>)
      : null;

  const updated: BrandProfile = {
    ...current,
    brand_name:
      cleanStr(patch.brand_name, 100) || current.brand_name,
    owner_name:
      cleanStr(patch.owner_name, 100) || current.owner_name,
    city:
      patch.city !== undefined ? cleanStr(patch.city, 80) : current.city,
    website_url: sanitizedWebsite,
    contact_email:
      patch.contact_email !== undefined
        ? cleanStr(patch.contact_email, 120)
        : current.contact_email,
    phone_mobile:
      patch.phone_mobile !== undefined
        ? cleanStr(patch.phone_mobile, 40)
        : current.phone_mobile,
    phone_landline:
      patch.phone_landline !== undefined
        ? cleanStr(patch.phone_landline, 40)
        : current.phone_landline,
    postal_address:
      patch.postal_address !== undefined
        ? cleanStr(patch.postal_address, 240)
        : current.postal_address,
    tax_note:
      patch.tax_note !== undefined
        ? cleanStr(patch.tax_note, 300)
        : current.tax_note,
    positioning_statement:
      cleanStr(patch.positioning_statement, 800) ||
      current.positioning_statement,
    tone_rules:
      cleanStr(patch.tone_rules, 1200) || current.tone_rules,
    core_services:
      patch.core_services !== undefined
        ? sanitizeCoreServices(patch.core_services, current.core_services)
        : current.core_services,
    excluded_services:
      patch.excluded_services !== undefined
        ? sanitizeStringList(
            patch.excluded_services,
            current.excluded_services,
            12,
            200,
          )
        : current.excluded_services,
    verified_references:
      patch.verified_references !== undefined
        ? sanitizeVerifiedReferences(
            patch.verified_references,
            current.verified_references,
          )
        : current.verified_references,
    discovery_questions:
      patch.discovery_questions !== undefined
        ? sanitizeStringList(
            patch.discovery_questions,
            current.discovery_questions,
            15,
            240,
          )
        : current.discovery_questions,
    pricing_benchmarks:
      patch.pricing_benchmarks !== undefined
        ? sanitizePricingBenchmarks(
            patch.pricing_benchmarks,
            current.pricing_benchmarks,
          )
        : current.pricing_benchmarks,
    openrouter_config: rawOrConfig
      ? {
          researchModel: resolveApprovedModel(
            cleanStr(rawOrConfig.researchModel, 120),
            current.openrouter_config.researchModel,
          ).id,
          writingModel: resolveApprovedModel(
            cleanStr(rawOrConfig.writingModel, 120),
            current.openrouter_config.writingModel,
          ).id,
          contentModel: resolveApprovedModel(
            cleanStr(rawOrConfig.contentModel, 120),
            current.openrouter_config.contentModel,
          ).id,
          privacyMode:
            rawOrConfig.privacyMode !== undefined
              ? Boolean(rawOrConfig.privacyMode)
              : current.openrouter_config.privacyMode,
          temperature: Math.min(
            Math.max(
              Number.isFinite(Number(rawOrConfig.temperature))
                ? Number(rawOrConfig.temperature)
                : current.openrouter_config.temperature,
              0,
            ),
            1,
          ),
        }
      : current.openrouter_config,
    // Always server-clamped (max 15 EUR/month, max 40 calls/day, stopOnLimit always true)
    budget_config: rawBudgetConfig
      ? clampBudgetSettings(rawBudgetConfig)
      : clampBudgetSettings(current.budget_config),
    weekly_targets: rawWeeklyTargets
      ? {
          leadsChecked: Math.min(
            Math.max(
              Math.round(Number(rawWeeklyTargets.leadsChecked) || 12),
              1,
            ),
            200,
          ),
          auditsSent: Math.min(
            Math.max(Math.round(Number(rawWeeklyTargets.auditsSent) || 5), 1),
            100,
          ),
          callsBooked: Math.min(
            Math.max(Math.round(Number(rawWeeklyTargets.callsBooked) || 2), 1),
            50,
          ),
        }
      : current.weekly_targets,
  };

  const saved = await saveBrandProfile(updated);
  return NextResponse.json({ brand: saved }, { headers: PRIVATE_JSON_HEADERS });
}
