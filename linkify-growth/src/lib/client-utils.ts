import type {
  ContactChannel,
  ContentFormat,
  ContentStatus,
  LeadPriority,
  LeadStatus,
  OutreachChannel,
  OutreachStatus,
} from "./types";

export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function safeMailto(
  email: string,
  subject: string,
  body: string,
): string | null {
  const clean = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null;
  const params = new URLSearchParams({ subject, body });
  return `mailto:${clean}?${params.toString().replace(/\+/g, "%20")}`;
}

export function formatBerlinDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatBerlinDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function apiFetchJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }
> {
  try {
    const res = await fetch(url, init);
    const rawText = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const serverErr =
        (parsed && typeof parsed.error === "string" && parsed.error) ||
        (res.status === 504 || res.status === 502
          ? `Zeitüberschreitung beim Server (HTTP ${res.status}). Bitte erneut versuchen.`
          : `Server-Fehler (HTTP ${res.status}).`);
      return { ok: false, status: res.status, error: serverErr };
    }
    return {
      ok: true,
      status: res.status,
      data: (parsed ?? {}) as T,
    };
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? `Verbindungsfehler: ${err.message}`
        : "Verbindung zum Server unterbrochen.";
    return { ok: false, status: 0, error: msg };
  }
}

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  heiss: "Heiß",
  warm: "Warm",
  kalt: "Kalt",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  neu: "Neu",
  analysiert: "Analysiert",
  kontaktiert: "Kontaktiert",
  follow_up_faellig: "Follow-up fällig",
  im_gespraech: "Im Gespräch",
  angebot: "Angebot",
  gewonnen: "Gewonnen",
  kein_interesse: "Kein Interesse",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "E-Mail",
  video_audit: "Video-Audit",
  brief: "Brief (Post)",
  telefon: "Telefon",
  linkedin: "LinkedIn",
};

export const OUTREACH_CHANNEL_LABELS: Record<OutreachChannel, string> = {
  email: "E-Mail Erstansprache",
  video_audit: "Video-Audit-Skript (90s)",
  brief: "Postalischer Brief (DIN 5008)",
  follow_up: "Follow-up Nachricht",
  reply_draft: "Kunden-Antwort",
  angebot_outline: "Scope & Angebots-Gliederung",
};

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  gesendet: "Gesendet",
};

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  linkedin: "LinkedIn-Post",
  website_insight: "Website-Insight",
  case_study: "Referenz-Story",
  outreach_hook: "Akquise-Aufhänger",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  entwurf: "Entwurf",
  geprueft: "Geprüft",
  veroeffentlicht: "Veröffentlicht",
};
