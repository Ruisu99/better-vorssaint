import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import {
  clearSampleData,
  ensureWorkspaceSeeded,
} from "@/lib/workspace-data";

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }

  if (body.action === "clear_samples") {
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
