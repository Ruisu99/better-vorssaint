import type {
  BrandProfile,
  BuyingSignal,
  ContentFormat,
  Lead,
  LeadFinding,
  LeadPriority,
  OutreachChannel,
  TargetTrack,
} from "./types";

export function buildLinkifySystemPrompt(brand: BrandProfile): string {
  const servicesList = brand.core_services
    .map((s) => `- ${s.name}: ${s.description} (Stack u. a.: ${s.stackHint})`)
    .join("\n");

  const refsList = brand.verified_references
    .map(
      (r) =>
        `- ${r.clientName} (${r.type}): ${r.summary} | Belegte Punkte: ${r.highlights.join("; ")}`,
    )
    .join("\n");

  const excluded = brand.excluded_services.map((e) => `- ${e}`).join("\n");

  return `Du bist der strenge Qualifizierungs- und Text-Assistent für "${brand.brand_name}" (Inhaber: ${brand.owner_name}, Standort: ${brand.city}, Website: ${brand.website_url}).

POSITIONIERUNG:
${brand.positioning_statement}

STRENGES ANTI-HALLUZINATIONS-GEBOT:
- Erfinde NIEMALS Kennzahlen, Zitate, Mitarbeiterzahlen, Testimonials oder nicht belegte Kundenreferenzen.
- Nutze ausschließlich die übergebenen abgerufenen Seiteninhalte und diese verifizierten Referenzen:
${refsList}

KERNLEISTUNGEN:
${servicesList}

NICHT IM FOKUS:
${excluded}`;
}

/**
 * Builds the strict 5-condition Notion Lead-Radar prompt that qualifies/rejects
 * AND extracts Geschäftsführer/Inhaber + Postanschrift + Kurzprofil, Befunde+Zitate,
 * Kaufsignale, E-Mail-Pitch & DIN-5008 Brieffassung in ONE high-quality pass.
 */
