import type {
  BrandProfile,
  BudgetConfig,
  ContentPost,
  CoreService,
  Lead,
  OpenRouterConfig,
  PricingBenchmark,
  VerifiedReference,
  WeeklyTargets,
} from "./types";

export const DEFAULT_CORE_SERVICES: CoreService[] = [
  {
    id: "websites",
    name: "Websites & Webdesign",
    description:
      "Neue Unternehmenswebsites, Landingpages und vollständige Relaunches mit klarer Struktur und moderner Ästhetik.",
    stackHint: "Webflow, WordPress oder passendes CMS",
  },
  {
    id: "ux",
    name: "Konzeption & UX",
    description:
      "Zielgruppenanalyse, Seitenstruktur, Nutzerführung, Wireframes und interaktive Prototypen.",
    stackHint: "Figma",
  },
  {
    id: "webapps",
    name: "Web-App-Entwicklung",
    description:
      "Individuelle Anwendungen, Plattformen, Kundenportale, Dashboards, Rollenverwaltung, Payment und APIs.",
    stackHint: "Next.js, React, Node.js",
  },
  {
    id: "automation",
    name: "Technik & Automatisierung",
    description:
      "API-Integrationen, maßgeschneiderte interne Werkzeuge, Datenschnittstellen und Workflow-Automatisierung.",
    stackHint: "APIs, Webhooks, Custom Backend",
  },
  {
    id: "waas",
    name: "Weiterentwicklung & Betreuung",
    description:
      "Bestehende Anwendungen verbessern, Performance und Local SEO optimieren, Hosting, Updates und dokumentierte Übergabe.",
    stackHint: "Monitoring, PageSpeed, Wartung",
  },
];

export const DEFAULT_EXCLUDED_SERVICES: string[] = [
  "Standard-Online-Shops / reiner E-Commerce-Massenvertrieb",
  "Dauerhaftes Social-Media-Management",
  "Beliebige Marketing-Komplettpakete ohne klaren Produkt- oder Web-Fokus",
  "Hinweis: E-Mail-Marketing / Newsletter vor Aufnahme ins feste Portfolio manuell abgleichen",
];

export const DEFAULT_VERIFIED_REFERENCES: VerifiedReference[] = [
  {
    id: "foerderkraft",
    clientName: "Förderkraft GmbH",
    type: "Unternehmenswebsite & digitales Onboarding",
    summary:
      "Neukonzeption und Umsetzung des Webauftritts in Webflow mit Fokus auf klare Leistungsdarstellung, Vertrauen, mobile Nutzung und einfache CMS-Pflege.",
    highlights: [
      "Webflow-Relaunch mit strukturierter Leistungsführung",
      "Optimiert für mobile Endgeräte und eigenständige Pflege",
      "Ergänzendes digitales Onboarding-Werkzeug für Partner",
    ],
    publiclyListed: true,
  },
  {
    id: "skabe",
    clientName: "Skabe GbR",
    type: "Fullstack-Weiterentwicklung UGC-Plattform",
    summary:
      "Mehrphasige Produkt- und Fullstack-Entwicklung einer Plattform für Creator und Unternehmen bis zur dokumentierten Übergabe.",
    highlights: [
      "Buchungs- und Auftragsprozesse mit Creator- und Unternehmensansichten",
      "Chat, Benachrichtigungen, Admin-Dashboard und Stripe-Zahlungsabwicklung",
      "UX/UI-Überarbeitung, Mobile-Optimierung, Mehrsprachigkeit, Testing & Monitoring",
    ],
    publiclyListed: true,
  },
];

export const DEFAULT_DISCOVERY_QUESTIONS: string[] = [
  "Was existiert aktuell bereits und wo liegt das eigentliche geschäftliche Problem?",
  "Was soll das Projekt konkret erreichen (mehr Anfragen, Bewerbungen, Prozessentlastung oder neues Produkt)?",
  "Wer ist die Hauptzielgruppe und welche Handlung soll auf der Seite oder in der App stattfinden?",
  "Welche Seiten, Funktionen, Rollen oder Schnittstellen werden wirklich benötigt?",
  "Wer liefert Texte, Bilder, Logos, Zugänge und Freigaben – und bis wann?",
  "Wem gehören Domain, Hosting und bestehende Systeme heute?",
  "Wie soll die Lösung nach Go-live gepflegt, betreut oder übergeben werden?",
  "Welche Datenschutz-, Rollen- oder Reaktionszeitanforderungen gelten?",
];

