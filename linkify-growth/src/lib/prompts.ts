import type {
  BrandProfile,
  ContentFormat,
  Lead,
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

  return `Du bist der interne Akquise-, Analyse- und Kommunikations-Assistent für "${brand.brand_name}" (Inhaber: ${brand.owner_name}, Standort: ${brand.city}, Website: ${brand.website_url}).

POSITIONIERUNG:
${brand.positioning_statement}

KOMMUNIKATIONSREGELN (STRIKT EINHALTEN):
${brand.tone_rules}
- Schreibe konsequent in der "Ich"-Form aus Sicht von ${brand.owner_name} (${brand.brand_name}), NICHT als künstlich aufgeblasenes "wir sind eine Full-Service-Agentur".
- Erst ein freundlicher, echter Bezug zur Branche/Ausgangslage, dann ein sachlicher Befund.
- Nicht belehrend, nicht überheblich, nicht kleinteilig ("wir fixen einen Button"), sondern klar auf vollständige Neukonzeption/Relaunch oder maßgeschneiderte Web-App ausgerichtet.
- KEINE Emojis, KEINE übertriebenen Marketing-Versprechen, KEINE leeren Buzzwords.
- Platzhalter wie [UNTERNEHMEN], [ANSPRECHPARTNER] oder [WEBSITE_URL] exakt so beibehalten – sie werden erst nach deiner Antwort lokal eingesetzt.

STRIKTES ANTI-HALLUZINATIONS-GEBOT:
- Erfinde NIEMALS Kennzahlen, Conversion-Steigerungen, Besucherzahlen, Testimonials oder nicht belegte Kundenreferenzen.
- Nutze ausschließlich die übergebenen strukturierten Scan-Signale und folgende verifizierte Referenzen:
${refsList}

KERNLEISTUNGEN:
${servicesList}

NICHT IM FOKUS:
${excluded}`;
}

/**
 * Summarizes only technical/structural signals without dumping raw scraped HTML paragraphs (privacy-minimized).
 */
function summarizeLeadFacts(lead: Lead): string {
  const findingsText =
    lead.findings.length > 0
      ? lead.findings
          .map(
            (f) =>
              `- [${f.severity.toUpperCase()}] ${f.title} (Signal: ${f.evidence})`,
          )
          .join("\n")
      : "- Noch keine automatisierten technischen Befunde gespeichert.";

  const scanBlock = lead.scan_data
    ? `Technische Website-Signale (${lead.scan_data.scannedAt.slice(0, 10)}):
  HTTPS aktiv: ${lead.scan_data.httpsEnabled ? "Ja" : "Nein"}
  HTTP Status: ${lead.scan_data.statusCode}, Antwortzeit: ${lead.scan_data.responseTimeMs} ms
  CMS/Stack-Hinweis: ${lead.scan_data.detectedCms}
  Mobile Viewport Tag: ${lead.scan_data.hasViewportMeta ? "Vorhanden" : "Fehlt"}
  Seitentitel-Thema: "${lead.scan_data.title.slice(0, 90)}"
  H1-Fokus: "${lead.scan_data.h1.slice(0, 90)}"
  Copyright-Jahr: ${lead.scan_data.copyrightYear ?? "nicht erkannt"}
  Impressum/Datenschutz: ${lead.scan_data.hasImprintLink ? "Impressum OK" : "Impressum unklar"} / ${lead.scan_data.hasPrivacyLink ? "Datenschutz OK" : "Datenschutz unklar"}
  Recruiting-/Stellen-Signal: ${lead.scan_data.hasHiringSignal ? "Ja" : "Nein"}
  PageSpeed Mobil: ${lead.scan_data.pageSpeed?.performanceScore ?? "nicht gemessen"}`
    : "Kein Live-Website-Scan vorhanden.";

  return `UNTERNEHMEN: ${lead.company_name}
Branche: ${lead.industry || "unbekannt"}
Track: ${lead.target_track === "startup" ? "Startup / Produktteam" : "Lokales Unternehmen / KMU"}
Region/Ort: ${lead.city || "DACH"}
Website: ${lead.website_url || "keine hinterlegt"}
Ansprechpartner: ${lead.decision_maker || "[ANSPRECHPARTNER]"}
Visuelle Prüfung durch Inhaber: Desktop=${lead.visual_checked_desktop ? "Geprüft" : "Offen"}, Mobil=${lead.visual_checked_mobile ? "Geprüft" : "Offen"}
Eigene visuelle Notizen: ${lead.visual_notes || "keine"}

BEFUNDE:
${findingsText}

${scanBlock}`;
}