export function buildStrictNotionQualificationPrompt(params: {
  brand: BrandProfile;
  lead: Lead;
}): string {
  const { lead } = params;
  const pages = lead.scan_data?.crawledPages ?? [];
  const pageDump =
    pages.length > 0
      ? pages
          .map(
            (p) =>
              `--- SEITE [${p.kind.toUpperCase()}] URL: ${p.url}\nTitel: ${p.title}\nSichtbarer Text:\n${p.excerpt.slice(0, 2100)}`,
          )
          .join("\n\n")
      : `--- STARTSEITE URL: ${lead.website_url}\n${lead.scan_data?.visibleSummary ?? lead.research_summary}`;

  const techSignals = lead.scan_data
    ? `HTTPS: ${lead.scan_data.httpsEnabled ? "Ja" : "Nein"} | Mobile-Viewport-Tag im HTML: ${lead.scan_data.hasViewportMeta ? "Ja" : "Nein"} | System: ${lead.scan_data.detectedCms} | Antwortzeit: ${lead.scan_data.responseTimeMs} ms | Kontaktformular/CTA: ${lead.scan_data.hasContactFormOrCta ? "Ja" : "Nein"} | Karriere-Signal: ${lead.scan_data.hasHiringSignal ? "Ja" : "Nein"}`
    : "Keine technischen Scan-Daten";

  return `Prüfe diesen Kandidaten streng wie ein erfahrener Webdesigner & Strategie-Analyst nach der Linkify-Qualifikationshürde (Qualität geht vor Menge!):

KANDIDAT:
Unternehmen: ${lead.company_name}
Branche: ${lead.industry || "unbekannt"}
Ort: ${lead.city || "unbekannt"}
Bisher erkannte Postanschrift: ${lead.postal_address || "keine erkannt"}
Bisher erkannter Entscheider: ${lead.decision_maker || "unbekannt"}
Bisher erkannte E-Mail: ${lead.contact_email || "keine erkannt"}
Website: ${lead.website_url}
Technische Basis: ${techSignals}

ABGERUFENE SEITENINHALTE (Startseite, Impressum, Unternehmen, Leistungen, Karriere):
${pageDump}

SCHRITT 1: ENTSCHEIDER & ANSCHRIFT AUS IMPRESSUM EXTRAHIEREN
- Lies den Impressum-/Unternehmens-Text sehr genau!
- Extrahiere den vollständigen Namen des Geschäftsführers, Inhabers, Praxisinhabers oder Kanzleiinhabers (z. B. "Thomas Mihm", "Cornelia Funk", "Dr. med. Bernd Mansel"). Falls es mehrere sind, nenne sie mit Komma getrennt. Falls wirklich niemand genannt ist, lass "decisionMaker" leer.
- Bestimme "salutationGender": "herr" (ein männlicher Empfänger), "frau" (eine weibliche Empfängerin), "mehrere" (mehrere Personen -> Anrede "Sehr geehrte Damen und Herren,"), oder "unbekannt".
- Extrahiere aus dem Impressum die saubere Postanschrift im Format "Straße Hausnummer, PLZ Ort" (OHNE Firmennamen!).

SCHRITT 2: QUALIFIKATIONSHÜRDE (ALLE 5 BEDINGUNGEN PRÜFEN!)
1. Ist die Website im Gesamteindruck klar und substanziell relaunch-bedürftig?
   - AUSSCHLUSS: Konzerne, Filialketten, große Online-Shops/Großhandel (z. B. BTI, Würth), Betriebe ab ~100 Beschäftigten, Kleinstbetriebe ohne Budget, oder bereits moderne, aktuelle, professionell strukturierte Websites -> qualified: false!
   - Frage dich ehrlich: "Würde ich dem Geschäftsführer aus geschäftlicher Sicht ernsthaft empfehlen, diese Website vollständig zu ersetzen?" Wenn nicht eindeutig Ja -> qualified: false!
2. Mindestens 2 voneinander unabhängige, geschäftlich relevante HARTE Website-Signale im sichtbaren Text:
   - ZULÄSSIG: seit >=2 Jahren stehengebliebene geschäftliche Inhalte (z. B. alte News/Termine/Corona/Geschäftsjahr 2014–2023), sichtbare Platzhalter/Testtexte/Fehlerhinweise ("{{...}}", "Dieser Browser wird nicht unterstützt", "Lorem ipsum", defekte Seiten), widersprüchliche Kontaktdaten/Leistungen, defekter Anfrage-/Bewerbungsweg, oder fehlende Leistungen/überholte Struktur.
   - VERBOTEN als Hauptbefund in Brief/Mail: Reine Technik-/DOM-Meldungen wie "Kein Mobile-Viewport-Meta-Tag gefunden", ".php-URL", "Meta-Description fehlt", "altes Copyright-Jahr im Footer allein", "allgemeines Kontaktformular", isolierte Zähler ("0", "0%", "0123456789"). Schreibe solche technischen Begriffe NIEMALS in den Brief oder die E-Mail!
3. Mindestens 1 starkes (mehrere Standorte, Expansion, aktive Kampagnen, hochpreisige Leistungen + etablierter Betrieb) ODER 2 moderate Kaufsignale (aktuelle Stellenangebote, starke lokale Position, erklärungsbedürftige Leistungen, Website wichtig für Anfragen/Bewerbungen) öffentlich belegt.
4. Wirtschaftlicher Nutzen eines vollständigen Relaunchs im mittleren vierstelligen Bereich plausibel.
5. Für jeden Befund ein exaktes wörtliches Zitat aus dem obigen Text und die konkrete Quell-URL.

SCORE-REGEL:
- "heiss": >=2 starke harte Signale + >=1 starkes oder 2 moderate Kaufsignale + klarer Nutzen + namentlicher Entscheider UND vollständige Postanschrift vorhanden -> contactChannel: "brief"
- "warm": >=2 harte Signale + wirtschaftliche Passung, aber Entscheider, Adresse oder Kaufsignal schwächer -> contactChannel: "email" (wenn E-Mail vorhanden, sonst "brief")
- "kalt": qualified: false!

SCHRITT 3: FORMELLE E-MAIL & BRIEFFASSUNG (NUR WENN qualified=true)
- Anrede: "Sehr geehrter Herr [Nachname]," oder "Sehr geehrte Frau [Nachname]," (bei Dr. inkl. "Dr. [Nachname]"), sonst "Sehr geehrte Damen und Herren,". Nach dem Komma geht der erste Satz klein weiter ("ich bin ..."). Kein "Guten Tag"!
- Betreff: Konkret und sachlich, z. B. "Neuer Internetauftritt für [Unternehmen]" oder "Neue Website für [Praxisname]". Nicht "Ihre Website" oder "Kurze Frage".
- Ton: Höflich, formell, direkt, erfahren. KEIN Lob ("tolle Stärke", "beeindruckend"), KEIN Nacherzählen der Firmengeschichte/Gründungsjahr, KEINE Belehrung, KEINE Gedankenstriche ("—" oder " – ") zur Satztrennung, KEINE Erwähnung von Anlagen, Screenshots oder technischen Tags ("Viewport", "HTML", "Meta-Tag")!
- E-Mail-Pitch (max. 140 Wörter ohne Anrede/Signatur, genau 3 kurze Absätze):
  1. "ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen." + stärkster harter Befund mit wörtlichem Zitat + 1 Satz geschäftliche Bedeutung für Kunden/Patienten/Bewerber (+ optional 2. Befund in 1 Satz).
  2. "Mit Linkify baue ich Websites komplett neu, von der Gestaltung bis zur Technik, und bin dabei selbst Ihr Ansprechpartner unter www.Linkify.tech." + 1 konkreter Satz, was die neue Seite für genau dieses Unternehmen leisten würde.
  3. Angebot kostenloses Video von etwa fünf Minuten + "Eine kurze Antwort auf diese Mail genügt."
- Brieffassung (max. 150 Wörter ohne Anrede/Grußformel, genau 3 kurze Absätze):
  Gleicher direkter Aufbau und Ton wie die E-Mail; Absatz 1 beginnt mit "ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen.", im 3. Absatz info@linkify.tech und +49 155 63477504 als Antwortweg nennen.

Gib deine Antwort exakt als valides JSON ohne Markdown-Codeblock zurück:
{
  "qualified": true | false,
  "rejectionReason": "Nur ausfüllen wenn qualified=false",
  "decisionMaker": "Vollständiger Name des Geschäftsführers/Inhabers oder leer",
  "salutationGender": "herr" | "frau" | "mehrere" | "unbekannt",
  "postalAddress": "Straße Hausnummer, PLZ Ort (ohne Firmenname) oder leer",
  "contactEmail": "Öffentliche geschäftliche E-Mail oder leer",
  "contactPhone": "Öffentliche geschäftliche Telefonnummer oder leer",
  "score": "heiss" | "warm",
  "contactChannel": "brief" | "email",
  "kurzprofil": "3-4 präzise Sätze zu Unternehmen, Standort, Angebot, Team/Größe und konkretem Kaufsignal.",
  "relaunchBenefit": "Ein Satz aus Sicht des Unternehmens zum geschäftlichen Nutzen eines Relaunchs.",
  "scoreReason": "Ein Satz Begründung für Heiß oder Warm.",
  "hardSignals": [
    {
      "title": "Kurztitel des Befunds",
      "evidence": "Sachliche Beobachtung für normale Besuchende",
      "quote": "Exaktes wörtliches Zitat aus dem Text oben",
      "sourceUrl": "Exakte URL aus den abgerufenen Seiten",
      "verification": "Warum es sichtbarer Endzustand und kein Artefakt ist",
      "businessImpact": "Bedeutung für Kunden, Patienten oder Bewerber",
      "category": "technik" | "mobile" | "vertrauen" | "ux",
      "severity": "hoch" | "mittel"
    }
  ],
  "buyingSignals": [
    {
      "strength": "stark" | "moderat",
      "signal": "Bezeichnung des Kaufsignals",
      "evidence": "Konkreter Beleg",
      "quote": "Kurzes wörtliches Zitat falls vorhanden",
      "sourceUrl": "Exakte Quell-URL"
    }
  ],
  "followUpNote": "Sinnvollste Ansprechperson, natürlicher Einstiegssatz nach 8-10 Tagen und stärkstes geschäftliches Argument in einem Satz.",
  "emailSubject": "Neuer Internetauftritt für ...",
  "emailBody": "Sehr geehrte(r) ...,\n\nich bin selbstständiger Webdesigner aus Erfurt...",
  "letterSubject": "Neuer Internetauftritt für ...",
  "letterBody": "Sehr geehrte(r) ...,\n\nich bin selbstständiger Webdesigner aus Erfurt..."
}`;
}