export const DEFAULT_PRICING_BENCHMARKS: PricingBenchmark[] = [
  {
    id: "base-page",
    label: "Startseite / Landingpage (Richtwert)",
    unit: "Pauschal-Basis",
    amountEur: 0,
    note: "Internen Richtwert in den Einstellungen hinterlegen – vor Versand prüfen.",
    confirmed: false,
  },
  {
    id: "sub-page",
    label: "Weitere Inhaltsseite (einfache Struktur)",
    unit: "pro Seite",
    amountEur: 0,
    note: "Nur interne Rechenhilfe, keine feste Preisliste.",
    confirmed: false,
  },
  {
    id: "hourly-design",
    label: "Webdesign, Pflege & kleine Änderungen",
    unit: "pro Stunde",
    amountEur: 0,
    note: "Internen Stundensatz bei Bedarf ergänzen.",
    confirmed: false,
  },
  {
    id: "hourly-fullstack",
    label: "Fullstack-Entwicklung & API-Integration",
    unit: "pro Stunde",
    amountEur: 0,
    note: "Komplexe Plattformen, Dashboards & Payment gesondert kalkulieren.",
    confirmed: false,
  },
];

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  researchModel: "meta/muse-ember",
  writingModel: "google/gemini-4-hydrogen",
  contentModel: "google/gemini-4-hydrogen",
  privacyMode: true,
  temperature: 0.4,
};

export const DEFAULT_WEEKLY_TARGETS: WeeklyTargets = {
  leadsChecked: 12,
  auditsSent: 5,
  callsBooked: 2,
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  monthlyBudgetEur: 15,
  dailyMaxCalls: 40,
  maxTokensPerCall: 1200,
  batchMaxLeads: 5,
  stopOnLimit: true,
  autoDowngradeAt75Pct: true,
  eurPerUsdRate: 0.92,
};

export function buildDefaultBrandProfile(ownerSub: string): BrandProfile {
  return {
    owner_sub: ownerSub,
    brand_name: "Linkify",
    owner_name: "Luis Schleicherdt",
    city: "Erfurt",
    website_url: "https://linkify.tech",
    contact_email: "info@linkify.tech",
    phone_mobile: "",
    phone_landline: "",
    postal_address: "",
    tax_note:
      "Hinweis: Steuerliche Angaben, Pflichttexte und Angebotskonditionen vor Versand prüfen.",
    positioning_statement:
      "Ich bin Luis und baue digitale Produkte, die funktionieren – von schnellen Unternehmenswebsites bis zu individuellen Web-Apps. Direkte Zusammenarbeit ohne Agentur-Overhead.",
    tone_rules:
      "Persönlich in der Ich-Form, direkt, verständlich, professionell ohne steif zu wirken. Erst freundlicher Bezug zum Unternehmen, dann sachlicher Befund auf Relaunch- oder Produkt-Ebene. Keine erfundenen Zahlen, Referenzen oder leeren Versprechen.",
    core_services: DEFAULT_CORE_SERVICES,
    excluded_services: DEFAULT_EXCLUDED_SERVICES,
    verified_references: DEFAULT_VERIFIED_REFERENCES,
    discovery_questions: DEFAULT_DISCOVERY_QUESTIONS,
    pricing_benchmarks: DEFAULT_PRICING_BENCHMARKS,
    openrouter_config: DEFAULT_OPENROUTER_CONFIG,
    budget_config: DEFAULT_BUDGET_CONFIG,
    weekly_targets: DEFAULT_WEEKLY_TARGETS,
    updated_at: new Date().toISOString(),
  };
}

export function buildSampleLeads(ownerSub: string): Omit<
  Lead,
  "created_at" | "updated_at"
