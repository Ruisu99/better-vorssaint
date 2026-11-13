import type { RadarCandidate } from "./types";
import { sanitizeExternalHref } from "./url-safety";

export type RadarCategory =
  | "alle"
  | "handwerk"
  | "gesundheit"
  | "kanzlei"
  | "auto"
  | "bau";

const CATEGORY_KEYWORDS: Record<RadarCategory, string[]> = {
  handwerk: ["Tischlerei", "Dachdecker", "Elektriker", "Sanitär"],
  gesundheit: ["Physiotherapie", "Zahnarzt", "Arztpraxis", "Pflegedienst"],
  kanzlei: ["Rechtsanwalt", "Steuerberater", "Architekt", "Notar"],
  auto: ["Autohaus", "Autowerkstatt"],
  bau: ["Bauunternehmen", "Dachdecker", "Heizung"],
  alle: ["Physiotherapie", "Tischlerei", "Rechtsanwalt", "Autohaus", "Zahnarzt"],
};

const OVERPASS_TAGS: Record<RadarCategory, string[]> = {
  handwerk: ['["craft"]', '["shop"~"trade|hardware"]'],
  gesundheit: [
    '["amenity"~"doctors|dentist|clinic|pharmacy"]',
    '["healthcare"]',
  ],
  kanzlei: [
    '["office"~"lawyer|tax_advisor|notary|accountant|architect|company"]',
  ],
  auto: ['["shop"~"car|car_repair"]'],
  bau: ['["craft"~"roofer|carpenter|electrician|plumber|painter|hvac|builder"]'],
  alle: [
    '["craft"]',
    '["amenity"~"doctors|dentist|clinic"]',
    '["office"~"lawyer|tax_advisor|architect"]',
  ],
};