export function buildFormalSalutation(
  decisionMaker: string,
  genderHint?: string,
): string {
  const dm = decisionMaker.trim();
  if (!dm || dm === "[ANSPRECHPARTNER]" || genderHint === "mehrere") {
    return "Sehr geehrte Damen und Herren,";
  }

  // Handle multiple persons separated by ; or " und "
  if (/[;]|\s+und\s+/i.test(dm)) {
    return "Sehr geehrte Damen und Herren,";
  }

  const firstPerson = dm.split(",")[0].trim();
  const parts = firstPerson.split(/\s+/).filter(Boolean);
  const lastName = parts[parts.length - 1]?.replace(/,$/, "") ?? "";
  if (!lastName || lastName.length < 2) {
    return "Sehr geehrte Damen und Herren,";
  }

  const lower = firstPerson.toLowerCase();
  const titlePrefix = /\bdr\./i.test(firstPerson) ? "Dr. " : "";

  if (
    genderHint === "frau" ||
    /^frau\b/.test(lower) ||
    /\b(anna|anne|bianca|cornelia|katrin|michaela|peggy|silke|barby|sandra|sabine|julia|laura|katharina|petra|susanne|claudia|andrea|martina|stefanie|christina|monika|heike|anja|birgit|ute|kerstin|nicole|jana|daniela|manuela)\b/i.test(
      lower,
    )
  ) {
    return `Sehr geehrte Frau ${titlePrefix}${lastName},`;
  }
  if (
    genderHint === "herr" ||
    /^herr\b/.test(lower) ||
    /\b(thomas|stefan|ulrich|stephan|rolf-martin|carsten|andreas|sven|tobias|frank|ingo|wolfram|heiko|alexander|jürgen|danny|bernd|ferenc|kuno|jan|hans-joachim|martin|michael|markus|christian|matthias|sebastian|daniel|peter|klaus|jörg|uwe|dirk|ralf|holger|torsten|jens|roland|wolfgang|rainer|dieter|bernhard|lars|marco|rené|rene|maik|steffen|ronny|rico)\b/i.test(
      lower,
    )
  ) {
    return `Sehr geehrter Herr ${titlePrefix}${lastName},`;
  }

  return "Sehr geehrte Damen und Herren,";
}

