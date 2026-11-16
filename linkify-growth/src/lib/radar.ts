import { isHistoricalNotionLead, normalizeDomain } from "./notion-history";
import { runAiTask } from "./openrouter";
import type { RadarCandidate, TargetTrack } from "./types";
import { sanitizeExternalHref } from "./url-safety";

export type RadarCategory =
  | "alle"
  | "handwerk"
  | "gesundheit"
  | "kanzlei"
  | "auto"
  | "bau"
  | "moebel"
  | "industrie";

export const THURINGIA_CITIES = [
  "Erfurt",
  "Jena",
  "Weimar",
  "Gera",
  "Eisenach",
  "Gotha",
  "Suhl",
  "Nordhausen",
  "Mühlhausen",
  "Meiningen",
  "Saalfeld",
  "Rudolstadt",
  "Arnstadt",
  "Ilmenau",
  "Altenburg",
  "Apolda",
  "Sonneberg",
  "Bad Salzungen",
];

export const GERMANY_CITIES = [
  ...THURINGIA_CITIES.slice(0, 12),
  "Leipzig",
  "Dresden",
  "Chemnitz",
  "Halle (Saale)",
  "Magdeburg",
  "Kassel",
  "Göttingen",
  "Bamberg",
  "Coburg",
  "Würzburg",
  "Nürnberg",
  "Regensburg",
  "Augsburg",
  "Ulm",
  "Hannover",
  "Braunschweig",
  "Münster",
  "Bielefeld",
  "Paderborn",
  "Mainz",
  "Wiesbaden",
  "Karlsruhe",
  "Freiburg",
  "Potsdam",
  "Lübeck",
  "Rostock",
];

const CATEGORY_KEYWORDS: Record<RadarCategory, string[]> = {
  gesundheit: [
    "Zahnarztpraxis",
    "Arztpraxis",
    "Physiotherapie",
    "Pflegedienst",
    "Kieferorthopädie",
  ],
  kanzlei: [
    "Steuerberatung",
    "Rechtsanwaltskanzlei",
    "Architekturbüro",
    "Ingenieurbüro",
    "Notariat",
  ],
  auto: ["Autohaus", "Autowerkstatt", "Fahrzeugtechnik"],
  handwerk: [
    "Dachdecker",
    "Tischlerei",
    "Elektrobetrieb",
    "Sanitär Heizung",
    "Malerbetrieb",
    "Metallbau",
  ],
  bau: ["Bauunternehmen", "Straßenbau", "Tiefbau", "Zimmerei", "Gerüstbau"],
  moebel: ["Möbelhaus", "Möbelstudio", "Küchenstudio", "Einrichtungshaus"],
  industrie: [
    "Maschinenbau",
    "Werkzeugbau",
    "Lufttechnik",
    "Anlagenbau",
    "Elektrotechnik",
  ],
  alle: [
    "Zahnarztpraxis",
    "Dachdecker",
    "Autohaus",
    "Steuerberatung",
    "Bauunternehmen",
    "Maschinenbau",
    "Tischlerei",
    "Möbelhaus",
  ],
};

