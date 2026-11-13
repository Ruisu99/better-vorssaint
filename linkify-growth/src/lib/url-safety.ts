import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Sanitizes a URL for safe rendering in <a href> attributes (prevents javascript: / data: XSS).
 */
export function sanitizeExternalHref(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::" || norm === "::1") return true;
  if (norm.startsWith("::ffff:")) {
    return isPrivateIpv4(norm.slice("::ffff:".length));
  }
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // ULA fc00::/7
  if (
    norm.startsWith("fe8") ||
    norm.startsWith("fe9") ||
    norm.startsWith("fea") ||
    norm.startsWith("feb")
  ) {
    return true; // link-local fe80::/10
  }
  if (norm.startsWith("ff")) return true; // multicast
  return false;
}

export function isPublicIpAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return !isPrivateIpv4(ip);
  if (version === 6) return !isPrivateIpv6(ip);
  return false;
}

export interface PinnedPublicTarget {
  url: URL;
  pinnedIp: string;
  family: 4 | 6;
}

/**
 * Validates URL scheme/port/hostname and resolves DNS ONCE, returning the exact
 * validated public IP to pin the TCP socket to (prevents DNS rebinding SSRF).
 */
export async function resolveAndPinPublicUrl(
  rawUrl: string,
): Promise<PinnedPublicTarget> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new Error("Bitte eine gültige Website-URL (max. 500 Zeichen) angeben.");
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Ungültiges URL-Format.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Nur http:// und https:// URLs sind zulässig.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs mit Zugangsdaten sind nicht zulässig.");
  }
  if (parsed.port !== "" && parsed.port !== "80" && parsed.port !== "443") {
    throw new Error("Nur Standard-Webports (80/443) sind zulässig.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa") ||
    net.isIP(host) !== 0
  ) {
    throw new Error(
      "Interne Hosts, localhost oder direkte IP-Adressen können nicht gescannt werden.",
    );
  }

  const resolved = await lookup(host, { all: true }).catch(() => []);
  if (resolved.length === 0) {
    throw new Error(`Domain "${host}" konnte nicht aufgelöst werden.`);
  }

  for (const entry of resolved) {
    if (!isPublicIpAddress(entry.address)) {
      throw new Error("Zieladresse verweist auf ein geschütztes Netzwerk.");
    }
  }

  const preferred =
    resolved.find((r) => r.family === 4) ?? resolved[0];
  const family: 4 | 6 = preferred.family === 6 ? 6 : 4;

  return {
    url: parsed,
    pinnedIp: preferred.address,
    family,
  };
}