export function normalizeFormalText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/^Guten Tag[^,\n]*,/im, "")
    .trim();
}

export function ensureEmailSignature(
  body: string,
  brand: BrandProfile,
): string {
  const cleaned = normalizeFormalText(body)
    .replace(/Mit freundlichen Grüßen[\s\S]*$/i, "")
    .trim();

  const phone = brand.phone_mobile || "+49 155 63477504";
  const email = brand.contact_email || "info@linkify.tech";
  const web = brand.website_url
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  const signature = `Mit freundlichen Grüßen

${brand.owner_name}
Linkify · Webentwicklung & Webdesign
Web: ${web.startsWith("www.") ? web : `www.${web}`}
E-Mail: ${email}
Telefon: ${phone}`;

  return `${cleaned}\n\n${signature}`;
}

export function ensureLetterClosing(
  body: string,
  brand: BrandProfile,
): string {
  const cleaned = normalizeFormalText(body)
    .replace(/Mit freundlichen Grüßen[\s\S]*$/i, "")
    .trim();

  return `${cleaned}\n\nMit freundlichen Grüßen\n\n${brand.owner_name}`;
}

export interface ParsedNotionQualification {
  qualified: boolean;
  rejectionReason: string;
  decisionMaker: string;
  salutationGender: "herr" | "frau" | "mehrere" | "unbekannt";
  postalAddress: string;
  contactEmail: string;
  contactPhone: string;
  score: LeadPriority;
  contactChannel: "brief" | "email";
  kurzprofil: string;
  relaunchBenefit: string;
  scoreReason: string;
  findings: LeadFinding[];
  buyingSignals: BuyingSignal[];
  followUpNote: string;
  emailSubject: string;
  emailBody: string;
  letterSubject: string;
  letterBody: string;
}

