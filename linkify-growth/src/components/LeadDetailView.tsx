"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Mail,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  apiFetchJson,
  formatBerlinDate,
  formatBerlinDateTime,
  OUTREACH_CHANNEL_LABELS,
  OUTREACH_STATUS_LABELS,
  PRIORITY_LABELS,
  safeHref,
  safeMailto,
  STATUS_LABELS,
} from "@/lib/client-utils";
import type {
  BrandProfile,
  Lead,
  LeadPriority,
  LeadStatus,
  OutreachChannel,
  OutreachItem,
  TargetTrack,
} from "@/lib/types";

interface LeadDetailViewProps {
  initialLead: Lead;
  initialOutreach: OutreachItem[];
  brand: BrandProfile;
}

const CHANNELS: OutreachChannel[] = [
  "email",
  "video_audit",
  "brief",
  "follow_up",
  "reply_draft",
  "angebot_outline",
];

export function LeadDetailView({
  initialLead,
  initialOutreach,
  brand,
}: LeadDetailViewProps) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [outreachList, setOutreachList] =
    useState<OutreachItem[]>(initialOutreach);
  const [savingLead, setSavingLead] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const [selectedChannel, setSelectedChannel] =
    useState<OutreachChannel>("email");
  const [extraContext, setExtraContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genNotice, setGenNotice] = useState<string | null>(null);

  const [activeDraft, setActiveDraft] = useState<OutreachItem | null>(
    initialOutreach[0] ?? null,
  );
  const [draftSubject, setDraftSubject] = useState(
    initialOutreach[0]?.subject ?? "",
  );
  const [draftBody, setDraftBody] = useState(initialOutreach[0]?.body ?? "");
  const [copied, setCopied] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  const safeWebsite = safeHref(lead.website_url);
  const visualComplete =
    lead.visual_checked_desktop && lead.visual_checked_mobile;

  async function saveLeadPatch(patch: Partial<Lead>) {
    setSavingLead(true);
    const res = await apiFetchJson<{ lead: Lead }>(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSavingLead(false);
    if (res.ok) {
      setLead(res.data.lead);
    }
  }

  async function handleRescan(withAi: boolean) {
    if (!lead.website_url) return;
    setRescanning(true);
    setScanMsg(null);
    const res = await apiFetchJson<{
      lead: Lead;
      aiMeta?: {
        providerMode: string;
        modelUsed: string;
        limitBlockedReason?: string;
      } | null;
    }>("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        url: lead.website_url,
        includePageSpeed: true,
        runAiQualification: withAi,
        saveToPipeline: true,
      }),
    });
    setRescanning(false);
    if (!res.ok) {
      setScanMsg(res.error);
      return;
    }
    setLead(res.data.lead);
    setScanMsg(
      res.data.aiMeta?.limitBlockedReason
        ? `Scan aktualisiert (${res.data.aiMeta.limitBlockedReason})`
        : res.data.aiMeta?.providerMode === "openrouter"
          ? `Technischer Scan + KI-Bewertung (${res.data.aiMeta.modelUsed}) aktualisiert.`
          : "Technischer Website-Scan & PageSpeed aktualisiert (0,00 € KI-Kosten).",
    );
  }

  async function handleGenerateOutreach(channelsOverride?: OutreachChannel[]) {
    const targets = channelsOverride ?? [selectedChannel];
    setGenerating(true);
    setGenError(null);
    setGenNotice(null);

    const outcomes = await Promise.all(
      targets.map((ch) =>
        apiFetchJson<{
          item: OutreachItem;
          providerMode?: string;
          limitBlockedReason?: string;
          autoDowngraded?: boolean;
        }>("/api/outreach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            leadId: lead.id,
            channel: ch,
            extraContext: extraContext.trim(),
          }),
        }),
      ),
    );

    setGenerating(false);
    const createdItems: OutreachItem[] = [];
    let firstError: string | null = null;
    let lastNotice = "";

    for (const r of outcomes) {
      if (!r.ok) {
        if (!firstError) firstError = r.error;
        continue;
      }
      const item = r.data.item;
      createdItems.push(item);
      if (r.data.limitBlockedReason) {
        lastNotice = `Budget-Schutz aktiv (${r.data.limitBlockedReason}) – Entwurf lokal erstellt.`;
      } else if (r.data.autoDowngraded) {
        lastNotice = `Spar-Automatik aktiv (>=75% Budget) -> erstellt mit ${item.model_used}.`;
      } else if (r.data.providerMode === "openrouter") {
        lastNotice = `${createdItems.length > 1 ? `${createdItems.length}er-Akquise-Kit` : "Entwurf"} über ${item.model_used} erzeugt.`;
      } else {
        lastNotice = `${createdItems.length > 1 ? `${createdItems.length} Entwürfe` : "Entwurf"} lokal erstellt (0,00 €).`;
      }
    }

    if (firstError) setGenError(firstError);
    if (createdItems.length > 0) {
      setOutreachList((prev) => [...createdItems, ...prev]);
      setActiveDraft(createdItems[0]);
      setDraftSubject(createdItems[0].subject);
      setDraftBody(createdItems[0].body);
      setGenNotice(lastNotice);
    }
  }

  async function handleUpdateDraftStatus(
    status: OutreachItem["status"],
    advanceLead = false,
  ) {
    if (!activeDraft) return;
    const res = await fetch("/api/outreach", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: activeDraft.id,
        status,
        subject: draftSubject,
        body: draftBody,
        updateLeadAfterSend: advanceLead,
        followUpDays: 5,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const updatedItem = data.item as OutreachItem;
      setActiveDraft(updatedItem);
      setOutreachList((prev) =>
        prev.map((x) => (x.id === updatedItem.id ? updatedItem : x)),
      );
      if (advanceLead) {
        const leadRes = await fetch(`/api/leads/${lead.id}`);
        if (leadRes.ok) {
          const lData = await leadRes.json();
          setLead(lData.lead);
        }
      }
    }
  }

  async function handleDeleteLead() {
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/pipeline");
    }
  }

  async function copyDraft() {
    const text = draftSubject ? `${draftSubject}\n\n${draftBody}` : draftBody;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const mailtoUrl =
    lead.contact_email && draftBody
      ? safeMailto(lead.contact_email, draftSubject, draftBody)
      : null;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb + Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#6B7280] hover:text-[#1A1A2E]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Zurück zur Pipeline</span>
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[26px] font-semibold text-[#1A1A2E]">
              {lead.company_name}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#F0F3FF] text-[#0000F5]">
              {PRIORITY_LABELS[lead.priority]}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[12px] border border-[#E5E7EB] bg-white text-[#1A1A2E]">
              {STATUS_LABELS[lead.status]}
            </span>
          </div>
          <p className="text-[13px] text-[#6B7280]">
            {lead.industry || "Branche"} ·{" "}
            {lead.target_track === "startup"
              ? "Startup & Produktteam"
              : "Lokales Unternehmen / KMU"}{" "}
            {lead.city ? `· ${lead.city}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {safeWebsite && (
            <a
              href={safeWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5E7EB] bg-white hover:border-[#0000F5] text-[13px] font-medium text-[#1A1A2E]"
            >
              <span>Website öffnen</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => handleRescan(false)}
            disabled={rescanning || !lead.website_url}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5E7EB] bg-white hover:border-[#0000F5] text-[13px] font-medium text-[#1A1A2E] disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${rescanning ? "animate-spin" : ""}`}
            />
            <span>Technik & PageSpeed prüfen (0 €)</span>
          </button>
          <button
            type="button"
            onClick={handleDeleteLead}
            className="p-2 rounded-full border border-[#E5E7EB] text-[#6B7280] hover:text-red-700 hover:border-red-200 cursor-pointer"
            title="Lead löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {scanMsg && (
        <div className="no-print rounded-xl bg-[#F0F3FF] border border-[#0000F5]/20 px-4 py-2.5 text-[13px] text-[#1A1A2E]">
          {scanMsg}
        </div>
      )}

      {/* Printable DIN-5008 Letter Preview Sheet */}
      {printMode && activeDraft && (
        <div className="print-letter-sheet rounded-2xl bg-white border border-[#0000F5]/30 p-8 sm:p-12 max-w-3xl mx-auto space-y-6">
          <div className="no-print flex items-center justify-between border-b border-[#E5E7EB] pb-4">
            <div className="text-[13px] text-[#6B7280]">
              {!visualComplete ? (
                <span className="text-amber-700 font-medium inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Hinweis: Desktop- oder Mobil-Prüfung steht noch aus.
                </span>
              ) : (
                <span className="text-emerald-700 font-medium">
                  Visuell geprüft – bereit für den Briefdruck.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0000F5] text-white text-[13px] font-medium cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Jetzt drucken / PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintMode(false)}
                className="px-4 py-1.5 rounded-full border border-[#E5E7EB] text-[13px] text-[#6B7280] cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>

          <div className="space-y-8 text-[14px] leading-relaxed text-[#1A1A2E]">
            <div className="text-[11px] text-[#6B7280] underline">
              {brand.brand_name} · {brand.owner_name} ·{" "}
              {brand.postal_address || brand.city}
            </div>
            <div className="font-medium">
              <div>{lead.company_name}</div>
              {lead.decision_maker && <div>{lead.decision_maker}</div>}
              <div>{lead.postal_address || lead.city}</div>
            </div>
            <div className="text-right text-[13px] text-[#6B7280]">
              {brand.city}, {formatBerlinDate(new Date().toISOString())}
            </div>
            <div className="font-semibold text-[15px]">{draftSubject}</div>
            <div className="whitespace-pre-wrap">{draftBody}</div>
            <div className="pt-6 border-t border-[#E5E7EB] text-[11px] text-[#6B7280]">
              {brand.brand_name} · {brand.owner_name} · {brand.website_url} ·{" "}
              {brand.contact_email}
              {brand.phone_mobile ? ` · ${brand.phone_mobile}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Main Two-Column Grid */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Visual Verification + Outreach Studio + Findings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Luis's Mandatory Visual Inspection Panel */}
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                  1. Persönliche visuelle Prüfung (Desktop & Mobil)
                </h2>
                <p className="text-[13px] text-[#6B7280] mt-0.5">
                  Ausdrücklich dir vorbehalten: Seite am Desktop und am Handy
                  ansehen, bevor Mails rausgehen oder Briefe gedruckt werden.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${
                  visualComplete
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {visualComplete ? "Freigegeben" : "Prüfung offen"}
              </span>
            </div>

            <div className="flex flex-wrap gap-5 pt-1">
              <label className="inline-flex items-center gap-2 text-[14px] text-[#1A1A2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={lead.visual_checked_desktop}
                  onChange={(e) =>
                    saveLeadPatch({
                      visual_checked_desktop: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#0000F5]"
                />
                <span>Am Desktop angesehen</span>
              </label>

              <label className="inline-flex items-center gap-2 text-[14px] text-[#1A1A2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={lead.visual_checked_mobile}
                  onChange={(e) =>
                    saveLeadPatch({
                      visual_checked_mobile: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#0000F5]"
                />
                <span>Am Handy angesehen</span>
              </label>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                Deine konkreten Beobachtungen (fließen direkt in KI-Texte &
                Video-Audit ein)
              </label>
              <textarea
                rows={2}
                value={lead.visual_notes}
                onChange={(e) =>
                  setLead((prev) => ({ ...prev, visual_notes: e.target.value }))
                }
                onBlur={() => saveLeadPatch({ visual_notes: lead.visual_notes })}
                placeholder="z. B. Menü überlappt mobil, Kontakt erst ganz unten, Fotos pixelig..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px] focus:outline-none focus:border-[#0000F5]"
              />
            </div>
          </section>

          {/* Outreach & Reply Generator */}
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                  2. Akquise, Video-Audit & Kundenantworten
                </h2>
                <p className="text-[13px] text-[#6B7280] mt-0.5">
                  Schreibmodell: {brand.openrouter_config.writingModel} ·{" "}
                  {brand.openrouter_config.privacyMode
                    ? "Privacy-Maskierung aktiv"
                    : "Direktmodus"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleGenerateOutreach(["email", "video_audit", "follow_up"])
                  }
                  disabled={generating}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-[#0000F5]/30 bg-[#F0F3FF] text-[#0000F5] text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  <span>3er-Kit (Mail + Video + Follow-up)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateOutreach()}
                  disabled={generating}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-50 text-white text-[13px] font-medium cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {generating ? "Generiere..." : "Entwurf erstellen"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setSelectedChannel(ch)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                    selectedChannel === ch
                      ? "bg-[#0000F5] text-white"
                      : "bg-[#F8F9FC] text-[#6B7280] hover:text-[#1A1A2E]"
                  }`}
                >
                  {OUTREACH_CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                {selectedChannel === "reply_draft"
                  ? "Eingegangene Nachricht / Einwand des Kunden hier einfügen"
                  : "Optionaler Kontext oder Hinweis für den Entwurf"}
              </label>
              <textarea
                rows={selectedChannel === "reply_draft" ? 3 : 2}
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                placeholder={
                  selectedChannel === "reply_draft"
                    ? "z. B. 'Danke, wir haben aktuell kein Budget – was kostet so ein Relaunch grob?'"
                    : "z. B. Besonderer Fokus auf Fachkräfte-Bewerbungen oder Webflow CMS..."
                }
                className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[13px] focus:outline-none focus:border-[#0000F5]"
              />
            </div>

            {genError && (
              <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
                {genError}
              </p>
            )}
            {genNotice && (
              <p className="text-[13px] text-[#1A1A2E] bg-[#F0F3FF] border border-[#0000F5]/20 rounded-xl px-3.5 py-2">
                {genNotice}
              </p>
            )}

            {activeDraft && (
              <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[12px] font-medium text-[#6B7280]">
                    {OUTREACH_CHANNEL_LABELS[activeDraft.channel]} ·{" "}
                    {OUTREACH_STATUS_LABELS[activeDraft.status]} ·{" "}
                    {formatBerlinDateTime(activeDraft.created_at)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyDraft}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] cursor-pointer"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? "Kopiert" : "Kopieren"}</span>
                    </button>
                    {mailtoUrl && (
                      <a
                        href={mailtoUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E]"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Mail-App</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrintMode(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Briefdruck</span>
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px] font-medium text-[#1A1A2E]"
                  placeholder="Betreff"
                />
                <textarea
                  rows={10}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-[#E5E7EB] text-[13px] leading-relaxed text-[#1A1A2E]"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateDraftStatus("freigegeben", false)}
                    className="px-4 py-1.5 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] cursor-pointer"
                  >
                    Änderungen speichern & freigeben
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateDraftStatus("gesendet", true)}
                    className="px-4 py-1.5 rounded-full bg-[#0000F5] text-white text-[12px] font-medium cursor-pointer"
                  >
                    Als gesendet markieren (+ Follow-up in 5 Tagen)
                  </button>
                </div>
              </div>
            )}

            {outreachList.length > 1 && (
              <div className="pt-3 border-t border-[#E5E7EB]">
                <p className="text-[12px] font-medium text-[#6B7280] mb-2">
                  Bisherige Entwürfe ({outreachList.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {outreachList.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveDraft(item);
                        setDraftSubject(item.subject);
                        setDraftBody(item.body);
                      }}
                      className={`px-3 py-1 rounded-full text-[12px] border cursor-pointer ${
                        activeDraft?.id === item.id
                          ? "border-[#0000F5] bg-[#F0F3FF] text-[#0000F5]"
                          : "border-[#E5E7EB] text-[#6B7280]"
                      }`}
                    >
                      {OUTREACH_CHANNEL_LABELS[item.channel]} (
                      {OUTREACH_STATUS_LABELS[item.status]})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Technical Findings & Scan Metrics */}
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                3. Technische Befunde & Ausgangslage
              </h2>
              {lead.website_url && (
                <button
                  type="button"
                  onClick={() => handleRescan(true)}
                  disabled={rescanning}
                  className="text-[12px] font-medium text-[#0000F5] hover:underline cursor-pointer"
                >
                  Mit KI neu bewerten
                </button>
              )}
            </div>

            {lead.research_summary && (
              <p className="text-[13px] text-[#1A1A2E] bg-[#F8F9FC] rounded-xl p-3.5 leading-relaxed">
                {lead.research_summary}
              </p>
            )}

            {lead.scan_data && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] border border-[#E5E7EB] rounded-xl p-3.5">
                <div>
                  <span className="text-[#6B7280] block">System</span>
                  <span className="font-medium">{lead.scan_data.detectedCms}</span>
                </div>
                <div>
                  <span className="text-[#6B7280] block">HTTPS / Tempo</span>
                  <span className="font-medium">
                    {lead.scan_data.httpsEnabled ? "HTTPS" : "Kein HTTPS"} ·{" "}
                    {lead.scan_data.responseTimeMs} ms
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Mobile Viewport</span>
                  <span className="font-medium">
                    {lead.scan_data.hasViewportMeta ? "Vorhanden" : "Fehlt"}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Seiten & Karriere</span>
                  <span className="font-medium">
                    {lead.scan_data.checkedPagesCount ?? 1} geprüft
                    {lead.scan_data.hasHiringSignal ? " · Recruiting" : ""}
                    {lead.scan_data.pageSpeed?.performanceScore !== null &&
                    lead.scan_data.pageSpeed?.performanceScore !== undefined
                      ? ` · PSI ${lead.scan_data.pageSpeed.performanceScore}`
                      : ""}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {lead.findings.map((f, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-[13px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#1A1A2E]">{f.title}</span>
                    <span className="text-[11px] text-[#6B7280]">
                      {f.verified ? "Verifiziert" : "Demo"}
                    </span>
                  </div>
                  <p className="text-[#6B7280] mt-0.5">{f.evidence}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Editable Lead Meta + Discovery Questions */}
        <aside className="space-y-6">
          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1A1A2E]">
                Lead-Details
              </h2>
              {savingLead && (
                <span className="text-[11px] text-[#0000F5]">Speichert...</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Status
                </label>
                <select
                  value={lead.status}
                  onChange={(e) =>
                    saveLeadPatch({ status: e.target.value as LeadStatus })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
                >
                  {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Bewertung
                </label>
                <select
                  value={lead.priority}
                  onChange={(e) =>
                    saveLeadPatch({ priority: e.target.value as LeadPriority })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
                >
                  <option value="heiss">Heiß</option>
                  <option value="warm">Warm</option>
                  <option value="kalt">Kalt</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Zielgruppen-Track
              </label>
              <select
                value={lead.target_track}
                onChange={(e) =>
                  saveLeadPatch({
                    target_track: e.target.value as TargetTrack,
                  })
                }
                className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
              >
                <option value="kmu">Lokales Unternehmen / KMU</option>
                <option value="startup">Startup / Produktteam</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Entscheider / Ansprechpartner
              </label>
              <input
                type="text"
                value={lead.decision_maker}
                onChange={(e) =>
                  setLead((p) => ({ ...p, decision_maker: e.target.value }))
                }
                onBlur={() =>
                  saveLeadPatch({ decision_maker: lead.decision_maker })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                E-Mail
              </label>
              <input
                type="email"
                value={lead.contact_email}
                onChange={(e) =>
                  setLead((p) => ({ ...p, contact_email: e.target.value }))
                }
                onBlur={() =>
                  saveLeadPatch({ contact_email: lead.contact_email })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Telefon
              </label>
              <input
                type="text"
                value={lead.contact_phone}
                onChange={(e) =>
                  setLead((p) => ({ ...p, contact_phone: e.target.value }))
                }
                onBlur={() =>
                  saveLeadPatch({ contact_phone: lead.contact_phone })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Postanschrift
              </label>
              <input
                type="text"
                value={lead.postal_address}
                onChange={(e) =>
                  setLead((p) => ({ ...p, postal_address: e.target.value }))
                }
                onBlur={() =>
                  saveLeadPatch({ postal_address: lead.postal_address })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Nächstes Follow-up
              </label>
              <input
                type="date"
                value={
                  lead.next_follow_up_at
                    ? lead.next_follow_up_at.slice(0, 10)
                    : ""
                }
                onChange={(e) =>
                  saveLeadPatch({
                    next_follow_up_at: e.target.value
                      ? new Date(`${e.target.value}T09:00:00Z`).toISOString()
                      : null,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
              />
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-[#E5E7EB] p-6 space-y-3">
            <h2 className="text-[15px] font-semibold text-[#1A1A2E]">
              Checkliste fürs Erstgespräch
            </h2>
            <p className="text-[12px] text-[#6B7280]">
              Erst das Problem und den Nutzen verstehen, dann über Technik
              sprechen.
            </p>
            <ul className="space-y-2 text-[12px] text-[#1A1A2E]">
              {brand.discovery_questions.slice(0, 6).map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#0000F5] font-semibold">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
