import { PRIVATE_JSON_HEADERS } from "./auth";
import type {
  CoreService,
  LeadFinding,
  PricingBenchmark,
  RadarCandidate,
  VerifiedReference,
} from "./types";
import { sanitizeExternalHref } from "./url-safety";

export class HttpInputError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(err: unknown, fallbackStatus = 400): Response {
  if (err instanceof HttpInputError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...PRIVATE_JSON_HEADERS, "content-type": "application/json" },
    });
  }
  const msg = err instanceof Error ? err.message : "Anfrage fehlgeschlagen.";
  return new Response(JSON.stringify({ error: msg }), {
    status: fallbackStatus,
    headers: { ...PRIVATE_JSON_HEADERS, "content-type": "application/json" },
  });
}

function normalizedHostHeader(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const direct = request.headers.get("host")?.trim();
  return (forwarded || direct || "").toLowerCase();
}

/**
 * Blocks cross-site form submissions and cross-origin browser mutations (CSRF defense-in-depth).
 */
export function assertSafeMutationRequest(
  request: Request,
  options: { requireJsonContentType?: boolean } = {},
): void {
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    throw new HttpInputError(
      403,
      "Cross-Site-Anfragen sind aus Sicherheitsgründen blockiert.",
    );
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (originHeader) {
    let originHost = "";
    try {
      originHost = new URL(originHeader).host.toLowerCase();
    } catch {
      throw new HttpInputError(403, "Ungültiger Origin-Header.");
    }
    const expectedHost = normalizedHostHeader(request);
    if (expectedHost && originHost !== expectedHost) {
      throw new HttpInputError(
        403,
        "Origin stimmt nicht mit dem App-Host überein.",
      );
    }
  }

  if (options.requireJsonContentType !== false) {
    const ct = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!ct.startsWith("application/json")) {
      throw new HttpInputError(
        415,
        "Content-Type muss application/json sein.",
      );
    }
  }
}

export async function parseSafeJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 32_768,
): Promise<T> {
  assertSafeMutationRequest(request, { requireJsonContentType: true });

  const contentLengthRaw = request.headers.get("content-length");
  if (contentLengthRaw) {
    const contentLength = Number.parseInt(contentLengthRaw, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new HttpInputError(
        413,
        `Anfrage zu groß (maximal ${Math.round(maxBytes / 1024)} KB).`,
      );
    }
  }

  if (!request.body) {
    return {} as T;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpInputError(
          413,
          `Anfrage überschreitet das Limit von ${Math.round(maxBytes / 1024)} KB.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(combined).trim();
  if (!text) return {} as T;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpInputError(400, "Ungültiges JSON-Format.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpInputError(400, "JSON-Body muss ein Objekt sein.");
  }

  return parsed as T;
}

export function cleanStr(val: unknown, maxLen: number): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

const VALID_CATEGORIES = new Set<LeadFinding["category"]>([
  "technik",
  "mobile",
  "vertrauen",
  "ux",
  "produkt",
  "chance",
]);
const VALID_SEVERITIES = new Set<LeadFinding["severity"]>([
  "hoch",
  "mittel",
  "hinweis",
]);

export function sanitizeFindings(raw: unknown): LeadFinding[] {
  if (!Array.isArray(raw)) return [];
  const result: LeadFinding[] = [];
  for (const item of raw.slice(0, 12)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const title = cleanStr(rec.title, 180);
    if (!title) continue;
    const cat = VALID_CATEGORIES.has(rec.category as LeadFinding["category"])
      ? (rec.category as LeadFinding["category"])
      : "ux";
    const sev = VALID_SEVERITIES.has(rec.severity as LeadFinding["severity"])
      ? (rec.severity as LeadFinding["severity"])
      : "hinweis";
    result.push({
      category: cat,
      severity: sev,
      title,
      evidence: cleanStr(rec.evidence, 450),
      verified: Boolean(rec.verified),
    });
  }
  return result;
}

export function sanitizeCoreServices(
  raw: unknown,
  fallback: CoreService[],
): CoreService[] {
  if (!Array.isArray(raw)) return fallback;
  const out: CoreService[] = [];
  for (const item of raw.slice(0, 10)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const name = cleanStr(rec.name, 100);
    if (!name) continue;
    out.push({
      id: cleanStr(rec.id, 40) || `srv-${out.length + 1}`,
      name,
      description: cleanStr(rec.description, 400),
      stackHint: cleanStr(rec.stackHint, 120),
    });
  }
  return out.length > 0 ? out : fallback;
}

export function sanitizeStringList(
  raw: unknown,
  fallback: string[],
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .slice(0, maxItems)
    .map((v) => cleanStr(v, maxLen))
    .filter(Boolean);
}

export function sanitizeVerifiedReferences(
  raw: unknown,
  fallback: VerifiedReference[],
): VerifiedReference[] {
  if (!Array.isArray(raw)) return fallback;
  const out: VerifiedReference[] = [];
  for (const item of raw.slice(0, 10)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const clientName = cleanStr(rec.clientName, 120);
    if (!clientName) continue;
    out.push({
      id: cleanStr(rec.id, 40) || `ref-${out.length + 1}`,
      clientName,
      type: cleanStr(rec.type, 120),
      summary: cleanStr(rec.summary, 500),
      highlights: sanitizeStringList(rec.highlights, [], 6, 200),
      publiclyListed: Boolean(rec.publiclyListed),
    });
  }
  return out;
}

export function sanitizePricingBenchmarks(
  raw: unknown,
  fallback: PricingBenchmark[],
): PricingBenchmark[] {
  if (!Array.isArray(raw)) return fallback;
  const out: PricingBenchmark[] = [];
  for (const item of raw.slice(0, 12)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const label = cleanStr(rec.label, 120);
    if (!label) continue;
    const num = Number(rec.amountEur);
    const amountEur = Number.isFinite(num)
      ? Math.min(Math.max(Math.round(num * 100) / 100, 0), 100_000)
      : 0;
    out.push({
      id: cleanStr(rec.id, 40) || `price-${out.length + 1}`,
      label,
      unit: cleanStr(rec.unit, 60),
      amountEur,
      note: cleanStr(rec.note, 240),
      confirmed: Boolean(rec.confirmed),
    });
  }
  return out.length > 0 ? out : fallback;
}

export function sanitizeRadarCandidates(
  raw: unknown,
  maxItems: number,
): RadarCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: RadarCandidate[] = [];
  for (const item of raw.slice(0, maxItems)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const companyName = cleanStr(rec.companyName, 160);
    if (!companyName) continue;
    out.push({
      osmId: cleanStr(rec.osmId, 60) || `cand-${out.length + 1}`,
      companyName,
      industry: cleanStr(rec.industry, 100),
      city: cleanStr(rec.city, 80),
      postalAddress: cleanStr(rec.postalAddress, 220),
      websiteUrl: sanitizeExternalHref(cleanStr(rec.websiteUrl, 300)) ?? "",
      contactEmail: cleanStr(rec.contactEmail, 140),
      contactPhone: cleanStr(rec.contactPhone, 50),
      alreadyInPipeline: Boolean(rec.alreadyInPipeline),
    });
  }
  return out;
}
