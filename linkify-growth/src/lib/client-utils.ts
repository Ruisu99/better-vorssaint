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