export function parseAndValidateNotionOutput(params: {
  rawJsonText: string;
  lead: Lead;
  brand: BrandProfile;
}): ParsedNotionQualification | null {
  const { rawJsonText, lead, brand } = params;
  const cleaned = rawJsonText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let data: Record<string, unknown>;
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const slice =
      start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    data = JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }

  const qualified = Boolean(data.qualified);
  const rejectionReason = String(data.rejectionReason ?? "").trim();

  const aiDecisionMaker = String(data.decisionMaker ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const finalDecisionMaker = aiDecisionMaker || lead.decision_maker;

  const rawGender = String(data.salutationGender ?? "unbekannt").toLowerCase();
  const salutationGender: ParsedNotionQualification["salutationGender"] =
    rawGender === "herr" ||
    rawGender === "frau" ||
    rawGender === "mehrere"
      ? rawGender
      : "unbekannt";

  const aiAddress = String(data.postalAddress ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const finalPostalAddress = aiAddress || lead.postal_address;

  const aiEmail = String(data.contactEmail ?? "")
    .trim()
    .slice(0, 140);
  const finalEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aiEmail) ? aiEmail : lead.contact_email;

  const aiPhone = String(data.contactPhone ?? "")
    .trim()
    .slice(0, 50);
  const finalPhone = aiPhone || lead.contact_phone;

  const rawFindings = Array.isArray(data.hardSignals) ? data.hardSignals : [];
  const findings: LeadFinding[] = rawFindings
    .slice(0, 6)
    .map((item) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      const quote = String(rec.quote ?? "").trim().slice(0, 260);
      const sourceUrl = String(rec.sourceUrl ?? lead.website_url).trim();
      return {
        category: (["technik", "mobile", "vertrauen", "ux"].includes(
          String(rec.category),
        )
          ? String(rec.category)
          : "ux") as LeadFinding["category"],
        severity: (String(rec.severity) === "hoch"
          ? "hoch"
          : "mittel") as LeadFinding["severity"],
        title: String(rec.title ?? "").trim().slice(0, 160),
        evidence: String(rec.evidence ?? "").trim().slice(0, 400),
        quote,
        sourceUrl,
        verification: String(rec.verification ?? "").trim().slice(0, 300),
        businessImpact: String(rec.businessImpact ?? "").trim().slice(0, 320),
        verified: Boolean(quote && sourceUrl),
      };
    })
    .filter((f) => f.title && (f.quote || f.evidence));

  const rawBuying = Array.isArray(data.buyingSignals) ? data.buyingSignals : [];
  const buyingSignals: BuyingSignal[] = rawBuying
    .slice(0, 5)
    .map((item) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      return {
        strength: (String(rec.strength) === "stark"
          ? "stark"
          : "moderat") as BuyingSignal["strength"],
        signal: String(rec.signal ?? "").trim().slice(0, 140),
        evidence: String(rec.evidence ?? "").trim().slice(0, 360),
        quote: String(rec.quote ?? "").trim().slice(0, 220),
        sourceUrl: String(rec.sourceUrl ?? lead.website_url).trim(),
      };
    })
    .filter((b) => b.signal && b.evidence);

  // Enforce strict 5-condition hurdle
  const hasEnoughBuyingSignals =
    buyingSignals.some((b) => b.strength === "stark") ||
    buyingSignals.filter((b) => b.strength === "moderat").length >= 2;

  if (!qualified || findings.length < 2 || !hasEnoughBuyingSignals) {
    return {
      qualified: false,
      rejectionReason:
        rejectionReason ||
        "Qualifikationshürde nicht erfüllt (mind. 2 unabhängige harte Website-Signale + belegtes Kaufsignal erforderlich).",
      decisionMaker: finalDecisionMaker,
      salutationGender,
      postalAddress: finalPostalAddress,
      contactEmail: finalEmail,
      contactPhone: finalPhone,
      score: "kalt",
      contactChannel: "email",
      kurzprofil: "",
      relaunchBenefit: "",
      scoreReason: "",
      findings,
      buyingSignals,
      followUpNote: "",
      emailSubject: "",
      emailBody: "",
      letterSubject: "",
      letterBody: "",
    };
  }

  const hasNamedDecisionMaker = finalDecisionMaker.length >= 4;
  const hasFullPostal = finalPostalAddress.length >= 8;

  const requestedScore = String(data.score ?? "warm").toLowerCase();
  const score: LeadPriority =
    requestedScore === "heiss" && hasNamedDecisionMaker && hasFullPostal
      ? "heiss"
      : "warm";

  const contactChannel: "brief" | "email" =
    score === "heiss"
      ? "brief"
      : finalEmail
        ? "email"
        : hasFullPostal
          ? "brief"
          : "email";

  const salutation = buildFormalSalutation(
    finalDecisionMaker,
    salutationGender,
  );

  let emailBody = String(data.emailBody ?? "").trim();
  if (!/^sehr geehrte/i.test(emailBody)) {
    emailBody = `${salutation}\n\n${emailBody}`;
  }
  emailBody = ensureEmailSignature(emailBody, brand);

  let letterBody = String(data.letterBody ?? "").trim();
  if (!/^sehr geehrte/i.test(letterBody)) {
    letterBody = `${salutation}\n\n${letterBody}`;
  }
  letterBody = ensureLetterClosing(letterBody, brand);

  const defaultSubject = `Neuer Internetauftritt für ${lead.company_name}`;
  const emailSubject =
    String(data.emailSubject ?? "").trim().slice(0, 140) || defaultSubject;
  const letterSubject =
    String(data.letterSubject ?? "").trim().slice(0, 140) || defaultSubject;

  return {
    qualified: true,
    rejectionReason: "",
    decisionMaker: finalDecisionMaker,
    salutationGender,
    postalAddress: finalPostalAddress,
    contactEmail: finalEmail,
    contactPhone: finalPhone,
    score,
    contactChannel,
    kurzprofil: String(data.kurzprofil ?? "").trim().slice(0, 1200),
    relaunchBenefit: String(data.relaunchBenefit ?? "").trim().slice(0, 500),
    scoreReason: String(data.scoreReason ?? "").trim().slice(0, 450),
    findings,
    buyingSignals,
    followUpNote: String(data.followUpNote ?? "").trim().slice(0, 600),
    emailSubject,
    emailBody,
    letterSubject,
    letterBody,
  };
}

