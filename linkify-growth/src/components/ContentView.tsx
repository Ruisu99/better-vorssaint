"use client";

import { useState } from "react";
import { Check, Copy, Sparkles, Trash2 } from "lucide-react";
import {
  apiFetchJson,
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  formatBerlinDate,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type {
  ContentFormat,
  ContentPost,
  ContentStatus,
  TargetTrack,
} from "@/lib/types";

export function ContentView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const [posts, setPosts] = useState<ContentPost[]>(snapshot.contentPosts);
  const [format, setFormat] = useState<ContentFormat>("linkedin");
  const [targetTrack, setTargetTrack] = useState<TargetTrack>("kmu");
  const [sourceBasis, setSourceBasis] = useState<string>(
    snapshot.brand.verified_references[0]?.clientName ??
      "Praxisbeobachtung Linkify",
  );
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [packGenerating, setPackGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    const res = await apiFetchJson<{
      post: ContentPost;
      limitBlockedReason?: string;
    }>("/api/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format,
        targetTrack,
        sourceBasis,
        topic: topic.trim(),
      }),
    });
    setGenerating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPosts((prev) => [res.data.post, ...prev]);
    setTopic("");
    setNotice(
      res.data.limitBlockedReason
        ? `Budget-Limit aktiv (${res.data.limitBlockedReason}) – Entwurf lokal erstellt.`
        : "Beitragsentwurf erstellt – vor Veröffentlichung Fakten kurz gegenprüfen.",
    );
  }

  async function handleWeeklyPack() {
    setPackGenerating(true);
    setError(null);
    setNotice(null);
    const res = await apiFetchJson<{ posts?: ContentPost[] }>("/api/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "weekly_pack",
        topic: topic.trim() || undefined,
      }),
    });
    setPackGenerating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPosts((prev) => [...(res.data.posts ?? []), ...prev]);
    setNotice(
      `${(res.data.posts ?? []).length} Beiträge (KMU, Startup & Akquise-Aufhänger) erstellt.`,
    );
  }

  async function handleStatusChange(postId: string, status: ContentStatus) {
    const res = await fetch("/api/content", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: postId, status }),
    });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
    }
  }

  async function handleDelete(postId: string) {
    const res = await fetch(`/api/content?id=${encodeURIComponent(postId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  }

  async function copyPost(post: ContentPost) {
    await navigator.clipboard.writeText(`${post.title}\n\n${post.body}`);
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13px] font-medium text-[#0000F5]">
          Glaubwürdige Sichtbarkeit ohne erfundene Zahlen
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
          Content- & Fallstudien-Studio
        </h1>
        <p className="mt-1 text-[14px] text-[#6B7280] max-w-2xl">
          Generiere LinkedIn-Beiträge, Website-Insights und Gesprächs-Aufhänger
          aus deinen echten Projekten und Praxisbeobachtungen – im ruhigen
          Linkify-Stil.
        </p>
      </div>

      {/* Generator */}
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ContentFormat)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
            >
              {(Object.keys(CONTENT_FORMAT_LABELS) as ContentFormat[]).map(
                (f) => (
                  <option key={f} value={f}>
                    {CONTENT_FORMAT_LABELS[f]}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Zielgruppe
            </label>
            <select
              value={targetTrack}
              onChange={(e) => setTargetTrack(e.target.value as TargetTrack)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
            >
              <option value="kmu">Lokale Unternehmen & KMU</option>
              <option value="startup">Startups & Produktteams</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
              Verifizierte Referenz / Basis
            </label>
            <select
              value={sourceBasis}
              onChange={(e) => setSourceBasis(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
            >
              {snapshot.brand.verified_references.map((ref) => (
                <option
                  key={ref.id}
                  value={`${ref.clientName}: ${ref.summary}`}
                >
                  {ref.clientName} ({ref.type})
                </option>
              ))}
              <option value="Eigene Praxisbeobachtung (ohne konkrete Kundenreferenz)">
                Eigene Praxisbeobachtung (neutral)
              </option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
            Konkretes Thema oder Beobachtung aus deinem Alltag *
          </label>
          <textarea
            rows={3}
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="z. B. Warum lokale Handwerksbetriebe durch eine veraltete mobile Seite Bewerber verlieren – und wie ein klarer Aufbau das löst."
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#0000F5]"
          />
        </div>

        {error && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-[13px] text-[#1A1A2E] bg-[#F0F3FF] border border-[#0000F5]/20 rounded-xl px-3.5 py-2">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-[12px] text-[#6B7280]">
            Modell: {snapshot.brand.openrouter_config.contentModel}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleWeeklyPack}
              disabled={packGenerating || generating}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#0000F5]/30 bg-[#F0F3FF] text-[#0000F5] disabled:opacity-50 text-[13px] font-medium cursor-pointer"
            >
              <span>
                {packGenerating
                  ? "Erstelle 3er-Paket..."
                  : "3er-Wochen-Paket generieren"}
              </span>
            </button>
            <button
              type="submit"
              disabled={generating || packGenerating || !topic.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[14px] font-medium cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {generating ? "Erstelle Entwurf..." : "Beitrag entwerfen"}
              </span>
            </button>
          </div>
        </div>
      </form>

      {/* Posts List */}
      <div className="space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#F0F3FF] text-[#0000F5]">
                    {CONTENT_FORMAT_LABELS[post.format]}
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">
                    {post.target_track === "startup" ? "Startup / Produkt" : "KMU"}
                  </span>
                  <span className="text-[11px] text-[#6B7280]">
                    {formatBerlinDate(post.created_at)} · {post.model_used}
                  </span>
                </div>
                <h2 className="mt-2 text-[18px] font-semibold text-[#1A1A2E]">
                  {post.title}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={post.status}
                  onChange={(e) =>
                    handleStatusChange(post.id, e.target.value as ContentStatus)
                  }
                  className="px-3 py-1.5 rounded-full border border-[#E5E7EB] bg-white text-[12px] font-medium"
                >
                  {(Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[]).map(
                    (s) => (
                      <option key={s} value={s}>
                        {CONTENT_STATUS_LABELS[s]}
                      </option>
                    ),
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => copyPost(post)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#E5E7EB] text-[12px] font-medium cursor-pointer"
                >
                  {copiedId === post.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === post.id ? "Kopiert" : "Kopieren"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  className="p-1.5 rounded-full border border-[#E5E7EB] text-[#6B7280] hover:text-red-700 cursor-pointer"
                  aria-label="Beitrag löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-[14px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap bg-[#F8F9FC] rounded-xl p-4">
              {post.body}
            </div>

            {post.verification_notes.length > 0 && (
              <div className="text-[12px] text-[#6B7280] border-t border-[#E5E7EB] pt-3">
                <span className="font-medium text-[#1A1A2E]">
                  Prüfpunkte vor Veröffentlichung:
                </span>{" "}
                {post.verification_notes.join(" · ")}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