const KEYWORD_CATEGORY_ALIASES: Array<[RegExp, RadarCategory]> = [
  [/^(handwerk|handwerker|betriebe?)$/i, "handwerk"],
  [/^(gesundheit|praxis|praxen|pflege|medizin|arzt|zahnarzt)$/i, "gesundheit"],
  [/^(kanzlei|kanzleien|beratung|recht|steuer)$/i, "kanzlei"],
  [/^(auto|autohaus|autohäuser|kfz|werkstatt)$/i, "auto"],
  [/^(bau|bauunternehmen|baubranche)$/i, "bau"],
  [/^(möbel|moebel|möbelhandel|küche)$/i, "moebel"],
  [/^(industrie|maschinenbau|metallbau)$/i, "industrie"],
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

const TYPE_LABELS: Record<string, string> = {
  dentist: "Zahnarztpraxis",
  doctors: "Arztpraxis",
  clinic: "Arztpraxis / Klinik",
  physiotherapist: "Physiotherapie",
  healthcare: "Gesundheit & Pflege",
  lawyer: "Rechtskanzlei",
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

const INSTITUTIONAL_OR_CHAIN_SKIP =
  /\b(berufsgenossenschaft|handwerkskammer|ihk|industrie- und handelskammer|universität|hochschule|finanzamt|stadtverwaltung|landratsamt|jobcenter|bundesagentur|arbeitsagentur|polizei|feuerwehr|rathaus|ministerium|krankenkasse|aok|barmer|dak|techniker krankenkasse|dekra|tüv|sparkasse|volksbank|raiffeisenbank|commerzbank|deutsche bank|postbank|aldi|lidl|rewe|edeka|kaufland|penny|netto|rossmann|dm-drogerie|obi|hornbach|bauhaus|toom|ikea|xxxlutz|poco|atu|carglass|fielmann|apollo|bti|würth|berner|hoffmann group|handwerker-center|globus|hellweg|hagebau|baywa|raab karcher|sonepar|rexel|hilti|bosch|siemens|telekom|vodafone|o2|allianz|axa|ergo|huk-coburg|provinzial|debeka|signal iduna|mcfit|fitx|mcdonald|burger king|starbucks|subway|kfc|dm|müller|thalia|douglas|deichmann|mediamarkt|saturn|euronics|expert)\b/i;

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
  "wlw.de",
  "firmendb.de",
  "bundesanzeiger.de",
  "wikipedia.org",
];

export function isEligibleBusinessCandidate(params: {
  companyName: string;
  websiteUrl: string;
  onlyDeDomains?: boolean;
}): boolean {
  const name = params.companyName.trim();
  const url = params.websiteUrl.trim();
  if (!name || !url) return false;
  if (INSTITUTIONAL_OR_CHAIN_SKIP.test(name)) return false;

  const domain = normalizeDomain(url);
  if (!domain) return false;
  if (DIRECTORY_BLOCKLIST.some((d) => domain.includes(d))) return false;
  if (params.onlyDeDomains && !domain.endsWith(".de")) return false;
  if (/\/(shop-de|onlineshop|webshop)\b/i.test(url)) return false;
  if (isHistoricalNotionLead(name, url)) return false;

  return true;
}

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
): Promise<NominatimGeoItem[]> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${queryTerm} ${city}`);
    url.searchParams.set("countrycodes", "de");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "15");

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
  onlyDeDomains?: boolean;
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
  const terms = expandSearchTerms(params.category, params.keyword).slice(0, 4);

  const poiBatches: NominatimGeoItem[][] = [];
  for (let i = 0; i < terms.length; i += 2) {
    const slice = terms.slice(i, i + 2);
    const batch = await Promise.all(
      slice.map((t) => fetchNominatimPois(t, city)),
    );
    poiBatches.push(...batch);
    if (i + 2 < terms.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  const candidates: RadarCandidate[] = [];

  for (let i = 0; i < poiBatches.length; i++) {
    const term = terms[i] ?? "Unternehmen";
    for (const item of poiBatches[i]) {
      const name = (item.name ?? "").trim();
      if (!name) continue;
      const tags = item.extratags ?? {};
      const rawSite = tags.website ?? tags["contact:website"] ?? tags.url ?? "";
      const safeSite = sanitizeExternalHref(rawSite) ?? "";

      if (params.onlyWithWebsite && !safeSite) continue;
      if (INSTITUTIONAL_OR_CHAIN_SKIP.test(name)) continue;

      const domain = safeSite ? normalizeDomain(safeSite) : "";
      if (params.onlyDeDomains && (!domain || !domain.endsWith(".de"))) {
        continue;
      }
      if (domain && DIRECTORY_BLOCKLIST.some((d) => domain.includes(d))) {
        continue;
      }
      if (isHistoricalNotionLead(name, safeSite)) continue;

      const normName = name.toLowerCase();
      if (seenNames.has(normName) || (domain && seenDomains.has(domain))) {
        continue;
      }
      seenNames.add(normName);
      if (domain) seenDomains.add(domain);

      const alreadyInPipeline =
        Boolean(params.existingNames?.has(normName)) ||
        (domain !== "" && Boolean(params.existingWebsites?.has(domain)));

      const typeLabel =
        (item.type && TYPE_LABELS[item.type]) ||
        (tags.craft && TYPE_LABELS[tags.craft]) ||
        term;

      candidates.push({
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
        alreadyInPipeline,
      });
    }
  }

  return {
    resolvedLocation: city,
    candidates: candidates.slice(0, limit),
  };
}

/**
 * Live Web Discovery via OpenRouter's Perplexity Sonar ($1/$1 per 1M tokens)
 * specifically targeting medium-sized German businesses (5-50 employees, .de domains).
 */
export async function searchWebProspectsWithOpenRouter(params: {
  scopeKey: string;
  query: string;
  city: string;
  track: TargetTrack;
  onlyDeDomains?: boolean;
  excludeDomains?: string[];
  limit?: number;
  existingWebsites?: Set<string>;
  existingNames?: Set<string>;
}): Promise<{
  candidates: RadarCandidate[];
  providerMode: "openrouter" | "local_fallback";
  modelUsed: string;
  limitBlockedReason?: string;
  estimatedCostUsd: number;
}> {
  const count = Math.min(Math.max(params.limit ?? 10, 4), 14);
  const region = params.city.trim() || "Deutschland";
  const domainRule =
    params.onlyDeDomains !== false
      ? "Ausschließlich eigene .de-Domains (z. B. https://www.firma.de)."
      : "Eigene Unternehmensdomains.";

  const focus =
    params.track === "startup"
      ? `kleinere bis mittlere B2B-Softwareunternehmen, SaaS-Anbieter oder digitale Produktteams (5 bis 50 Mitarbeiter) in ${region}`
      : `inhabergeführte KMU, Arzt-/Zahnarztpraxen, Kanzleien, Autohäuser, Handwerks-/Bauunternehmen, Möbelhäuser oder kleinere Industrieunternehmen (5 bis 50 Mitarbeiter) in ${region}`;

  const skipList = (params.excludeDomains ?? []).slice(0, 20).join(", ");

  const prompt = `Finde ${count} reale, aktuell existierende Unternehmen (${focus}) passend zum Bereich "${params.query}".