function summarizeLeadFacts(lead: Lead): string {
  const findingsText =
    lead.findings.length > 0
      ? lead.findings
          .map(
            (f) =>
              `- [${f.severity.toUpperCase()}] ${f.title}${f.quote ? ` (Zitat: "${f.quote}")` : ""} (Quelle: ${f.sourceUrl || lead.website_url})`,
          )
          .join("\n")
      : "- Noch keine automatisierten technischen Befunde gespeichert.";

  return `UNTERNEHMEN: ${lead.company_name}
Branche: ${lead.industry || "unbekannt"}
Region/Ort: ${lead.city || "Deutschland"}
Website: ${lead.website_url || "keine hinterlegt"}
Ansprechpartner: ${lead.decision_maker || "[ANSPRECHPARTNER]"}
Kurzprofil: ${lead.research_summary || "keines"}

BEFUNDE:
${findingsText}`;
}

export function buildQualificationPrompt(lead: Lead): string {
  return `Analysiere den folgenden Lead sachlich und strukturiert für Linkify.
Gib deine Antwort exakt als valides JSON ohne Markdown-Codeblock zurück:
{
  "priority": "heiss" | "warm" | "kalt",
  "targetTrack": "kmu" | "startup",
  "researchSummary": "3 präzise Sätze zur Ausgangslage des Unternehmens, rein auf Basis der vorliegenden Signale.",
  "pitchAngle": "1-2 konkrete Sätze, welches Linkify-Angebot hier den höchsten Nutzen stiftet.",
  "recommendedChannel": "brief" | "email",
  "nextVisualCheckHints": ["Konkreter Punkt 1 für die visuelle Prüfung Desktop/Mobil", "Punkt 2"]
}

LEAD-DATEN:
${summarizeLeadFacts(lead)}`;
}

