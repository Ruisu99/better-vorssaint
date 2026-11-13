import { runAiTask } from "./openrouter";
import type { RadarCandidate, TargetTrack } from "./types";
import { sanitizeExternalHref } from "./url-safety";

export type RadarCategory =
  | "alle"
  | "handwerk"
  | "gesundheit"
  | "kanzlei"
  | "auto"
  | "bau";

const CATEGORY_KEYWORDS: Record<RadarCategory, string[]> = {
  handwerk: [
    "Dachdecker",
    "Tischlerei",
    "Elektro",
    "Sanitär",
    "Maler",
    "Heizung",
  ],
  gesundheit: [
    "Zahnarzt",
    "Physiotherapie",
    "Arztpraxis",
    "Pflegedienst",
    "Ergotherapie",
  ],
  kanzlei: [
    "Rechtsanwalt",
    "Steuerberater",
    "Architekt",
    "Notar",
    "Ingenieurbüro",
  ],
  auto: ["Autohaus", "Autowerkstatt", "Kfz"],
  bau: ["Bauunternehmen", "Dachdecker", "Zimmerei", "Tiefbau"],
  alle: ["Zahnarzt", "Physiotherapie", "Dachdecker", "Autohaus", "Tischlerei"],
};

const KEYWORD_CATEGORY_ALIASES: Array<[RegExp, RadarCategory]> = [
  [/^(handwerk|handwerker|betriebe?)$/i, "handwerk"],
  [/^(gesundheit|praxis|praxen|pflege|medizin|arzt)$/i, "gesundheit"],
  [/^(kanzlei|kanzleien|beratung|recht|steuer)$/i, "kanzlei"],
  [/^(auto|autohaus|autohäuser|kfz|werkstatt)$/i, "auto"],
  [/^(bau|bauunternehmen|baubranche|architektur)$/i, "bau"],
  [/^(alle|allgemein|unternehmen|kmu|lokal)$/i, "alle"],
];

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
      signal: AbortSignal.timeout(5_000),
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
      signal: AbortSignal.timeout(4_500),
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