>[] {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();

  return [
    {
      id: `sample-kmu-1-${ownerSub}`,
      owner_sub: ownerSub,
      company_name: "Muster-Sanitärtechnik Erfurt GmbH (Demo)",
      industry: "Handwerk & Gebäudetechnik",
      target_track: "kmu",
      city: "Erfurt",
      postal_address: "Musterstraße 14, 99084 Erfurt",
      website_url: "https://sanitaer-muster.example",
      decision_maker: "Max Mustermann",
      contact_email: "kontakt@sanitaer-muster.example",
      contact_phone: "",
      source: "demo",
      priority: "heiss",
      status: "analysiert",
      contact_channel: "video_audit",
      first_contact_at: null,
      next_follow_up_at: tomorrow,
      visual_checked_desktop: false,
      visual_checked_mobile: false,
      visual_notes: "",
      research_summary:
        "Beispieldatensatz (Demo): Typischer Handwerksbetrieb mit Fachkräftebedarf. Veraltete mobile Darstellung erschwert direkte Kontaktaufnahme und Bewerbungen.",
      findings: [
        {
          category: "mobile",
          severity: "hoch",
          title: "Mobile Nutzerführung stark eingeschränkt (Demo-Befund)",
          evidence:
            "Demo-Analyse: Fehlendes responsives Layout auf Smartphones und versteckte Kontaktmöglichkeit.",
          verified: false,
        },
        {
          category: "ux",
          severity: "mittel",
          title: "Leistungen und Bewerbungsweg nicht klar getrennt",
          evidence:
            "Demo-Analyse: Kundenanfragen und Fachkräfte-Bewerbungen laufen über ein allgemeines Formular.",
          verified: false,
        },
      ],
      scan_data: null,
      pitch_angle:
        "Relaunch mit Fokus auf Vertrauen, klare Leistungsübersicht für Privat-/Gewerbekunden und direkten Bewerbungsweg – statt Reparatur einzelner Unterseiten.",
      is_sample: true,
    },
    {
      id: `sample-kmu-2-${ownerSub}`,
      owner_sub: ownerSub,
      company_name: "Praxis für Physiotherapie Beispiel (Demo)",
      industry: "Gesundheit & Praxis",
      target_track: "kmu",
      city: "Weimar",
      postal_address: "Beispielallee 8, 99423 Weimar",
      website_url: "https://praxis-beispiel.example",
      decision_maker: "Dr. Anna Beispiel",
      contact_email: "praxis@praxis-beispiel.example",
      contact_phone: "",
      source: "demo",
      priority: "warm",
      status: "follow_up_faellig",
      contact_channel: "email",
      first_contact_at: threeDaysAgo,
      next_follow_up_at: yesterday,
      visual_checked_desktop: true,
      visual_checked_mobile: true,
      visual_notes:
        "Startseite wirkt ruhig, aber Öffnungszeiten und Terminhinweis sind mobil erst nach langem Scrollen sichtbar.",
      research_summary:
        "Beispieldatensatz (Demo): Etablierte Praxis mit gutem lokalem Ruf, jedoch ohne klare Termin- und Leistungsstruktur auf mobilen Geräten.",
      findings: [
        {
          category: "vertrauen",
          severity: "mittel",
          title: "Unklare Struktur für Neupatienten (Demo-Befund)",
          evidence:
            "Demo-Analyse: Wichtige Hinweise zu Terminvergabe und Behandlungen sind über mehrere Unterpunkte verstreut.",
          verified: false,
        },
      ],
      scan_data: null,
      pitch_angle:
        "Ruhiger, vertrauenswürdiger Webauftritt mit sofort sichtbarem Termin- und Kontaktbereich sowie einfacher Pflege.",
      is_sample: true,
    },
    {
      id: `sample-startup-1-${ownerSub}`,
      owner_sub: ownerSub,
      company_name: "FlowDock Operations UG (Demo)",
      industry: "B2B SaaS / Logistik-Software",
      target_track: "startup",
      city: "Jena",
      postal_address: "Innovationsring 3, 07745 Jena",
      website_url: "https://flowdock-demo.example",
      decision_maker: "Tobias Gründer",
      contact_email: "team@flowdock-demo.example",
      contact_phone: "",
      source: "demo",
      priority: "heiss",
      status: "neu",
      contact_channel: "email",
      first_contact_at: null,
      next_follow_up_at: null,
      visual_checked_desktop: false,
      visual_checked_mobile: false,
      visual_notes: "",
      research_summary:
        "Beispieldatensatz (Demo): Junges Produktteam sucht technische Umsetzung für Kundenportal mit Rollenverwaltung und Abrechnungs-Workflow.",
      findings: [
        {
          category: "produkt",
          severity: "hoch",
          title: "MVP-Bedarf für Kundenportal & Rollenlogik (Demo-Befund)",
          evidence:
            "Demo-Analyse: Aktuell manuelle Onboarding-Prozesse über Tabellen statt eigenem Dashboard.",
          verified: false,
        },
      ],
      scan_data: null,
      pitch_angle:
        "Direkte Fullstack-Umsetzung (Next.js / APIs / Rollen & Payment) mit Verweis auf Skabe-Plattformarchitektur.",
      is_sample: true,
    },
  ];
}

export function buildSampleContentPosts(
  ownerSub: string,
): Omit<ContentPost, "created_at" | "updated_at">[] {
  return [
    {
      id: `sample-post-1-${ownerSub}`,
      owner_sub: ownerSub,
      title: "Warum viele KMU-Websites an der falschen Stelle gespart wirken (Demo)",
      format: "linkedin",
      target_track: "kmu",
      source_basis: "Förderkraft GmbH & allgemeine Praxisbeobachtung",
      body: `Viele lokale Unternehmen liefern hervorragende Arbeit – aber ihre Website erzählt eine andere Geschichte.

Oft sehe ich auf den ersten Blick:
1. Auf dem Smartphone muss gezoomt oder lange gesucht werden, bis Telefonnummer oder Kontakt sichtbar sind.
2. Leistungen stehen als lange Textwüste statt klarer Struktur für neue Kunden und Bewerber.
3. Jede kleine Änderung kostet unnötig Zeit, weil das System dahinter nie sauber aufgesetzt wurde.

Beim Relaunch für die Förderkraft GmbH stand genau das im Mittelpunkt: eine klare Leistungsdarstellung, Vertrauen auf den ersten Blick und ein Webflow-Setup, das im Alltag unkompliziert gepflegt werden kann.

Eine gute Unternehmenswebsite muss nicht laut sein. Sie muss zur Qualität des Betriebs passen und Anfragen einfach machen.`,
      verification_notes: [
        "Prüfen, ob die Verlinkung zur Case Study auf linkify.tech mit im Kommentar stehen soll.",
      ],
      status: "geprueft",
      model_used: "sample",
      is_sample: true,
    },
  ];
}
