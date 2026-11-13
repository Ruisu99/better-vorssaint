import type {
  BrandProfile,
  BudgetConfig,
  CoreService,
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
