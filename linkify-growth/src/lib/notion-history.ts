/**
 * Normalized company names & domains from the existing Notion Lead-Pipeline export
 * so automated runs never re-discover or duplicate previously contacted companies.
 */
export const NOTION_HISTORICAL_DOMAINS: string[] = [
  "doktorhermann.de",
  "byland.de",
  "gftgotha.de",
  "zahnarztjena.info",
  "schoenfels-aufzuege.de",
  "werra-blitz.de",
  "zahnarztpraxis-jena.com",
  "zahnmedizin-erfurt.de",
  "zahnarzt-schwarz-erfurt.de",
  "autohausmoeller.de",
  "zahnarzt-weimar.com",
  "cl-maschinenbau.com",
  "erfurt-arzt.de",
  "tgmbh.de",
  "megamoebel.eu",
  "ra-kanzlei-becker.de",
  "city-werbung-suhl.de",
  "prelu-reichenbach.de",
  "mvz-zahnaerzte-weimar.de",
  "zahnarztpraxishabel-gotha.de",
  "kutter-bau.de",
  "kkt-erfurt.de",
  "tf-finanzmakler.de",
  "neuwagen-ah.de",
  "erfurt-ths.de",
  "frank-schaefer-gmbh.de",
  "wum-mhl.de",
  "spenglerei-thueringen.de",
  "tischlereifischer.de",
  "elektro-krug-sonneberg.de",
  "gkz-bau.de",
  "tischlerei-senf.de",
  "fs-bau.de",
  "begabau.de",
  "dr-mansel.de",
  "dachdecker-eisenach.de",
];

export const NOTION_HISTORICAL_NAMES: string[] = [
  "praxis für zahnmedizin dr. stefan hermann",
  "by land möbelstudio gmbh & co. kg",
  "gothaer fahrzeugtechnik gmbh",
  "zahnarztpraxis kraft & trinks",
  "schönfels aufzüge gmbh & co. kg",
  "werra-blitz-transportgesellschaft mbh",
  "zahnarztpraxis dr. katrin rudakoff",
  "zahnmedizin dr. meyer",
  "zahnarztpraxis dr. ulrich schwarz",
  "autohaus möller gmbh",
  "zahnarztpraxis dr. r.-m. schenk",
  "cl maschinenbau gmbh",
  "tcm-arztpraxis dipl.-med. michaela boehm-kürschner",
  "tgm thüringer großmechanik gmbh",
  "mega möbel handelsgesellschaft mbh",
  "anwaltskanzlei stephan becker",
  "city-werbung suhl gmbh",
  "prechtl lufttechnik gmbh",
  "mvz zahnärzte weimar",
  "zahnarztpraxis anne habel",
  "baugeschäft kutter gmbh",
  "kälte-klima-technik kkt köllner gmbh",
  "tf finanzmakler gmbh",
  "neuwagen-ah",
  "ths technischer hausservice gmbh",
  "frank schäfer gmbh straßen- und tiefbau",
  "wum werkzeug- und maschinenbau gmbh mühlhausen",
  "schmidt spenglerei thüringen gmbh",
  "tischlerei fischer gmbh",
  "elektro-krug gmbh",
  "g.k.z. bau gmbh & co. kg",
  "tischlerei senf inh. peggy holick e. k.",
  "f & s bau gmbh werratal",
  "bega bau gmbh meiningen",
  "zahnärztliche praxis dr. mansel",
  "dariwa gmbh dachdeckerei kuno gutmann",
];

export function normalizeDomain(urlOrDomain: string): string {
  return urlOrDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function isHistoricalNotionLead(
  companyName: string,
  websiteUrl: string,
): boolean {
  const normDomain = websiteUrl ? normalizeDomain(websiteUrl) : "";
  if (normDomain && NOTION_HISTORICAL_DOMAINS.includes(normDomain)) {
    return true;
  }
  const normName = companyName.trim().toLowerCase();
  if (normName && NOTION_HISTORICAL_NAMES.includes(normName)) {
    return true;
  }
  return false;
}