function expandSearchTerms(
  category: RadarCategory,
  keyword?: string,
): string[] {
  const clean = keyword?.trim() ?? "";
  if (!clean) {
    return CATEGORY_KEYWORDS[category] ?? CATEGORY_KEYWORDS.alle;
  }
  for (const [rx, mappedCat] of KEYWORD_CATEGORY_ALIASES) {
    if (rx.test(clean)) {
      return CATEGORY_KEYWORDS[mappedCat];
    }
  }
  return [clean];
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

  const limit = Math.min(Math.max(params.limit ?? 25, 5), 40);

  const geoUrl = new URL("https://nominatim.openstreetmap.org/search");
  geoUrl.searchParams.set("q", `${city}, Deutschland`);
  geoUrl.searchParams.set("format", "jsonv2");
  geoUrl.searchParams.set("limit", "1");

  const geoRes = await fetch(geoUrl.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(5_000),
    headers: {
      "user-agent": "LinkifyGrowthOS/1.0 (https://linkify.tech)",
      accept: "application/json",
    },
  });

  let resolvedLocation = city;
  let nominatimViewbox: string | undefined;

  if (geoRes.ok) {
    const geoData = (await geoRes.json()) as NominatimGeoItem[];
    if (Array.isArray(geoData) && geoData.length > 0) {
      resolvedLocation = geoData[0].display_name ?? city;
      if (geoData[0].boundingbox) {
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
        nominatimViewbox = `${clampedWest},${clampedNorth},${clampedEast},${clampedSouth}`;
      }
    }
  }

  const terms = expandSearchTerms(params.category, params.keyword).slice(0, 4);

  // Run in two gentle pairs (200ms stagger) so OSM Nominatim never rate-limits shared cloud IPs
  const poiBatches: NominatimGeoItem[][] = [];
  for (let i = 0; i < terms.length; i += 2) {
    const slice = terms.slice(i, i + 2);
    const batch = await Promise.all(
      slice.map((t) => fetchNominatimPois(t, city, nominatimViewbox)),
    );
    poiBatches.push(...batch);
    if (i + 2 < terms.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const photonPois =
    params.keyword?.trim() && terms.length === 1
      ? await fetchPhotonPois(params.keyword.trim(), city)
      : [];

  const seenNames = new Set<string>();
  const candidates: RadarCandidate[] = [];

  const INSTITUTIONAL_SKIP =
    /\b(berufsgenossenschaft|handwerkskammer|ihk|industrie- und handelskammer|universität|hochschule|finanzamt|stadtverwaltung|landratsamt|jobcenter|bundesagentur|arbeitsagentur|polizei|feuerwehr|rathaus|ministerium|krankenkasse|aok|barmer|tk |dekra|tüv )\b/i;

  const pushCandidate = (c: Omit<RadarCandidate, "alreadyInPipeline">) => {
    const normName = c.companyName.toLowerCase();
    if (!c.companyName || seenNames.has(normName)) return;
    if (INSTITUTIONAL_SKIP.test(c.companyName)) return;
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
    const term = terms[i] ?? "Unternehmen";
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
      params.keyword?.trim() ||
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

  return {
    resolvedLocation,
    candidates: candidates.slice(0, limit),
  };
}

/**
 * Live Web Discovery via OpenRouter's Perplexity Sonar ($1/$1 per 1M tokens)
 * to discover real DACH startups, SaaS teams, and local businesses.
 */
export async function searchWebProspectsWithOpenRouter(params: {
  scopeKey: string;
  query: string;
  city: string;
  track: TargetTrack;
  limit?: number;
  existingWebsites?: Set<string>;
  existingNames?: Set<string>;
}): Promise<{
  candidates: RadarCandidate[];
  providerMode: "openrouter" | "local_fallback";
  modelUsed: string;
  limitBlockedReason?: string;
}> {
  const count = Math.min(Math.max(params.limit ?? 8, 3), 12);
  const region = params.city.trim() || "Deutschland / DACH";
  const focus =
    params.track === "startup"
      ? `junge B2B-Startups, SaaS-Produkte oder digitale Plattformen mit Sitz in ${region}`
      : `lokale KMU, Handwerksbetriebe, Praxen, Kanzleien oder Dienstleister in ${region}`;

  const prompt = `Finde ${count} reale, aktuell existierende Unternehmen (${focus}) passend zu "${params.query}".
REGELN:
- Nur Unternehmen mit echter eigener Unternehmenswebsite (keine Verzeichnisse wie GelbeSeiten, KennstDuEinen, ProvenExpert, LinkedIn, Instagram, Northdata).
- Erfinde NIEMALS eine Domain oder Firma.
- Antworte ausschließlich mit einem validen JSON-Array ohne Markdown oder Erklärtext:
[
  {
    "companyName": "Exakter Unternehmensname",
    "industry": "Branche",
    "city": "Stadt",
    "websiteUrl": "https://...",
    "postalAddress": "Straße Hausnummer, PLZ Stadt oder leer"
  }
]`;

  const aiRes = await runAiTask({
    scopeKey: params.scopeKey,
    taskType: "web_discovery",
    model: "perplexity/sonar",
    systemPrompt:
      "Du bist ein B2B-Recherche-Assistent für Deutschland. Antworte ausschließlich mit einem JSON-Array realer Unternehmen samt eigener Website.",
    userPrompt: prompt,
    temperature: 0.1,
    maxTokens: 1100,
    privacyMode: true,
    summaryLabel: `Live-Websuche: ${params.query} (${region})`,
    fallbackFn: () => "[]",
  });

  const cleaned = aiRes.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: Array<Record<string, unknown>> = [];
  try {
    const startIdx = cleaned.indexOf("[");
    const endIdx = cleaned.lastIndexOf("]");
    const slice =
      startIdx !== -1 && endIdx > startIdx
        ? cleaned.slice(startIdx, endIdx + 1)
        : cleaned;
    const raw = JSON.parse(slice);
    if (Array.isArray(raw)) parsed = raw;
  } catch {
    parsed = [];
  }

  const DIRECTORY_BLOCKLIST = [
    "gelbeseiten.de",
    "11880.com",
    "dasoertliche.de",
    "kennstdueinen.de",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "kununu.com",
    "northdata.de",
    "crunchbase.com",
    "yelp.",
    "jameda.de",
    "doctolib.de",
    "provenexpert.com",
    "wer-zu-wem.de",
  ];

  const seen = new Set<string>();
  const candidates: RadarCandidate[] = [];

  for (const row of parsed) {
    const name = String(row.companyName ?? "").trim().slice(0, 160);
    const safeSite =
      sanitizeExternalHref(String(row.websiteUrl ?? "")) ?? "";
    if (!name || !safeSite) continue;

    const domain = safeSite
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (DIRECTORY_BLOCKLIST.some((blk) => domain.includes(blk))) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);

    const alreadyInPipeline =
      Boolean(params.existingNames?.has(name.toLowerCase())) ||
      Boolean(params.existingWebsites?.has(domain));

    candidates.push({
      osmId: `web:${domain}`,
      companyName: name,
      industry: String(row.industry ?? params.query).trim().slice(0, 100),
      city: String(row.city ?? region).trim().slice(0, 80),
      postalAddress: String(row.postalAddress ?? "").trim().slice(0, 220),
      websiteUrl: safeSite,
      contactEmail: "",
      contactPhone: "",
      alreadyInPipeline,
    });
  }

  return {
    candidates: candidates.slice(0, count),
    providerMode: aiRes.providerMode,
    modelUsed: aiRes.modelUsed,
    limitBlockedReason: aiRes.limitBlockedReason,
  };
}
