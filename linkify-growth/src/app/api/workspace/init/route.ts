import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { cleanStr, errorResponse, parseSafeJsonBody } from "@/lib/validation";
import {
  clearSampleData,
  ensureWorkspaceSeeded,
} from "@/lib/workspace-data";

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 8_192);
  } catch (err) {
    return errorResponse(err, 400);
  }

  const action = cleanStr(body.action, 40);
  if (action === "clear_samples") {
    await ensureWorkspaceSeeded(auth.scopeKey);
    await clearSampleData(auth.scopeKey);
    return NextResponse.json(
      { ok: true, cleared: true },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  const result = await ensureWorkspaceSeeded(auth.scopeKey);
  return NextResponse.json(
    { ok: true, ...result },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
