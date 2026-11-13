import { NextResponse } from "next/server";
import {
  PRIVATE_JSON_HEADERS,
  requireScopedIdentity,
  viewerInfoFor,
} from "@/lib/auth";
import { buildDefaultBrandProfile } from "@/lib/defaults";
import {
  getOpenRouterKeyStatus,
  isOpenRouterConfigured,
} from "@/lib/openrouter";
import {
  clearSampleData,
  getAiUsageSummary,
  getBrandProfile,
  hasPersistedProfile,
  listAiRuns,
  listContentPosts,
  listLeads,
  listRecentOutreach,
} from "@/lib/workspace-data";

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const { identity, scopeKey } = auth;
  const initialized = await hasPersistedProfile(scopeKey);

  if (!initialized) {
    return NextResponse.json(
      {
        viewer: viewerInfoFor(identity),
        initialized: false,
        openRouterConnected: isOpenRouterConfigured(),
        brand: buildDefaultBrandProfile(scopeKey),
        leads: [],
        recentOutreach: [],
        contentPosts: [],
        aiRuns: [],
        usageSummary: {
          monthCalls: 0,
          monthCostUsd: 0,
          todayCalls: 0,
          todayCostUsd: 0,
          monthTokens: 0,
        },
        keyStatus: await getOpenRouterKeyStatus(),
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  await clearSampleData(scopeKey).catch(() => {});

  const [brand, leads, recentOutreach, contentPosts, aiRuns, usageSummary, keyStatus] =
    await Promise.all([
      getBrandProfile(scopeKey),
      listLeads(scopeKey),
      listRecentOutreach(scopeKey),
      listContentPosts(scopeKey),
      listAiRuns(scopeKey),
      getAiUsageSummary(scopeKey),
      getOpenRouterKeyStatus(),
    ]);

  return NextResponse.json(
    {
      viewer: viewerInfoFor(identity),
      initialized: true,
      openRouterConnected: isOpenRouterConfigured(),
      brand,
      leads,
      recentOutreach,
      contentPosts,
      aiRuns,
      usageSummary,
      keyStatus,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
