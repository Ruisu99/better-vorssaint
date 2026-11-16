import {
  getIdentity,
  requireIdentity,
  type IdentityRequest,
  type VerifiedIdentity,
} from "../../cursor/identity";
import type { ViewerInfo } from "./types";

export function scopeKeyFor(identity: VerifiedIdentity): string {
  return identity.stage === "preview"
    ? `${identity.sub}:preview`
    : identity.sub;
}

export function viewerInfoFor(identity: VerifiedIdentity): ViewerInfo {
  return {
    name:
      identity.name.trim() !== ""
        ? identity.name
        : identity.kind === "key"
          ? "API-Schlüssel"
          : "Linkify Konto",
    kind: identity.kind,
    simulated: identity.simulated,
    stage: identity.stage,
  };
}

export async function requireScopedIdentity(
  request: IdentityRequest,
): Promise<{ identity: VerifiedIdentity; scopeKey: string } | Response> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return { identity, scopeKey: scopeKeyFor(identity) };
}

export async function getOptionalScopedIdentity(
  request: IdentityRequest,
): Promise<{ identity: VerifiedIdentity; scopeKey: string } | null> {
  const identity = await getIdentity(request);
  if (!identity.verified) return null;
  return { identity, scopeKey: scopeKeyFor(identity) };
}

export const PRIVATE_JSON_HEADERS = {
  "cache-control": "private, no-store",
} as const;
