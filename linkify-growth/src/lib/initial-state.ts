import { headers } from "next/headers";
import {
  getOptionalScopedIdentity,
  viewerInfoFor,
} from "./auth";
import {
  buildDefaultBrandProfile,
} from "./defaults";
import {
  getOpenRouterKeyStatus,
  isOpenRouterConfigured,
  type OpenRouterKeyStatus,
} from "./openrouter";
import type {
  AiRun,
  BrandProfile,
  ContentPost,
  Lead,
  OutreachItem,
  ViewerInfo,
} from "./types";
import {
  clearSampleData,
  getAiUsageSummary,
  getBrandProfile,
  hasPersistedProfile,
  listAiRuns,
  listContentPosts,
  listLeads,
  listRecentOutreach,
} from "./workspace-data";

export interface WorkspaceSnapshot {
  authenticated: boolean;
  viewer: ViewerInfo | null;
  initialized: boolean;
  openRouterConnected: boolean;
  brand: BrandProfile;
  leads: Lead[];
  recentOutreach: (OutreachItem & { company_name?: string })[];
  contentPosts: ContentPost[];
  aiRuns: AiRun[];
  usageSummary: {
    monthCalls: number;
    monthCostUsd: number;
    todayCalls: number;
    todayCostUsd: number;
    monthTokens: number;
  };
  keyStatus: OpenRouterKeyStatus;
}

export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const reqHeaders = await headers();
  const auth = await getOptionalScopedIdentity(reqHeaders);

  if (!auth) {
    return {
      authenticated: false,
      viewer: null,
      initialized: false,
      openRouterConnected: false,
      brand: buildDefaultBrandProfile("signed-out"),
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
      keyStatus: {
        connected: false,
        limitUsd: null,
        limitRemainingUsd: null,
        usageDailyUsd: null,
        usageMonthlyUsd: null,
        isFreeTier: null,
      },
    };
  }

  const { identity, scopeKey } = auth;
  const initialized = await hasPersistedProfile(scopeKey);
  const keyStatus = await getOpenRouterKeyStatus();

  if (!initialized) {
    return {
      authenticated: true,
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
      keyStatus,
    };
  }

  // Ensure any legacy demo rows from earlier builds are purged cleanly
  await clearSampleData(scopeKey).catch(() => {});

  const [brand, leads, recentOutreach, contentPosts, aiRuns, usageSummary] =
    await Promise.all([
      getBrandProfile(scopeKey),
      listLeads(scopeKey),
      listRecentOutreach(scopeKey),
      listContentPosts(scopeKey),
      listAiRuns(scopeKey),
      getAiUsageSummary(scopeKey),
    ]);

  return {
    authenticated: true,
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
  };
}
