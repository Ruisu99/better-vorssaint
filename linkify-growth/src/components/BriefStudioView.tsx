"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Download,
  FileArchive,
  FileText,
  Printer,
  Save,
  Square,
} from "lucide-react";
import {
  apiFetchJson,
  formatBerlinDate,
  PRIORITY_LABELS,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import { buildFallbackOutreach } from "@/lib/prompts";
import type { Lead, OutreachItem } from "@/lib/types";

function formatLongGermanDate(): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function BriefStudioView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const [leads, setLeads] = useState<Lead[]>(snapshot.leads);
  const [outreach, setOutreach] = useState<OutreachItem[]>(
    snapshot.recentOutreach,
  );
  const [filter, setFilter] = useState<
    "unprinted" | "heiss" | "printed" | "alle"
  >("unprinted");

  const briefMap = useMemo(() => {
    const map = new Map<string, OutreachItem>();
    for (const item of outreach) {
      if (item.channel === "brief" && !map.has(item.lead_id)) {
        map.set(item.lead_id, item);
      }
    }
    return map;
  }, [outreach]);

  const visibleLeads = useMemo(() => {
    return leads.filter((l) => {
      if (l.status === "kein_interesse") return false;
      if (filter === "unprinted") return !l.letter_printed_at;
      if (filter === "printed") return Boolean(l.letter_printed_at);
      if (filter === "heiss") return l.priority === "heiss";
      return true;
    });
  }, [leads, filter]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = leads
      .filter((l) => !l.letter_printed_at && l.status !== "kein_interesse")
      .map((l) => l.id);
    return new Set(initial);
  });

  const [activeLeadId, setActiveLeadId] = useState<string>(
    visibleLeads[0]?.id ?? leads[0]?.id ?? "",
  );

  const activeLead =
    leads.find((l) => l.id === activeLeadId) ?? visibleLeads[0] ?? null;

  const activeDraft = activeLead ? briefMap.get(activeLead.id) : undefined;
  const fallbackDraft = activeLead
    ? buildFallbackOutreach({
        brand: snapshot.brand,
        lead: activeLead,
        channel: "brief",
      })
    : { subject: "", body: "" };

  const [editSubject, setEditSubject] = useState<string>(
    activeDraft?.subject ?? fallbackDraft.subject,
  );
  const [editBody, setEditBody] = useState<string>(
    activeDraft?.body ?? fallbackDraft.body,
  );
  const [editDecisionMaker, setEditDecisionMaker] = useState<string>(
    activeLead?.decision_maker ?? "",
  );
  const [editPostalAddress, setEditPostalAddress] = useState<string>(
    activeLead?.postal_address ?? "",
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectLead(lead: Lead) {
    setActiveLeadId(lead.id);
    const existing = briefMap.get(lead.id);
    const fb = buildFallbackOutreach({
      brand: snapshot.brand,
      lead,
      channel: "brief",
    });
    setEditSubject(existing?.subject ?? fb.subject);
    setEditBody(existing?.body ?? fb.body);
    setEditDecisionMaker(lead.decision_maker);
    setEditPostalAddress(lead.postal_address);
    setNotice(null);
    setError(null);
  }

  function toggleChecked(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const allSelected =
      visibleLeads.length > 0 &&
      visibleLeads.every((l) => selectedIds.has(l.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleLeads.map((l) => l.id)));
    }
  }

  async function handleSaveEdits() {
    if (!activeLead) return;
    setSavingEdit(true);
    setError(null);
    setNotice(null);

    const leadRes = await apiFetchJson<{ lead: Lead }>(
      `/api/leads/${activeLead.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision_maker: editDecisionMaker,
          postal_address: editPostalAddress,
        }),
      },
    );
    if (leadRes.ok) {
      setLeads((prev) =>
        prev.map((l) => (l.id === activeLead.id ? leadRes.data.lead : l)),
      );
    }

    if (activeDraft) {
      const outRes = await apiFetchJson<{ item: OutreachItem }>("/api/outreach", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: activeDraft.id,
          status: activeDraft.status,
          subject: editSubject,
          body: editBody,
          updateLeadAfterSend: false,
        }),
      });
      if (outRes.ok) {
        setOutreach((prev) =>
          prev.map((x) => (x.id === outRes.data.item.id ? outRes.data.item : x)),
        );
      }
    } else {
      const outRes = await apiFetchJson<{ item: OutreachItem }>("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_manual",
          leadId: activeLead.id,
          channel: "brief",
          subject: editSubject,
          body: editBody,
        }),
      });
      if (outRes.ok) {
        setOutreach((prev) => [outRes.data.item, ...prev]);
      }
    }

    setSavingEdit(false);
    setNotice("Brief-Änderungen & Empfängerdaten gespeichert.");
  }

  async function triggerBatchDownload(format: "batch_pdf" | "zip") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDownloading(format);
    setError(null);
    try {
      const res = await fetch("/api/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadIds: ids,
          format,
          markPrinted: false,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(`Export fehlgeschlagen: ${text.slice(0, 140)}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "zip"
          ? `Linkify_Briefe_Pages_PDF_Paket_${ids.length}.zip`
          : `Linkify_Sammeldruck_${ids.length}_Briefe.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(
        format === "zip"
          ? `ZIP mit ${ids.length} Apple-Pages-DOCX & PDFs heruntergeladen.`
          : `Sammel-PDF mit ${ids.length} Briefen heruntergeladen – direkt zum Ausdrucken.`,
      );
    } catch {
      setError("Netzwerkfehler beim Export.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleMarkPrinted(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    const res = await apiFetchJson<{ ok: boolean; updatedCount: number }>(
      "/api/letters",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadIds: ids,
          format: "mark_printed",
          markContacted: true,
        }),
      },
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const nowIso = new Date().toISOString();
    setLeads((prev) =>
      prev.map((l) =>
        ids.includes(l.id)
          ? {
              ...l,
              letter_printed_at: l.letter_printed_at ?? nowIso,
              status:
                l.status === "neu" || l.status === "analysiert"
                  ? "kontaktiert"
                  : l.status,
              first_contact_at: l.first_contact_at ?? nowIso,
            }
          : l,
      ),
    );
    setSelectedIds(new Set());
    setNotice(
      `${ids.length} Brief(e) als gedruckt & verschickt markiert (Follow-up automatisch in 9 Tagen).`,
    );
  }

  // Sender layout tokens for live preview
  const senderParts = snapshot.brand.postal_address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const senderStreet = senderParts[0] || "Marktstraße 34C";
  const senderZipCity = senderParts[1] || `99084 ${snapshot.brand.city || "Erfurt"}`;
  const senderWebsite = snapshot.brand.website_url
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  const recipientAddressLines = editPostalAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    activeLead &&
    recipientAddressLines.length >= 2 &&
    recipientAddressLines[0]
      .toLowerCase()
      .includes(activeLead.company_name.toLowerCase().slice(0, 10))
  ) {
    recipientAddressLines.shift();
  }

  return (
    <div className="space-y-6">
      {/* Header + Bulk Actions */}
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            DIN 5008-B Vorlage · Export für Druck & Apple Pages
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
            Brief- & Druckstudio
          </h1>
          <p className="mt-1 text-[14px] text-[#6B7280] max-w-2xl">
            Alle erstellten Brieffassungen im exakten Linkify-Briefkopf-Design.
            Lade viele Briefe auf einmal als Sammel-PDF zum direkten Ausdrucken
            oder als bearbeitbare Pages-DOCX-Dateien im ZIP-Paket herunter.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={selectedIds.size === 0 || downloading !== null}
            onClick={() => triggerBatchDownload("batch_pdf")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] disabled:opacity-40 text-white text-[13px] font-medium cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              {downloading === "batch_pdf"
                ? "Erzeuge Sammel-PDF..."
                : `Sammel-PDF drucken (${selectedIds.size})`}
            </span>
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0 || downloading !== null}
            onClick={() => triggerBatchDownload("zip")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#E5E7EB] bg-white hover:border-[#0000F5] disabled:opacity-40 text-[#1A1A2E] text-[13px] font-medium cursor-pointer"
          >
            <FileArchive className="w-4 h-4 text-[#0000F5]" />
            <span>
              {downloading === "zip"
                ? "Packe ZIP..."
                : `Pages-DOCX + PDF ZIP (${selectedIds.size})`}
            </span>
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => handleMarkPrinted(Array.from(selectedIds))}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-800 text-[13px] font-medium cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Gedruckt & verschickt</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="no-print text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {error}
        </p>
      )}
      {notice && (
        <p className="no-print text-[13px] text-[#1A1A2E] bg-[#F0F3FF] border border-[#0000F5]/20 rounded-xl px-4 py-2.5">
          {notice}
        </p>
      )}

      {leads.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-8 space-y-3">
          <h2 className="text-[18px] font-semibold text-[#1A1A2E]">
            Noch keine qualifizierten Briefe vorhanden
          </h2>
          <p className="text-[14px] text-[#6B7280]">
            Starte zuerst einen Akquise-Auftrag im Cockpit – für jedes
            qualifizierte Unternehmen wird automatisch eine druckfertige
            DIN-5008-Brieffassung angelegt.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] text-white text-[13px] font-medium"
          >
            Zum Akquise-Auftrag
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Selectable Queue */}
          <aside className="no-print lg:col-span-4 rounded-2xl bg-white border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB] space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["unprinted", "Druckbereit"],
                    ["heiss", "Nur Heiß"],
                    ["printed", "Gedruckt"],
                    ["alle", "Alle"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer ${
                      filter === key
                        ? "bg-[#0000F5] text-white"
                        : "bg-[#F8F9FC] text-[#6B7280]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleAllVisible}
                className="inline-flex items-center gap-2 text-[12px] font-medium text-[#0000F5] cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>
                  {visibleLeads.length > 0 &&
                  visibleLeads.every((l) => selectedIds.has(l.id))
                    ? "Auswahl aufheben"
                    : `Alle ${visibleLeads.length} angezeigten auswählen`}
                </span>
              </button>
            </div>

            <div className="divide-y divide-[#E5E7EB] max-h-[680px] overflow-y-auto">
              {visibleLeads.map((l) => {
                const checked = selectedIds.has(l.id);
                const isActive = activeLead?.id === l.id;
                return (
                  <div
                    key={l.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      isActive ? "bg-[#F0F3FF]" : "hover:bg-[#F8F9FC]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleChecked(l.id)}
                      className="mt-0.5 text-[#0000F5] cursor-pointer shrink-0"
                      aria-label={`${l.company_name} für Druck auswählen`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-[#6B7280]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => selectLead(l)}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#1A1A2E] truncate">
                          {l.company_name}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                            l.priority === "heiss"
                              ? "bg-[#0000F5] text-white"
                              : "bg-[#F3F4F6] text-[#6B7280]"
                          }`}
                        >
                          {PRIORITY_LABELS[l.priority]}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6B7280] truncate mt-0.5">
                        {l.decision_maker || "Ohne Entscheider"} ·{" "}
                        {l.postal_address || l.city || "Adresse prüfen"}
                      </p>
                      {l.letter_printed_at && (
                        <p className="text-[10px] text-emerald-700 mt-0.5">
                          Gedruckt am {formatBerlinDate(l.letter_printed_at)}
                        </p>
                      )}
                    </button>
                  </div>
                );
              })}
              {visibleLeads.length === 0 && (
                <p className="p-6 text-[13px] text-[#6B7280] text-center">
                  Keine Briefe in diesem Filter.
                </p>
              )}
            </div>
          </aside>

          {/* Right Column: DIN 5008 Live Editor + Visual Pages Preview */}
          {activeLead && (
            <div className="lg:col-span-8 space-y-5">
              {/* Toolbar for active lead */}
              <div className="no-print rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/pipeline/${activeLead.id}`}
                    className="text-[15px] font-semibold text-[#1A1A2E] hover:text-[#0000F5]"
                  >
                    {activeLead.company_name}
                  </Link>
                  <p className="text-[12px] text-[#6B7280]">
                    Direkt bearbeiten, speichern oder als Einzeldatei herunterladen.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveEdits}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] hover:border-[#0000F5] cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingEdit ? "Speichere..." : "Speichern"}</span>
                  </button>

                  <a
                    href={`/api/letters?leadId=${encodeURIComponent(activeLead.id)}&format=docx`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5E7EB] text-[12px] font-medium text-[#1A1A2E] hover:border-[#0000F5]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#0000F5]" />
                    <span>Pages (.docx)</span>
                  </a>

                  <a
                    href={`/api/letters?leadId=${encodeURIComponent(activeLead.id)}&format=pdf`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1A1A2E] text-white text-[12px] font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Einzel-PDF</span>
                  </a>
                </div>
              </div>

              {/* Inline Recipient & Copy Editor */}
              <div className="no-print rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                      Empfänger / Entscheider (z. Hd.)
                    </label>
                    <input
                      type="text"
                      value={editDecisionMaker}
                      onChange={(e) => setEditDecisionMaker(e.target.value)}
                      placeholder="z. B. Herrn Thomas Mihm"
                      className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                      Postanschrift (Straße, PLZ Ort)
                    </label>
                    <input
                      type="text"
                      value={editPostalAddress}
                      onChange={(e) => setEditPostalAddress(e.target.value)}
                      placeholder="Straße Hausnr., PLZ Ort"
                      className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                    Betreffzeile
                  </label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px] font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                    Brieftext
                  </label>
                  <textarea
                    rows={10}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[13px] leading-relaxed"
                  />
                </div>
              </div>

              {/* Exact DIN 5008-B Visual Sheet Preview (matches Anfrage_THS-Webauftritt_de54.pages) */}
              <div className="print-letter-sheet rounded-2xl bg-white border border-[#E5E7EB] p-8 sm:p-12 space-y-8 text-[#1A1A2E]">
                <div className="flex items-start justify-between">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/linkify-logo.png"
                    alt="Linkify Logo"
                    className="h-9 w-auto object-contain"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
                  <div className="sm:col-span-7 space-y-3">
                    <p className="text-[10px] text-[#6B7280]">
                      {snapshot.brand.brand_name} · {snapshot.brand.owner_name} ·{" "}
                      {senderStreet} · {senderZipCity}
                    </p>
                    <div className="text-[13px] leading-snug">
                      <p>{activeLead.company_name}</p>
                      {editDecisionMaker.trim() && (
                        <p>
                          {/^z\.\s*hd\./i.test(editDecisionMaker)
                            ? editDecisionMaker
                            : `z. Hd. ${editDecisionMaker}`}
                        </p>
                      )}
                      {recipientAddressLines.length > 0 ? (
                        recipientAddressLines.map((line, i) => (
                          <p key={i}>{line}</p>
                        ))
                      ) : (
                        <p>{activeLead.city}</p>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-5 text-[12px] leading-relaxed space-y-2.5">
                    <p>
                      {snapshot.brand.owner_name} - {snapshot.brand.brand_name}
                    </p>
                    <div>
                      <p>{senderStreet}</p>
                      <p>{senderZipCity}</p>
                    </div>
                    <div>
                      <p>{snapshot.brand.phone_mobile || "+49 155 63477504"}</p>
                      <p>{snapshot.brand.contact_email}</p>
                      <p>{senderWebsite}</p>
                    </div>
                    <p>
                      {snapshot.brand.city}, {formatLongGermanDate()}
                    </p>
                  </div>
                </div>

                <div className="pt-4 space-y-4 text-[13px] leading-relaxed">
                  <p className="font-semibold text-[14px]">{editSubject}</p>
                  <div className="whitespace-pre-wrap">{editBody}</div>
                </div>

                <div className="pt-6 space-y-2 border-t border-[#E5E7EB]">
                  <p className="text-right text-[10px] text-[#6B7280]">
                    Seite 1 von 1
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[10px] text-[#6B7280]">
                    <div>
                      <p>{snapshot.brand.brand_name}</p>
                      <p>{senderStreet}</p>
                      <p>{senderZipCity}</p>
                    </div>
                    <div>
                      <p>Inhaber: {snapshot.brand.owner_name}</p>
                      <p>
                        Tel.: {snapshot.brand.phone_mobile || "+49 155 63477504"}
                      </p>
                      <p>Mail: {snapshot.brand.contact_email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