export function buildOutreachPrompt(params: {
  brand: BrandProfile;
  lead: Lead;
  channel: OutreachChannel;
  extraContext?: string;
}): string {
  const { lead, channel, extraContext, brand } = params;
  const salutation = buildFormalSalutation(lead.decision_maker);
  const channelInstructions: Record<OutreachChannel, string> = {
    email: `Erstelle eine formelle, direkte E-Mail nach den Linkify-Pitch-Regeln für ${lead.company_name}.
Anrede: ${salutation}
KEIN Lob, KEINE Firmengeschichte, KEINE Gedankenstriche zur Satztrennung, KEINE Anlagen-Hinweise.
Format:
BETREFF: Neuer Internetauftritt für ${lead.company_name}
---
${salutation}

ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen. <stärkster harter Befund mit Zitat + Bedeutung>

Mit Linkify baue ich Websites komplett neu, von der Gestaltung bis zur Technik, und bin dabei selbst Ihr Ansprechpartner unter www.Linkify.tech. <1 Satz Nutzen für dieses Unternehmen>

<Angebot kostenloses 5-Minuten-Video + Eine kurze Antwort auf diese Mail genügt.>`,
    brief: `Erstelle eine druckfertige formelle Brieffassung (max. 150 Wörter, genau 3 Absätze, KEIN Lob, KEINE Gedankenstriche, KEINE Anlagen-Hinweise) für ${lead.company_name}.
Format:
BETREFF: Neuer Internetauftritt für ${lead.company_name}
---
${salutation}

ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen. <stärkster harter Befund mit Zitat + Bedeutung>

Mit Linkify baue ich Websites komplett neu, von der Gestaltung bis zur Technik, und bin dabei selbst Ihr Ansprechpartner unter www.Linkify.tech. <1 Satz Nutzen>

<Angebot kostenloses 5-Minuten-Video + info@linkify.tech und ${brand.phone_mobile || "+49 155 63477504"} als Antwortweg nennen>`,
    video_audit: `Erstelle ein strukturiertes 5-Minuten-Video-Audit-Skript für ${brand.owner_name} zu ${lead.company_name}.
Format:
BETREFF: Video-Audit-Leitfaden für ${lead.company_name}
---
1. Einstieg (30s): Kurze Begrüßung und konkreter Anlass
2. Beobachtung auf der aktuellen Website (2 Min.): Verifizierte harte Befunde am Live-Beispiel
3. Zielbild (2 Min.): Wie eine neue Struktur auf www.Linkify.tech-Niveau aussieht
4. Ruhiger Abschluss (30s): Nächster Schritt ohne Druck`,
    follow_up: `Erstelle ein höfliches, kurzes Follow-up (max. 90 Wörter) nach 8-10 Tagen auf das vorherige Schreiben.
Format:
BETREFF: Neuer Internetauftritt für ${lead.company_name}
---
${salutation}

<Kurzer natürlicher Bezug auf das vorherige Schreiben und stärkstes geschäftliches Argument>`,
    reply_draft: `Der Interessent (${lead.company_name}) hat geantwortet. Entwirf eine sachliche, formelle Antwort.
Format:
BETREFF: Re: Neuer Internetauftritt für ${lead.company_name}
---
${salutation}

<Antwortentwurf>

EINGANGSNACHRICHT:
${extraContext || "Interessent fragt nach Ablauf und Aufwand."}`,
    angebot_outline: `Erstelle eine unverbindliche Scope-Gliederung für ${lead.company_name}.
Format:
BETREFF: Projekt-Gliederung: ${lead.company_name}
---
<Strukturierter Scope-Entwurf>`,
  };

  return `${channelInstructions[channel]}

${extraContext && channel !== "reply_draft" ? `ZUSÄTZLICHER KONTEXT:\n${extraContext}\n` : ""}
LEAD-DATEN:
${summarizeLeadFacts(lead)}`;
}

export function buildContentPrompt(params: {
  brand: BrandProfile;
  format: ContentFormat;
  targetTrack: TargetTrack;
  sourceBasis: string;
  userTopic: string;
}): string {
  const formatGuide: Record<ContentFormat, string> = {
    linkedin:
      "LinkedIn-Beitrag (ca. 140–220 Wörter): Ruhiger, persönlicher Erfahrungsbericht in Ich-Form. Keine Emojis.",
    website_insight:
      "Website-Insight / Fachbeitrag (ca. 250–380 Wörter): Klar gegliedert für linkify.tech.",
    case_study:
      "Referenz-Story (ca. 180–260 Wörter): Ausschließlich verifizierte Fakten.",
    outreach_hook:
      "Gesprächs- & Akquise-Aufhänger (3 kurze Varianten à 2–3 Sätze).",
  };

  return `Erstelle einen Content-Entwurf im Format "${params.format}" für "${params.targetTrack === "startup" ? "Startups & Produktteams" : "Lokale Unternehmen & KMU"}".
FORMAT: ${formatGuide[params.format]}
BASIS: ${params.sourceBasis}
THEMA: ${params.userTopic}

Gib das Ergebnis exakt als valides JSON ohne Markdown-Codeblock zurück:
{
  "title": "Prägnante Überschrift",
  "body": "Der vollständige Text",
  "verificationNotes": ["Prüfpunkte vor Veröffentlichung"]
}`;
}

