"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Download,
  ExternalLink,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  formatBerlinDate,
  PRIORITY_LABELS,
  safeHref,
  STATUS_LABELS,
} from "@/lib/client-utils";
import type { WorkspaceSnapshot } from "@/lib/initial-state";
import type { Lead, LeadPriority, LeadStatus, TargetTrack } from "@/lib/types";

function escapeCsvCell(val: string): string {
  const safe = val.replace(/"/g, '""');
  return `"${safe}"`;
}

export function PipelineView({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  const [leads, setLeads] = useState<Lead[]>(snapshot.leads);
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<"alle" | TargetTrack>("alle");
  const [priorityFilter, setPriorityFilter] = useState<"alle" | LeadPriority>(
    "alle",
  );
  const [statusFilter, setStatusFilter] = useState<"alle" | LeadStatus>("alle");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newTrack, setNewTrack] = useState<TargetTrack>("kmu");
  const [newCity, setNewCity] = useState(snapshot.brand.city || "Erfurt");
  const [newAddress, setNewAddress] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newDecisionMaker, setNewDecisionMaker] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPriority, setNewPriority] = useState<LeadPriority>("warm");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = leads.filter((l) => {
    if (trackFilter !== "alle" && l.target_track !== trackFilter) return false;
    if (priorityFilter !== "alle" && l.priority !== priorityFilter) return false;
    if (statusFilter !== "alle" && l.status !== statusFilter) return false;
    if (onlyUnchecked && l.visual_checked_desktop && l.visual_checked_mobile)
      return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const match =
        l.company_name.toLowerCase().includes(q) ||
        l.industry.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.decision_maker.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  function exportCsv() {
    const header = [
      "Unternehmen",
      "Track",
      "Branche",
      "Ort",
      "Postanschrift",
      "Website",
      "Entscheider",
      "E-Mail",
      "Telefon",
      "Bewertung",
      "Status",
      "Desktop geprüft",
      "Mobil geprüft",
      "Follow-up",
      "Ansatz",
    ];
    const rows = filtered.map((l) => [
      l.company_name,
      l.target_track === "startup" ? "Startup/Produkt" : "KMU",
      l.industry,
      l.city,
      l.postal_address,
      l.website_url,
      l.decision_maker,
      l.contact_email,
      l.contact_phone,
      PRIORITY_LABELS[l.priority],
      STATUS_LABELS[l.status],
      l.visual_checked_desktop ? "Ja" : "Nein",
      l.visual_checked_mobile ? "Ja" : "Nein",
      formatBerlinDate(l.next_follow_up_at),
      l.pitch_angle,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((c) => escapeCsvCell(c)).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkify-lead-pipeline.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newCompany.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: newCompany,
          industry: newIndustry,
          target_track: newTrack,
          city: newCity,
          postal_address: newAddress,
          website_url: newWebsite,
          decision_maker: newDecisionMaker,
          contact_email: newEmail,
          priority: newPriority,
          status: "neu",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Lead konnte nicht angelegt werden.");
        return;
      }
      setLeads((prev) => [data.lead, ...prev]);
      setShowNewModal(false);
      setNewCompany("");
      setNewIndustry("");
      setNewAddress("");
      setNewWebsite("");
      setNewDecisionMaker("");
      setNewEmail("");
    } catch {
      setFormError("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#0000F5]">
            Vertrieb & Nachverfolgung
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1A1A2E]">
            Lead-Pipeline
          </h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">
            Strukturiert nach KMU vs. Startup-Produktteams, Priorität und
            manuell bestätigter Desktop-/Mobil-Prüfung.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#E5E7EB] bg-white hover:border-[#0000F5]/40 text-[13px] font-medium text-[#1A1A2E] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV für Notion</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0000F5] hover:bg-[#0000C8] text-white text-[13px] font-medium cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Lead hinzufügen</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Unternehmen, Ort, Branche oder Kontakt suchen..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E5E7EB] text-[13px] focus:outline-none focus:border-[#0000F5]"
          />
        </div>

        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value as "alle" | TargetTrack)}
          className="px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
        >
          <option value="alle">Alle Zielgruppen</option>
          <option value="kmu">Lokale KMU</option>
          <option value="startup">Startups & Produktteams</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as "alle" | LeadPriority)
          }
          className="px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
        >
          <option value="alle">Alle Prioritäten</option>
          <option value="heiss">Heiß</option>
          <option value="warm">Warm</option>
          <option value="kalt">Kalt</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "alle" | LeadStatus)
          }
          className="px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[13px]"
        >
          <option value="alle">Alle Status</option>
          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-[13px] text-[#1A1A2E] cursor-pointer px-2">
          <input
            type="checkbox"
            checked={onlyUnchecked}
            onChange={(e) => setOnlyUnchecked(e.target.checked)}
            className="accent-[#0000F5]"
          />
          <span>Nur ungeprüfte</span>
        </label>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-[12px] font-medium text-[#6B7280] bg-[#F8F9FC]">
              <th className="py-3 px-4">Unternehmen & Branche</th>
              <th className="py-3 px-4">Track</th>
              <th className="py-3 px-4">Bewertung</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Visuelle Prüfung</th>
              <th className="py-3 px-4">Follow-up</th>
              <th className="py-3 px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB] text-[13px]">
            {filtered.map((lead) => {
              const safeUrl = safeHref(lead.website_url);
              const visualDone =
                lead.visual_checked_desktop && lead.visual_checked_mobile;
              return (
                <tr key={lead.id} className="hover:bg-[#F8F9FC]">
                  <td className="py-3.5 px-4">
                    <Link
                      href={`/pipeline/${lead.id}`}
                      className="font-semibold text-[#1A1A2E] hover:text-[#0000F5]"
                    >
                      {lead.company_name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-[#6B7280] flex-wrap">
                      <span>{lead.industry || "Branche offen"}</span>
                      {lead.city && <span>· {lead.city}</span>}
                      {safeUrl && (
                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0000F5] hover:underline"
                        >
                          <span>Website</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-[#6B7280]">
                    {lead.target_track === "startup" ? "Startup / App" : "KMU"}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                        lead.priority === "heiss"
                          ? "bg-[#F0F3FF] text-[#0000F5]"
                          : lead.priority === "warm"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {PRIORITY_LABELS[lead.priority]}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] border border-[#E5E7EB] bg-white text-[#1A1A2E]">
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`text-[12px] font-medium ${
                        visualDone ? "text-emerald-700" : "text-[#6B7280]"
                      }`}
                    >
                      {visualDone
                        ? "Desktop & Mobil OK"
                        : lead.visual_checked_desktop ||
                            lead.visual_checked_mobile
                          ? "Teilweise"
                          : "Offen"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-[#6B7280]">
                    {formatBerlinDate(lead.next_follow_up_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <Link
                      href={`/pipeline/${lead.id}`}
                      className="text-[13px] font-medium text-[#0000F5] hover:underline"
                    >
                      Öffnen
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center text-[14px] text-[#6B7280]"
                >
                  Keine passenden Leads in dieser Ansicht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Lead Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A2E]/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1A1A2E]">
                Neuen Lead anlegen
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-[#6B7280] hover:text-[#1A1A2E] cursor-pointer"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                  Unternehmen *
                </label>
                <input
                  required
                  type="text"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Zielgruppe
                  </label>
                  <select
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as TargetTrack)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
                  >
                    <option value="kmu">Lokales Unternehmen / KMU</option>
                    <option value="startup">Startup / Produktteam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Bewertung
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as LeadPriority)
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[14px]"
                  >
                    <option value="heiss">Heiß</option>
                    <option value="warm">Warm</option>
                    <option value="kalt">Kalt</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Branche
                  </label>
                  <input
                    type="text"
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    placeholder="z. B. Handwerk / SaaS"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Ort
                  </label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Entscheider
                  </label>
                  <input
                    type="text"
                    value={newDecisionMaker}
                    onChange={(e) => setNewDecisionMaker(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                  Vollständige Postanschrift (für Briefversand)
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Straße Hausnr., PLZ Ort"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] text-[14px]"
                />
              </div>

              {formError && (
                <p className="text-[13px] text-red-700">{formError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-full border border-[#E5E7EB] text-[13px] text-[#6B7280] cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-full bg-[#0000F5] text-white text-[13px] font-medium cursor-pointer"
                >
                  {saving ? "Speichere..." : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
