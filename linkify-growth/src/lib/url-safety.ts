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

function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if (
    [a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4) return true;
  return isPrivateIpv4Octets(parts[0], parts[1], parts[2], parts[3]);
}

function parseIpv6Bytes(rawIp: string): Uint8Array | null {
  const noZone = rawIp.split("%")[0].trim().toLowerCase();
  if (!noZone || net.isIP(noZone) !== 6) return null;

  let working = noZone;
  let embeddedV4Bytes: number[] | null = null;
  const lastColon = working.lastIndexOf(":");
  if (lastColon !== -1 && working.slice(lastColon + 1).includes(".")) {
    const v4Part = working.slice(lastColon + 1);
    const octets = v4Part.split(".").map((n) => Number.parseInt(n, 10));
    if (
      octets.length !== 4 ||
      octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)
    ) {
      return null;
    }
    embeddedV4Bytes = octets;
    working = `${working.slice(0, lastColon)}:0:0`;
  }

  const halves = working.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right =
    halves.length === 2 && halves[1]
      ? halves[1].split(":").filter(Boolean)
      : [];

  const totalHextets = left.length + right.length;
  if (halves.length === 1 && totalHextets !== 8) return null;
  if (halves.length === 2 && totalHextets > 8) return null;

  const missingZeros = halves.length === 2 ? 8 - totalHextets : 0;
  const fullHextets = [
    ...left,
    ...Array<string>(missingZeros).fill("0"),
    ...right,
  ];
  if (fullHextets.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const val = Number.parseInt(fullHextets[i], 16);
    if (Number.isNaN(val) || val < 0 || val > 0xffff) return null;
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }

  if (embeddedV4Bytes) {
    bytes[12] = embeddedV4Bytes[0];
    bytes[13] = embeddedV4Bytes[1];
    bytes[14] = embeddedV4Bytes[2];
    bytes[15] = embeddedV4Bytes[3];
  }

  return bytes;
}

function isPrivateIpv6(ip: string): boolean {
  const bytes = parseIpv6Bytes(ip);
  if (!bytes) return true;

  // ::/128 (unspecified) and ::1/128 (loopback)
  const first15Zero = bytes.slice(0, 15).every((b) => b === 0);
  if (first15Zero && (bytes[15] === 0 || bytes[15] === 1)) return true;

  // ::/96 (IPv4-compatible IPv6)
  if (bytes.slice(0, 12).every((b) => b === 0)) {
    return isPrivateIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

  // ::ffff:0:0/96 (IPv4-mapped IPv6)
  if (
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    return isPrivateIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

  // 64:ff9b::/96 (NAT64 well-known prefix)
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0)
  ) {
    return isPrivateIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

  // 64:ff9b:1::/48 (NAT64 local-use)
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x01
  ) {
    return true;
  }

  // 2002::/16 (6to4 embedding IPv4 in bytes 2..5)
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isPrivateIpv4Octets(bytes[2], bytes[3], bytes[4], bytes[5]);
  }

  // 2001:0000::/32 (Teredo tunneling — client IPv4 is inverted in bytes 12..15)
  if (
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  ) {
    return isPrivateIpv4Octets(
      bytes[12] ^ 0xff,
      bytes[13] ^ 0xff,
      bytes[14] ^ 0xff,
      bytes[15] ^ 0xff,
    );
  }

  // fc00::/7 (Unique Local Addresses)
  if ((bytes[0] & 0xfe) === 0xfc) return true;

  // fe80::/10 (Link-Local)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  // ff00::/8 (Multicast)
  if (bytes[0] === 0xff) return true;

  // 100::/64 (Discard-Only)
  if (
    bytes[0] === 0x01 &&
    bytes[1] === 0x00 &&
    bytes.slice(2, 8).every((b) => b === 0)
  ) {
    return true;
  }

  // 2001:db8::/32 (Documentation) & 2001:2::/48 (Benchmark)
  if (bytes[0] === 0x20 && bytes[1] === 0x01) {
    if (bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
    if (
      bytes[2] === 0x00 &&
      bytes[3] === 0x02 &&
      bytes[4] === 0x00 &&
      bytes[5] === 0x00
    ) {
      return true;
    }
  }

  // ::ffff:0:0:0/96 (IPv4-translated SIIT)
  if (
    bytes.slice(0, 8).every((b) => b === 0) &&
    bytes[8] === 0xff &&
    bytes[9] === 0xff &&
    bytes[10] === 0 &&
    bytes[11] === 0
  ) {
    return isPrivateIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

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
    throw new Error(
      "Bitte eine gültige Website-URL (max. 500 Zeichen) angeben.",
    );
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

  const preferred = resolved.find((r) => r.family === 4) ?? resolved[0];
  const family: 4 | 6 = preferred.family === 6 ? 6 : 4;

  return {
    url: parsed,
    pinnedIp: preferred.address,
    family,
  };
}
