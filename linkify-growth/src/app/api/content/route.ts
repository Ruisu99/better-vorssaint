import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import { runAiTask } from "@/lib/openrouter";
import { buildContentPrompt, buildLinkifySystemPrompt } from "@/lib/prompts";
import type { ContentFormat, ContentStatus, TargetTrack } from "@/lib/types";
import {
  assertSafeMutationRequest,
  cleanStr,
  errorResponse,
  parseSafeJsonBody,
} from "@/lib/validation";
import {
  createContentPost,
  deleteContentPost,
  ensureWorkspaceSeeded,
  getBrandProfile,
  listContentPosts,
} from "@/lib/workspace-data";

export const maxDuration = 60;

const VALID_FORMATS = new Set<ContentFormat>([
  "linkedin",
  "website_insight",
  "case_study",
  "outreach_hook",
]);

const VALID_CONTENT_STATUS = new Set<ContentStatus>([
  "entwurf",
  "geprueft",
  "veroeffentlicht",
]);

function parseJsonSafe<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const posts = await listContentPosts(auth.scopeKey);
  return NextResponse.json({ posts }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 24_576);
  } catch (err) {
    return errorResponse(err, 400);
  }

  await ensureWorkspaceSeeded(auth.scopeKey);
  const brand = await getBrandProfile(auth.scopeKey);

  if (cleanStr(body.action, 40) === "weekly_pack") {
    const focusTopic =
      cleanStr(body.topic, 300) ||
      "Warum ein sauberer Website-Relaunch oder eine pragmatische Web-App schneller zu Anfragen führt";

    const packSpecs: Array<{
      format: ContentFormat;
      track: TargetTrack;
      basis: string;
      topic: string;
    }> = [
      {
        format: "linkedin",
        track: "kmu",
        basis:
          brand.verified_references[0]
            ? `${brand.verified_references[0].clientName}: ${brand.verified_references[0].summary}`
            : "Praxisbeobachtung KMU",
        topic: `KMU-Perspektive: ${focusTopic}`,
      },
      {
        format: "linkedin",
        track: "startup",
        basis:
          brand.verified_references[1]
            ? `${brand.verified_references[1].clientName}: ${brand.verified_references[1].summary}`
            : "Praxisbeobachtung Fullstack & Web-Apps",
        topic: `Startup & Produkt-Perspektive: ${focusTopic}`,
      },
      {
        format: "outreach_hook",
        track: "kmu",
        basis: "Direkte Akquise-Ansprache ohne Agentur-Floskeln",
        topic: `Gesprächs-Aufhänger für Erstkontakt: ${focusTopic}`,
      },
    ];

    const createdPosts = (
      await Promise.all(
        packSpecs.map(async (spec) => {
          try {
            const aiRes = await runAiTask({
              scopeKey: auth.scopeKey,
              taskType: "content_pack",
              model: brand.openrouter_config.contentModel,
              systemPrompt: buildLinkifySystemPrompt(brand),
              userPrompt: buildContentPrompt({
                brand,
                format: spec.format,
                targetTrack: spec.track,
                sourceBasis: spec.basis,
                userTopic: spec.topic,
              }),
              temperature: brand.openrouter_config.temperature,
              maxTokens: 1000,
              reasoningEffort: "low",
              privacyMode: true,
              summaryLabel: `Content-Paket (${spec.format}/${spec.track})`,
              fallbackFn: () =>
                JSON.stringify({
                  title: `${spec.track === "startup" ? "Produktteam" : "KMU"}: ${focusTopic.slice(0, 60)}`,
                  body: `Praxisimpuls für ${spec.track === "startup" ? "Startups & Produktteams" : "lokale Unternehmen"}: ${spec.topic}\n\nBasis: ${spec.basis}`,
                  verificationNotes: ["Vor Veröffentlichung Details prüfen."],
                }),
            });
            const parsed = parseJsonSafe<{
              title?: string;
              body?: string;
              verificationNotes?: string[];
            }>(aiRes.text);
            return await createContentPost({
              id: crypto.randomUUID(),
              owner_sub: auth.scopeKey,
              title: (parsed?.title || spec.topic).slice(0, 180),
              format: spec.format,
              target_track: spec.track,
              source_basis: spec.basis.slice(0, 200),
              body: (parsed?.body || aiRes.text).slice(0, 8000),
              verification_notes: Array.isArray(parsed?.verificationNotes)
                ? parsed.verificationNotes.map(String).slice(0, 8)
                : ["Vor Veröffentlichung kurz prüfen."],
              status: "entwurf",
              model_used: aiRes.modelUsed,
              is_sample: false,
            });
          } catch {
            return null;
          }
        }),
      )
    ).filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json(
      { posts: createdPosts },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const format: ContentFormat = VALID_FORMATS.has(body.format as ContentFormat)
    ? (body.format as ContentFormat)
    : "linkedin";
  const targetTrack: TargetTrack =
    body.targetTrack === "startup" ? "startup" : "kmu";
  const sourceBasis =
    cleanStr(body.sourceBasis, 240) || "Praxisbeobachtung Linkify";
  const topic = cleanStr(body.topic, 1000);

  if (!topic) {
    return NextResponse.json(
      { error: "Bitte ein Thema oder eine reale Beobachtung eingeben." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const fallbackDraft = {
    title: topic.slice(0, 80),
    body:
      targetTrack === "startup"
        ? `Bei Web-Apps und Plattformen entscheidet oft nicht das größte Feature-Set, sondern eine klare Struktur von Anfang an.\n\nAusgangspunkt: ${topic}\nBasis: ${sourceBasis}\n\nIn meiner Arbeit als Fullstack-Entwickler (u. a. bei Skabe GbR) erlebe ich immer wieder: Saubere Rollen, nachvollziehbare Buchungs- oder Nutzerabläufe und eine dokumentierte Übergabe sparen später Monate an Korrekturen.\n\nWer direkt mit dem Entwickler zusammenarbeitet, der das System auch konzipiert, kommt schneller zu einem funktionierenden Produkt.`
        : `Viele Unternehmen leisten hervorragende Arbeit – aber ihre Website spiegelt das noch nicht wider.\n\nBeobachtung: ${topic}\nBasis: ${sourceBasis}\n\nBeim Neuaufbau einer Unternehmenswebsite (wie beispielsweise bei der Förderkraft GmbH) kommt es nicht auf laute Effekte an, sondern auf klare Leistungsstruktur, schnelle mobile Nutzung und einfache Pflege.\n\nGenau darauf fokussiere ich mich bei Linkify: direkter Kontakt, pragmatische Technik und ein Auftritt mit Charakter.`,
    verificationNotes: [
      "Prüfen, ob genannte Beispiele oder Projektdetails vor Veröffentlichung freigegeben sind.",
      "Eigene persönliche Formulierung vor dem Posten kurz gegenlesen.",
    ],
  };

  try {
    const aiRes = await runAiTask({
      scopeKey: auth.scopeKey,
      taskType: "content",
      model: brand.openrouter_config.contentModel,
      systemPrompt: buildLinkifySystemPrompt(brand),
      userPrompt: buildContentPrompt({
        brand,
        format,
        targetTrack,
        sourceBasis,
        userTopic: topic,
      }),
      temperature: brand.openrouter_config.temperature,
      maxTokens: 1300,
      privacyMode: brand.openrouter_config.privacyMode,
      summaryLabel: `Content (${format}): ${topic.slice(0, 50)}`,
      fallbackFn: () => JSON.stringify(fallbackDraft),
    });

    const parsed = parseJsonSafe<{
      title?: string;
      body?: string;
      verificationNotes?: string[];
    }>(aiRes.text);

    const post = await createContentPost({
      id: crypto.randomUUID(),
      owner_sub: auth.scopeKey,
      title: (parsed?.title || fallbackDraft.title).slice(0, 180),
      format,
      target_track: targetTrack,
      source_basis: sourceBasis.slice(0, 200),
      body: (parsed?.body || aiRes.text).slice(0, 8000),
      verification_notes: Array.isArray(parsed?.verificationNotes)
        ? parsed.verificationNotes.map(String).slice(0, 8)
        : fallbackDraft.verificationNotes,
      status: "entwurf",
      model_used: aiRes.modelUsed,
      is_sample: false,
    });

    return NextResponse.json(
      {
        post,
        providerMode: aiRes.providerMode,
        limitBlockedReason: aiRes.limitBlockedReason,
        autoDowngraded: aiRes.autoDowngraded,
        estimatedCostUsd: aiRes.estimatedCostUsd,
      },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Content-Generierung fehlgeschlagen.";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: PRIVATE_JSON_HEADERS },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 24_576);
  } catch (err) {
    return errorResponse(err, 400);
  }

  const id = cleanStr(body.id, 80);
  if (!id) {
    return NextResponse.json(
      { error: "Post-ID fehlt." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const existing = (await listContentPosts(auth.scopeKey)).find(
    (p) => p.id === id,
  );
  if (!existing) {
    return NextResponse.json(
      { error: "Beitrag nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const status: ContentStatus = VALID_CONTENT_STATUS.has(
    body.status as ContentStatus,
  )
    ? (body.status as ContentStatus)
    : existing.status;

  const updated = await createContentPost({
    id: existing.id,
    owner_sub: auth.scopeKey,
    title: cleanStr(body.title, 180) || existing.title,
    format: existing.format,
    target_track: existing.target_track,
    source_basis: existing.source_basis,
    body:
      typeof body.body === "string"
        ? cleanStr(body.body, 8000)
        : existing.body,
    verification_notes: existing.verification_notes,
    status,
    model_used: existing.model_used,
    is_sample: existing.is_sample,
  });

  return NextResponse.json(
    { post: updated },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  try {
    assertSafeMutationRequest(request, { requireJsonContentType: false });
  } catch (err) {
    return errorResponse(err, 403);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json(
      { error: "id Query-Parameter fehlt." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const ok = await deleteContentPost(auth.scopeKey, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Beitrag nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: PRIVATE_JSON_HEADERS });
}