interface NominatimGeoItem {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

interface PhotonFeature {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
  };
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

const TYPE_LABELS: Record<string, string> = {
  dentist: "Zahnarztpraxis",
  doctors: "Arztpraxis",
  clinic: "Medizinische Praxis",
  physiotherapist: "Physiotherapie",
  healthcare: "Gesundheit & Pflege",
  lawyer: "Rechtsanwaltskanzlei",
  tax_advisor: "Steuerberatung",
  notary: "Notariat",
  architect: "Architekturbüro",
  car: "Autohaus",
  car_repair: "Kfz-Werkstatt",
  carpenter: "Tischlerei / Zimmerei",
  roofer: "Dachdeckerei",
  plumber: "Sanitär & Heizung",
  electrician: "Elektrobetrieb",
  craft: "Handwerk",
};

function formatNominatimAddress(
  addr: Record<string, string> | undefined,
  fallbackCity: string,
): string {
  if (!addr) return fallbackCity;
  const road = addr.road ?? "";
  const house = addr.house_number ?? "";
  const postcode = addr.postcode ?? "";
  const city = addr.city ?? addr.town ?? addr.village ?? fallbackCity;
  const line1 = `${road} ${house}`.trim();
  const line2 = `${postcode} ${city}`.trim();
  if (line1 && line2) return `${line1}, ${line2}`;
  return line1 || line2 || fallbackCity;
}

function formatOverpassAddress(
  tags: Record<string, string>,
  fallbackCity: string,
): string {
  const street = tags["addr:street"] ?? "";
  const number = tags["addr:housenumber"] ?? "";
  const postcode = tags["addr:postcode"] ?? "";
  const city = tags["addr:city"] ?? fallbackCity;
  const line1 = `${street} ${number}`.trim();
  const line2 = `${postcode} ${city}`.trim();
  if (line1 && line2) return `${line1}, ${line2}`;
  return line1 || line2 || fallbackCity;
}

async function fetchNominatimPois(
  queryTerm: string,
  city: string,
  viewbox?: string,
): Promise<NominatimGeoItem[]> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${queryTerm} ${city}`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "15");
    if (viewbox) {
      url.searchParams.set("viewbox", viewbox);
      url.searchParams.set("bounded", "1");
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(7_000),
      headers: {
        "user-agent": "LinkifyGrowthOS/1.0 (https://linkify.tech)",
        accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimGeoItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchPhotonPois(
  queryTerm: string,
  city: string,
): Promise<PhotonFeature[]> {
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", `${queryTerm} ${city}`);
    url.searchParams.set("limit", "12");
    url.searchParams.set("lang", "de");
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(6_000),
      headers: {
        "user-agent": "LinkifyGrowthOS/1.0 (https://linkify.tech)",
        accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return Array.isArray(data.features) ? data.features : [];
  } catch {
    return [];
  }
}

async function tryFastOverpass(
  bbox: string,
  category: RadarCategory,
  limit: number,
): Promise<OverpassElement[]> {
  try {
    const filters = OVERPASS_TAGS[category] ?? OVERPASS_TAGS.alle;
    const queryLines = filters
      .map((f) => `  nwr${f}["name"](${bbox});`)
      .join("\n");
    const overpassQuery = `[out:json][timeout:6];\n(\n${queryLines}\n);\nout tags ${limit * 2};`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: {
        "user-agent": "LinkifyGrowthOS/1.0 (https://linkify.tech)",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({ data: overpassQuery }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  } catch {
    return [];
  }
}

export async function searchLocalBusinesses(params: {
  city: string;
  category: RadarCategory;
  keyword?: string;
  onlyWithWebsite?: boolean;
  limit?: number;
  existingWebsites?: Set<string>;
  existingNames?: Set<string>;
}): Promise<{
  resolvedLocation: string;
  candidates: RadarCandidate[];
}> {
  const city = params.city.trim().slice(0, 80);
  if (!city) {
    throw new Error("Bitte einen Ort oder eine Stadt eingeben.");
  }

  const limit = Math.min(Math.max(params.limit ?? 20, 5), 35);

  const geoUrl = new URL("https://nominatim.openstreetmap.org/search");
  geoUrl.searchParams.set("q", `${city}, Deutschland`);
  geoUrl.searchParams.set("format", "jsonv2");
  geoUrl.searchParams.set("limit", "1");

  const geoRes = await fetch(geoUrl.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
    headers: {
      "user-agent": "LinkifyGrowthOS/1.0 (https://linkify.tech)",
      accept: "application/json",
    },
  });

  if (!geoRes.ok) {
    throw new Error(`Standortsuche fehlgeschlagen (HTTP ${geoRes.status}).`);
  }

  const geoData = (await geoRes.json()) as NominatimGeoItem[];
  if (
    !Array.isArray(geoData) ||
    geoData.length === 0 ||
    !geoData[0].boundingbox
  ) {
    throw new Error(`Ort "${city}" konnte nicht gefunden werden.`);
  }

  const [southRaw, northRaw, westRaw, eastRaw] = geoData[0].boundingbox;
  const south = Number.parseFloat(southRaw);
  const north = Number.parseFloat(northRaw);
  const west = Number.parseFloat(westRaw);
  const east = Number.parseFloat(eastRaw);

  const latMid = (south + north) / 2;
  const lonMid = (west + east) / 2;
  const clampedSouth = Math.max(south, latMid - 0.18).toFixed(5);
  const clampedNorth = Math.min(north, latMid + 0.18).toFixed(5);
  const clampedWest = Math.max(west, lonMid - 0.25).toFixed(5);
  const clampedEast = Math.min(east, lonMid + 0.25).toFixed(5);

  const overpassBbox = `${clampedSouth},${clampedWest},${clampedNorth},${clampedEast}`;
  const nominatimViewbox = `${clampedWest},${clampedNorth},${clampedEast},${clampedSouth}`;

  const customKeyword = params.keyword?.trim().slice(0, 60);
  const terms = customKeyword
    ? [customKeyword]
    : (CATEGORY_KEYWORDS[params.category] ?? CATEGORY_KEYWORDS.alle).slice(0, 3);

  const [poiBatches, photonPois, overpassElements] = await Promise.all([
    Promise.all(terms.map((t) => fetchNominatimPois(t, city, nominatimViewbox))),
    customKeyword ? fetchPhotonPois(customKeyword, city) : Promise.resolve([]),
    customKeyword
      ? Promise.resolve([])
      : tryFastOverpass(overpassBbox, params.category, limit),
  ]);

  const seenNames = new Set<string>();
  const candidates: RadarCandidate[] = [];

  const pushCandidate = (c: Omit<RadarCandidate, "alreadyInPipeline">) => {
    const normName = c.companyName.toLowerCase();
    if (!c.companyName || seenNames.has(normName)) return;
    if (params.onlyWithWebsite && !c.websiteUrl) return;
    seenNames.add(normName);

    const normalizedDomain = c.websiteUrl
      ? c.websiteUrl
          .replace(/^https?:\/\/(www\.)?/i, "")
          .replace(/\/.*$/, "")
          .toLowerCase()
      : "";

    const alreadyInPipeline =
      Boolean(params.existingNames?.has(normName)) ||
      (normalizedDomain !== "" &&
        Boolean(params.existingWebsites?.has(normalizedDomain)));

    candidates.push({ ...c, alreadyInPipeline });
  };

  for (let i = 0; i < poiBatches.length; i++) {
    const term = terms[i];
    for (const item of poiBatches[i]) {
      const name = (item.name ?? "").trim();
      if (!name) continue;
      const tags = item.extratags ?? {};
      const rawSite = tags.website ?? tags["contact:website"] ?? tags.url ?? "";
      const safeSite = sanitizeExternalHref(rawSite) ?? "";
      const typeLabel =
        (item.type && TYPE_LABELS[item.type]) ||
        (tags.craft && TYPE_LABELS[tags.craft]) ||
        term;

      pushCandidate({
        osmId: `${item.osm_type ?? "poi"}:${item.osm_id ?? name}`,
        companyName: name,
        industry: typeLabel,
        city:
          item.address?.city ??
          item.address?.town ??
          item.address?.village ??
          city,
        postalAddress: formatNominatimAddress(item.address, city),
        websiteUrl: safeSite,
        contactEmail: (tags.email ?? tags["contact:email"] ?? "").trim(),
        contactPhone: (tags.phone ?? tags["contact:phone"] ?? "").trim(),
      });
    }
  }

  for (const feat of photonPois) {
    const props = feat.properties;
    const name = (props?.name ?? "").trim();
    if (!name) continue;
    const line1 = `${props?.street ?? ""} ${props?.housenumber ?? ""}`.trim();
    const line2 = `${props?.postcode ?? ""} ${props?.city ?? city}`.trim();
    const postalAddress = line1 && line2 ? `${line1}, ${line2}` : line1 || line2;
    const label =
      (props?.osm_value && TYPE_LABELS[props.osm_value]) ||
      customKeyword ||
      "Lokales Unternehmen";

    pushCandidate({
      osmId: `ph:${props?.osm_type ?? "N"}:${props?.osm_id ?? name}`,
      companyName: name,
      industry: label,
      city: props?.city ?? city,
      postalAddress,
      websiteUrl: "",
      contactEmail: "",
      contactPhone: "",
    });
  }

  for (const el of overpassElements) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name) continue;
    const rawSite = tags.website ?? tags["contact:website"] ?? tags.url ?? "";
    const safeSite = sanitizeExternalHref(rawSite) ?? "";
    const industry =
      TYPE_LABELS[tags.craft ?? ""] ??
      TYPE_LABELS[tags.amenity ?? ""] ??
      TYPE_LABELS[tags.office ?? ""] ??
      "Lokales Unternehmen";

    pushCandidate({
      osmId: `${el.type}:${el.id}`,
      companyName: name,
      industry,
      city: tags["addr:city"] ?? city,
      postalAddress: formatOverpassAddress(tags, city),
      websiteUrl: safeSite,
      contactEmail: (tags.email ?? tags["contact:email"] ?? "").trim(),
      contactPhone: (tags.phone ?? tags["contact:phone"] ?? "").trim(),
    });
  }

  return {
    resolvedLocation: geoData[0].display_name ?? city,
    candidates: candidates.slice(0, limit),
  };
}