export function buildQualificationPrompt(lead: Lead): string {
  return `Analysiere den folgenden Lead sachlich und strukturiert für Linkify.
Gib deine Antwort exakt als valides JSON ohne Markdown-Codeblock zurück:
{
  "priority": "heiss" | "warm" | "kalt",
  "targetTrack": "kmu" | "startup",
  "researchSummary": "2-3 präzise Sätze zur Ausgangslage des Unternehmens, rein auf Basis der vorliegenden Signale.",
  "pitchAngle": "1-2 konkrete Sätze, welches Linkify-Angebot (Relaunch, UX-Konzeption oder Web-App/Automatisierung) hier den höchsten Nutzen stiftet.",
  "recommendedChannel": "video_audit" | "email" | "brief",
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
  const channelInstructions: Record<OutreachChannel, string> = {
    email: `Erstelle eine persönliche Erstansprache per E-Mail an ${lead.company_name}.
Format:
BETREFF: <kurzer, unaufgeregter Betreff ohne Clickbait>
---
<E-Mail-Text, max. 140-180 Wörter, Sie-Anrede außer Startup-Kontext legt Du nahe, freundlicher Bezug zu ${lead.company_name}, 1-2 sachliche Beobachtungen mit Ausrichtung auf einen sauberen Relaunch/Neuaufbau, Angebot für ein kurzes 2-Minuten-Video-Audit oder unverbindliches Erstgespräch, Signatur von ${brand.owner_name} (${brand.brand_name}, ${brand.website_url})>`,
    brief: `Erstelle einen druckfertigen persönlichen Anschreiben-Entwurf für einen postalischen Brief (DIN 5008 kompatibler Brieftext) an ${lead.company_name}.
Format:
BETREFF: <klarer sachlicher Betreff>
---
<Brieftext max. 210 Wörter, freundlich, konkret, ohne Floskeln, Fokus auf ganzheitliche Website-Neukonzeption und direkten persönlichen Ansprechpartner in ${brand.city}, Signatur ${brand.owner_name}>`,
    video_audit: `Erstelle ein strukturiertes 90-Sekunden-Video-Audit-Skript (Loom / Bildschirmaufnahme) für ${brand.owner_name} zu ${lead.company_name}.
Format:
BETREFF: Video-Audit-Leitfaden für ${lead.company_name}
---
1. Einstieg (15s): Persönliche Begrüßung und kurzer Bezug zu ${lead.company_name}
2. Live-Beobachtung Desktop & Mobil (45s): Verifizierte Befunde + offene Prüf-Fragen für das Durchklicken
3. Konkretes Zielbild (20s): Wie ein sauberer Relaunch / Produkt-Upgrade bei Linkify aussieht (inkl. passender echter Referenz)
4. Ruhiger Abschluss (10s): Unverbindliche Einladung zum kurzen Austausch`,
    follow_up: `Erstelle ein höfliches, kurzes Follow-up (max. 90 Wörter) nach ausbleibender Rückmeldung auf den Erstkontakt. Kein Druck, kurzer Nutzen-Impuls.
Format:
BETREFF: Kurze Rückfrage zu ${lead.company_name}
---
<Follow-up Text>`,
    reply_draft: `Der Interessent (${lead.company_name}) hat geantwortet oder einen Einwand geschickt. Entwirf eine souveräne, sachliche Antwort in der Ich-Form, die auf die Rückfrage eingeht, erst das Ziel/Problem versteht und passende Erstgesprächs-Fragen einbindet.
Format:
BETREFF: Re: Ihr Projekt bei ${lead.company_name}
---
<Antwortentwurf>

EINGANGSNACHRICHT / KONTEXT DES KUNDEN:
${extraContext || "Interessent fragt nach Ablauf und ungefährem Aufwand."}`,
    angebot_outline: `Erstelle eine strukturierte, unverbindliche Scope- und Angebots-Gliederung für das Erstgespräch oder Angebots-Dokument (keine verbindlichen Festpreise erfinden!).
Nutze Linkifys Standardablauf: Erstgespräch -> Scope & Angebot -> Kick-off & Materialübergabe -> Struktur/Design/Prototyp -> Umsetzung -> Review -> Abnahme & Go-live -> Dokumentierte Übergabe/Betreuung.
Format:
BETREFF: Projekt-Gliederung & Scope-Vorschlag: ${lead.company_name}
---
<Strukturierter Scope-Entwurf inkl. Abgrenzung, Mitwirkungspflichten des Kunden und offenen Klärungspunkten>`,
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
      "LinkedIn-Beitrag (ca. 140–220 Wörter): Ruhiger, persönlicher Erfahrungsbericht in Ich-Form. Konkreter Einstieg aus der Praxis, 2–3 nachvollziehbare Erkenntnisse, klare Kernaussage am Ende. Keine Hashtag-Flut (max. 3 sachliche Hashtags), keine Emojis.",
    website_insight:
      "Website-Insight / Fachbeitrag (ca. 250–380 Wörter): Klar gegliederter Praxisartikel für linkify.tech mit H2-Zwischenüberschriften, starker Nutzenorientierung für Entscheider und ruhigem CTA zum Erstgespräch.",
    case_study:
      "Referenz-Story (ca. 180–260 Wörter): Fokus auf Problem -> methodischer Ansatz -> konkret umgesetzte Lösung. Ausschließlich verifizierte Fakten der gewählten Referenz verwenden, nichts hinzuerfinden.",
    outreach_hook:
      "Gesprächs- & Akquise-Aufhänger (3 kurze Varianten à 2–3 Sätze): Direkt einsetzbar in E-Mails oder Video-Audits für die gewählte Zielgruppe.",
  };

  return `Erstelle einen Content-Entwurf im Format "${params.format}" für die Zielgruppe "${params.targetTrack === "startup" ? "Startups & Produktteams" : "Lokale Unternehmen & KMU"}".

FORMAT-VORGABE:
${formatGuide[params.format]}

VERIFIZIERTE BASIS / REFERENZ:
${params.sourceBasis}

THEMA / EIGENE BEOBACHTUNG:
${params.userTopic}

Gib das Ergebnis exakt als valides JSON ohne Markdown-Codeblock zurück:
{
  "title": "Prägnante Überschrift / Titel",
  "body": "Der vollständige, direkt nutzbare Text",
  "verificationNotes": ["Liste konkreter Punkte, die vor Veröffentlichung manuell geprüft werden sollten (z. B. Kundenfreigabe, Link, konkrete Details)"]
}`;
}

export function buildFallbackOutreach(params: {
  brand: BrandProfile;
  lead: Lead;
  channel: OutreachChannel;
  extraContext?: string;
}): { subject: string; body: string } {
  const { brand, lead, channel, extraContext } = params;
  const greeting =
    lead.decision_maker && lead.decision_maker !== "[ANSPRECHPARTNER]"
      ? `Guten Tag ${lead.decision_maker},`
      : `Guten Tag,`;
  const firstFinding =
    lead.findings[0]?.title ??
    "einige Punkte rund um mobile Nutzerführung und klare Leistungsstruktur";
  const visualHint = lead.visual_notes
    ? ` Bei meiner persönlichen Durchsicht fiel mir zudem auf: ${lead.visual_notes}`
    : "";

  if (channel === "video_audit") {
    return {
      subject: `Video-Audit-Leitfaden: ${lead.company_name}`,
      body: `1. Einstieg (15s)\n${greeting} ich bin ${brand.owner_name} von ${brand.brand_name} in ${brand.city}. Ich habe mir Ihren aktuellen Webauftritt kurz angesehen und ein paar konkrete Gedanken festgehalten.\n\n2. Konkrete Beobachtungen (45s)\n- Ausgangspunkt: ${firstFinding}.${visualHint}\n- Fokus beim Durchklicken: Mobil-Darstellung, Kontaktwege und Verständlichkeit der Leistungen.\n\n3. Zielbild (20s)\nStatt einzelne Stellen zu flicken, hilft hier eine klare Neukonzeption, wie ich sie z. B. bei der Förderkraft GmbH in Webflow umgesetzt habe – ruhig, schnell und leicht pflegbar.\n\n4. Abschluss (10s)\nWenn das für Sie interessant ist, sprechen wir gerne 15 Minuten unverbindlich dazu. (${brand.website_url})`,
    };
  }

  if (channel === "brief") {
    return {
      subject: `Ihr digitaler Auftritt bei ${lead.company_name}`,
      body: `${greeting}\n\nich arbeite als freiberuflicher Fullstack-Entwickler und Webdesigner unter Linkify hier aus ${brand.city} direkt mit Unternehmen aus der Region zusammen – ohne Agentur-Overhead.\n\nBeim Blick auf Ihren aktuellen Auftritt von ${lead.company_name} fiel mir positiv auf, wie klar Ihr Leistungsangebot im Kern aufgestellt ist. Gleichzeitig zeigt die technische Prüfung: ${firstFinding}.${visualHint}\n\nIch bin überzeugt, dass ein sauber neu aufgesetzter Webauftritt deutlich besser zur Qualität Ihrer Arbeit passt und Anfragen wie Bewerbungen spürbar vereinfacht.\n\nGerne nehme ich ein kurzes, unverbindliches 2-Minuten-Video-Audit für Sie auf oder wir tauschen uns in einem kurzen Erstgespräch aus.\n\nFreundliche Grüße\n${brand.owner_name}\n${brand.brand_name} · ${brand.website_url} · ${brand.contact_email}`,
    };
  }

  if (channel === "follow_up") {
    return {
      subject: `Kurze Rückfrage zu ${lead.company_name}`,
      body: `${greeting}\n\nich wollte kurz nachhaken, ob mein Hinweis zu Ihrem Webauftritt (${firstFinding}) bei Ihnen angekommen ist.\n\nFalls das Thema Website-Relaunch aktuell nicht auf Ihrer Prioritätenliste steht, ist das völlig in Ordnung – geben Sie mir gerne kurz Bescheid. Falls Sie Interesse an einer kurzen, unverbindlichen Einschätzung haben, sende ich Ihnen gerne ein 2-Minuten-Video dazu.\n\nViele Grüße\n${brand.owner_name}\n${brand.brand_name} · ${brand.website_url}`,
    };
  }

  if (channel === "reply_draft") {
    return {
      subject: `Re: Zusammenarbeit ${lead.company_name}`,
      body: `${greeting}\n\nvielen Dank für Ihre Rückmeldung.${extraContext ? ` Zu Ihrer Frage ("${extraContext.slice(0, 120)}"):` : ""}\n\nMir ist wichtig, dass wir zuerst genau verstehen, was das Projekt geschäftlich erreichen soll und wo aktuell der größte Engpass liegt, bevor wir über Technik oder konkrete Pakete sprechen.\n\nDafür reichen 15–20 Minuten im kurzen Erstgespräch, um unter anderem zu klären:\n- Was aktuell besteht und welche Ziele im Vordergrund stehen\n- Welche Seiten, Funktionen oder Schnittstellen wirklich nötig sind\n- Wie Texte, Bilder und spätere Pflege am besten gelöst werden\n\nWann passt es Ihnen diese oder nächste Woche für ein kurzes Telefonat oder Video-Gespräch?\n\nViele Grüße\n${brand.owner_name}\n${brand.brand_name} · ${brand.website_url}`,
    };
  }

  if (channel === "angebot_outline") {
    const questions = brand.discovery_questions
      .slice(0, 5)
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n");
    return {
      subject: `Unverbindliche Scope-Gliederung: ${lead.company_name}`,
      body: `Projektvorschlag (Entwurf – vor Versand manuell prüfen)\nKunde: ${lead.company_name} (${lead.target_track === "startup" ? "Produktteam / Startup" : "Unternehmenswebsite / KMU"})\n\n1. Ausgangslage & Zielsetzung\n${lead.research_summary || lead.pitch_angle}\n\n2. Vorgeschlagener Ablauf bei ${brand.brand_name}\n- Erstgespräch & Zielklärung\n- Verbindlicher Scope & Angebot\n- Kick-off & Materialübergabe\n- Struktur, UX & Prototyp (z. B. Figma)\n- Umsetzung & technische Qualitätssicherung\n- Review, Abnahme & dokumentierte Übergabe\n\n3. Offene Klärungspunkte vor Kalkulation\n${questions}\n\nHinweis: Preise, Meilensteine und Betreuungsumfang erst nach Klärung der offenen Fragen verbindlich festlegen.`,
    };
  }

  return {
    subject: `Kurzer Gedanke zum Webauftritt von ${lead.company_name}`,
    body: `${greeting}\n\nich bin ${brand.owner_name}, freiberuflicher Webdesigner und Fullstack-Entwickler aus ${brand.city} (${brand.brand_name}).\n\nBei der Recherche nach passenden Unternehmen aus dem Bereich ${lead.industry || "der Region"} bin ich auf ${lead.company_name} gestoßen. Gleichzeitig ist mir bei der technischen Durchsicht aufgefallen: ${firstFinding}.${visualHint}\n\nStatt einzelne Stellen nachzubessern, lohnt sich in solchen Fällen meist ein ruhiger, sauber strukturierter Relaunch – damit der digitale Auftritt direkt zur Qualität Ihres Betriebs passt.\n\nWenn Sie möchten, nehme ich Ihnen dazu gerne kostenlos und unverbindlich ein 2-Minuten-Video-Audit auf.\n\nViele Grüße\n${brand.owner_name}\n${brand.brand_name} · ${brand.website_url}`,
  };
}