WICHTIGE REGELN:
- ${domainRule}
- Keine Konzerne, keine Filialketten, keine Behörden/Kammern, keine Verzeichnisse (GelbeSeiten, KennstDuEinen, Jameda, Doctolib, Northdata, LinkedIn).
- Bevorzuge etablierte Betriebe, deren Websites potenziell älter oder unübersichtlich wirken könnten.
${skipList ? `- Diese Domains NICHT erneut nennen: ${skipList}\n` : ""}- Erfinde NIEMALS eine Domain oder Firma.
- Antworte ausschließlich mit einem validen JSON-Array ohne Markdown oder Text davor/danach:
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
      "Du bist ein präziser B2B-Recherche-Assistent für Deutschland. Antworte ausschließlich mit einem JSON-Array realer Unternehmen samt eigener Firmenwebsite.",
    userPrompt: prompt,
    temperature: 0.15,
    maxTokens: 1300,
    privacyMode: true,
    summaryLabel: `Live-Websuche (${params.query} · ${region})`,
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

  const seen = new Set<string>();
  const candidates: RadarCandidate[] = [];

  for (const row of parsed) {
    const name = String(row.companyName ?? "").trim().slice(0, 160);
    const safeSite = sanitizeExternalHref(String(row.websiteUrl ?? "")) ?? "";
    if (
      !isEligibleBusinessCandidate({
        companyName: name,
        websiteUrl: safeSite,
        onlyDeDomains: params.onlyDeDomains !== false,
      })
    ) {
      continue;
    }

    const domain = normalizeDomain(safeSite);
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
    estimatedCostUsd: aiRes.estimatedCostUsd,
  };
}