export function buildFallbackOutreach(params: {
  brand: BrandProfile;
  lead: Lead;
  channel: OutreachChannel;
  extraContext?: string;
}): { subject: string; body: string } {
  const { brand, lead, channel, extraContext } = params;
  const salutation = buildFormalSalutation(lead.decision_maker);
  const firstFinding = lead.findings.find(
    (f) =>
      f.quote ||
      !/viewport|meta-tag|response|status/i.test(f.title),
  );
  const findingSentence = firstFinding?.quote
    ? `Auf Ihrer Website steht sichtbar „${firstFinding.quote}“ (${firstFinding.title}).`
    : firstFinding?.title
      ? `Bei der Durchsicht Ihrer Website fiel auf, dass zentrale Inhalte für Kunden und Bewerber aktuell nicht klar strukturiert sind (${firstFinding.title}).`
      : "Auf Ihrer Website sind wichtige Leistungs- und Kontaktinformationen für Interessenten und Bewerber aktuell nicht klar geführt.";

  const phone = brand.phone_mobile || "+49 155 63477504";
  const email = brand.contact_email || "info@linkify.tech";

  if (channel === "brief") {
    const body = `${salutation}

ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen. ${findingSentence} Für Kunden und Bewerber entsteht dadurch unnötige Reibung im ersten Eindruck.

Mit Linkify baue ich Websites komplett neu, von der Gestaltung bis zur Technik, und bin dabei selbst Ihr Ansprechpartner unter www.Linkify.tech. Für ${lead.company_name} würde ein klar strukturierter Neuaufbau Ihre Leistungen und den direkten Kontaktweg sauber bündeln.

Gern erstelle ich Ihnen dazu kostenlos ein Video von etwa fünf Minuten, das konkrete Ansätze für einen neuen Auftritt zeigt. Für eine kurze Rückmeldung erreichen Sie mich unter ${email} oder ${phone}.`;

    return {
      subject: `Neuer Internetauftritt für ${lead.company_name}`,
      body: ensureLetterClosing(body, brand),
    };
  }

  if (channel === "follow_up") {
    const body = `${salutation}

ich hatte Ihnen vor einigen Tagen zu einem möglichen neuen Internetauftritt für ${lead.company_name} geschrieben. Falls das Thema aktuell passt, schicke ich Ihnen gern unverbindlich das kurze Fünf-Minuten-Video mit konkreten Vorschlägen.`;
    return {
      subject: `Neuer Internetauftritt für ${lead.company_name}`,
      body: ensureEmailSignature(body, brand),
    };
  }

  if (channel === "video_audit") {
    return {
      subject: `Video-Audit-Leitfaden für ${lead.company_name}`,
      body: `1. Einstieg (30s)\n${salutation} kurzer Bezug auf die aktuelle Website von ${lead.company_name}.\n\n2. Konkrete Beobachtung (2 Min.)\n${findingSentence}\n\n3. Zielbild (2 Min.)\nKlare Leistungsstruktur, direkte Bewerbungs- und Anfrageführung über www.Linkify.tech.\n\n4. Abschluss (30s)\nEinladung zur kurzen Rückmeldung per E-Mail (${email}) oder Telefon (${phone}).`,
    };
  }

  if (channel === "reply_draft") {
    const body = `${salutation}

vielen Dank für Ihre Rückmeldung.${extraContext ? ` Zu Ihrer Frage: ${extraContext.slice(0, 120)}.` : ""} In einem kurzen Gespräch von etwa 15 Minuten klären wir zuerst Zielsetzung, Umfang und Prioritäten, bevor ich Ihnen ein konkretes Angebot erstelle.`;
    return {
      subject: `Re: Neuer Internetauftritt für ${lead.company_name}`,
      body: ensureEmailSignature(body, brand),
    };
  }

  if (channel === "angebot_outline") {
    return {
      subject: `Projekt-Gliederung: ${lead.company_name}`,
      body: `Projektvorschlag für ${lead.company_name}\n\n1. Zielsetzung\n${lead.relaunch_benefit || lead.research_summary}\n\n2. Ablauf\nErstgespräch, verbindlicher Scope, Gestaltung und Umsetzung, Abnahme und dokumentierte Übergabe.`,
    };
  }

  const body = `${salutation}

ich bin selbstständiger Webdesigner aus Erfurt und habe mir Ihre Website angesehen. ${findingSentence} Wer sich informieren oder bewerben möchte, findet dadurch nicht sofort den passenden Einstieg.

Mit Linkify baue ich Websites komplett neu, von der Gestaltung bis zur Technik, und bin dabei selbst Ihr Ansprechpartner unter www.Linkify.tech. Eine neue Seite für ${lead.company_name} würde Ihre Leistungen und Kontaktwege übersichtlich aufbauen.

Gern zeige ich Ihnen in einem kostenlosen Video von etwa fünf Minuten, wie ein neuer Auftritt konkret aussehen könnte. Eine kurze Antwort auf diese Mail genügt.`;

  return {
    subject: `Neuer Internetauftritt für ${lead.company_name}`,
    body: ensureEmailSignature(body, brand),
  };
}
