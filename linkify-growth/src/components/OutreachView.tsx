"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Mail, Sparkles } from "lucide-react";
import {
  formatBerlinDateTime,
  OUTREACH_CHANNEL_LABELS,
  OUTREACH_STATUS_LABELS,
  safeMailto,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type { OutreachChannel, OutreachItem } from "@/lib/types";

export function OutreachView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const [items, setItems] = useState(snapshot.recentOutreach);
  const [selectedLeadId, setSelectedLeadId] = useState<string>(
    snapshot.leads[0]?.id ?? "",
  );
  const [channel, setChannel] = useState<OutreachChannel>("reply_draft");
  const [contextInput, setContextInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Non-binding internal scope calculator
  const [calcPages, setCalcPages] = useState(4);
  const [calcDesignHours, setCalcDesignHours] = useState(6);
  const [calcDevHours, setCalcDevHours] = useState(12);

  const selectedLead = snapshot.leads.find((l) => l.id === selectedLeadId);

  const baseRate =
    snapshot.brand.pricing_benchmarks.find(
      (p) => p.id === "base-page" && p.confirmed,
    )?.amountEur ?? 0;
  const pageRate =
    snapshot.brand.pricing_benchmarks.find(
      (p) => p.id === "sub-page" && p.confirmed,
    )?.amountEur ?? 0;
  const designRate =
    snapshot.brand.pricing_benchmarks.find(
      (p) => p.id === "hourly-design" && p.confirmed,
    )?.amountEur ?? 0;
  const devRate =
    snapshot.brand.pricing_benchmarks.find(
      (p) => p.id === "hourly-fullstack" && p.confirmed,
    )?.amountEur ?? 0;

  const hasConfirmedRates =
    baseRate > 0 || pageRate > 0 || designRate > 0 || devRate > 0;
  const calcTotal =
    baseRate +
    Math.max(calcPages - 1, 0) * pageRate +
    calcDesignHours * designRate +
    calcDevHours * devRate;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLeadId) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          leadId: selectedLeadId,
          channel,
          extraContext: contextInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generierung fehlgeschlagen.");
        return;
      }
      const created: OutreachItem & { company_name?: string } = {
        ...data.item,
        company_name: selectedLead?.company_name,
      };
      setItems((prev) => [created, ...prev]);
      setNotice(
        data.limitBlockedReason
          ? `Budget-Limit aktiv (${data.limitBlockedReason}) – lokaler Entwurf erstellt.`
          : `Entwurf für ${selectedLead?.company_name ?? "Lead"} erstellt.`,
      );
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyItem(item: OutreachItem) {
    await navigator.clipboard.writeText(
      item.subject ? `${item.subject}\n\n${item.body}` : item.body,
    );
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13px] font-medium text-[#0000F5]">
          Direkte Kommunikation ohne Agentur-Floskeln
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
          Akquise, Antworten & Scope-Hilfe
        </h1>
        <p className="mt-1 text-[14px] text-[#6B7280] max-w-2xl">
          Entwirf Erstansprachen, Video-Audit-Leitfäden, Follow-ups oder
          Antworten auf Kundenfragen – gesteuert über dein OpenRouter-Budget.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generator Form */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-2 rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4"
        >
          <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
            Nachricht oder Antwort entwerfen
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                Lead aus Pipeline
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
              >
                {snapshot.leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                Format / Kanal
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
              >
                {(Object.keys(OUTREACH_CHANNEL_LABELS) as OutreachChannel[]).map(
                  (c) => (
                    <option key={c} value={c}>
                      {OUTREACH_CHANNEL_LABELS[c]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              {channel === "reply_draft"
                ? "Eingehende Kunden-Nachricht / Frage"
                : "Kontext, Fokus oder Ziel für das Gespräch"}
            </label>
            <textarea
              rows={4}
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              placeholder={
                channel === "reply_draft"
                  ? "Kundenmail oder Rückfrage einfügen..."
                  : "z. B. Fokus auf mobile Darstellung und direkte Bewerbungen..."
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px] focus:outline-none focus:border-[#0000F5]"
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={generating || !selectedLeadId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[13px] font-medium cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? "Erstelle..." : "Entwurf generieren"}</span>
            </button>
          </div>
        </form>

        {/* Internal Non-Binding Scope Calculator */}
        <aside className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
              Interne Scope-Rechenhilfe
            </h2>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Unverbindliche Orientierung auf Basis deiner eigenen Richtwerte –
              keine feste Preisliste.
            </p>
          </div>

          {!hasConfirmedRates ? (
            <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB] p-4 space-y-2 text-[13px]">
              <p className="text-[#1A1A2E] font-medium">
                Richtwerte noch nicht hinterlegt
              </p>
              <p className="text-[#6B7280] text-[12px]">
                Preise und Stundensätze sind bewusst nicht fest codiert. Du
                kannst deine aktuellen internen Richtwerte jederzeit unter „KI &
                Kosten“ pflegen.
              </p>
              <Link
                href="/settings"
                className="inline-block text-[12px] font-medium text-[#0000F5] hover:underline"
              >
                Richtwerte eintragen
              </Link>
            </div>
          ) : (
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#6B7280]">Seitenanzahl</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={calcPages}
                  onChange={(e) => setCalcPages(Number(e.target.value) || 1)}
                  className="w-20 px-2.5 py-1 rounded-lg border border-[#E5E7EB] text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6B7280]">Design/UX-Stunden</span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={calcDesignHours}
                  onChange={(e) =>
                    setCalcDesignHours(Number(e.target.value) || 0)
                  }
                  className="w-20 px-2.5 py-1 rounded-lg border border-[#E5E7EB] text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6B7280]">Fullstack-Stunden</span>
                <input
                  type="number"
                  min={0}
                  max={400}
                  value={calcDevHours}
                  onChange={(e) => setCalcDevHours(Number(e.target.value) || 0)}
                  className="w-20 px-2.5 py-1 rounded-lg border border-[#E5E7EB] text-right"
                />
              </div>
              <div className="pt-3 border-t border-[#E5E7EB] flex items-baseline justify-between">
                <span className="text-[#6B7280]">Interne Orientierung</span>
                <span className="text-[20px] font-semibold text-[#0000F5]">
                  {calcTotal.toLocaleString("de-DE")} €
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280]">
                Hinweis: Vor Angebotserstellung Umfang, Risiken und
                Steuerhinweise prüfen.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Recent Outreach Drafts */}
      <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
        <h2 className="text-[17px] font-semibold text-[#1A1A2E]">
          Letzte Entwürfe & Nachrichten ({items.length})
        </h2>

        <div className="divide-y divide-[#E5E7EB]">
          {items.map((item) => {
            const lead = snapshot.leads.find((l) => l.id === item.lead_id);
            const mailtoUrl =
              lead?.contact_email && item.body
                ? safeMailto(lead.contact_email, item.subject, item.body)
                : null;
            return (
              <div key={item.id} className="py-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/pipeline/${item.lead_id}`}
                      className="font-semibold text-[14px] text-[#1A1A2E] hover:text-[#0000F5]"
                    >
                      {item.company_name ?? lead?.company_name ?? "Lead"}
                    </Link>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F0F3FF] text-[#0000F5]">
                      {OUTREACH_CHANNEL_LABELS[item.channel]}
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">
                      {OUTREACH_STATUS_LABELS[item.status]}
                    </span>
                    <span className="text-[11px] text-[#6B7280]">
                      {formatBerlinDateTime(item.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyItem(item)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#E5E7EB] text-[12px] text-[#1A1A2E] cursor-pointer"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === item.id ? "Kopiert" : "Kopieren"}</span>
                    </button>
                    {mailtoUrl && (
                      <a
                        href={mailtoUrl}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#E5E7EB] text-[12px] text-[#1A1A2E]"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Mail</span>
                      </a>
                    )}
                  </div>
                </div>
                {item.subject && (
                  <p className="text-[13px] font-medium text-[#1A1A2E]">
                    Betreff: {item.subject}
                  </p>
                )}
                <p className="text-[13px] text-[#6B7280] whitespace-pre-wrap line-clamp-4">
                  {item.body}
                </p>
              </div>
            );
          })}

          {items.length === 0 && (
            <p className="py-6 text-[14px] text-[#6B7280]">
              Noch keine Entwürfe erzeugt. Wähle oben einen Lead aus oder starte
              direkt aus der Lead-Detailseite.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
