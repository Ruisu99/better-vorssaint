import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { isOpenRouterConfigured, runAiTask } from "@/lib/openrouter";
import { ensureWorkspaceSeeded, getBrandProfile } from "@/lib/workspace-data";

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  let model = brand.openrouter_config.researchModel;
  try {
    const body = (await request.json()) as { model?: string };
    if (body.model?.trim()) model = body.model.trim().slice(0, 120);
  } catch {
    // default model
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json(
      {
        connected: false,
        providerMode: "local_fallback",
        message:
          "OPENROUTER_API_KEY ist in den App-Secrets noch nicht hinterlegt. Die App nutzt solange den sicheren lokalen Vorschau-Modus.",
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const res = await runAiTask({
      scopeKey: auth.scopeKey,
      taskType: "connection_test",
      model,
      systemPrompt: "Antworte knapp auf Deutsch in genau einem Satz.",
      userPrompt:
        "Bestätige kurz, dass die Verbindung für Linkify Growth OS aktiv ist.",
      temperature: 0.1,
      maxTokens: 80,
      privacyMode: true,
      summaryLabel: `Verbindungstest (${model})`,
      fallbackFn: () => "Lokaler Vorschau-Modus aktiv.",
    });

    return NextResponse.json(
      {
        connected: true,
        providerMode: res.providerMode,
        modelUsed: res.modelUsed,
        reply: res.text,
        usage: res.usage,
      },
      { headers: PRIVATE_JSON_HEADERS },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OpenRouter-Test fehlgeschlagen.";
    return NextResponse.json(
      { connected: true, error: message },
      { status: 502, headers: PRIVATE_JSON_HEADERS },
    );
  }
}
