export type TargetTrack = "kmu" | "startup";
export type LeadPriority = "heiss" | "warm" | "kalt";
export type LeadStatus =
  | "neu"
  | "analysiert"
  | "kontaktiert"
  | "follow_up_faellig"
  | "im_gespraech"
  | "angebot"
  | "gewonnen"
  | "kein_interesse";

export type ContactChannel =
  | "email"
  | "brief"
  | "video_audit"
  | "telefon"
  | "linkedin";

export type OutreachChannel =
  | "email"
  | "brief"
  | "video_audit"
  | "follow_up"
  | "reply_draft"
  | "angebot_outline";

export type OutreachStatus = "entwurf" | "freigegeben" | "gesendet";
export type ContentFormat =
  | "linkedin"
  | "website_insight"
  | "case_study"
  | "outreach_hook";
export type ContentStatus = "entwurf" | "geprueft" | "veroeffentlicht";

export interface CoreService {
  id: string;
  name: string;
  description: string;
  stackHint: string;
}

export interface VerifiedReference {
  id: string;
  clientName: string;
  type: string;
  summary: string;
  highlights: string[];
  publiclyListed: boolean;
}

export interface PricingBenchmark {
  id: string;
  label: string;
  unit: string;
  amountEur: number;
  note: string;
  confirmed: boolean;
}

export interface OpenRouterConfig {
  researchModel: string;
  writingModel: string;
  contentModel: string;
  privacyMode: boolean;
  temperature: number;
}

export interface WeeklyTargets {
  leadsChecked: number;
  auditsSent: number;
  callsBooked: number;
}

export interface BudgetConfig {
  monthlyBudgetEur: number;
  dailyMaxCalls: number;
  maxTokensPerCall: number;
  batchMaxLeads: number;
  stopOnLimit: boolean;
  eurPerUsdRate: number;
}

export interface BrandProfile {
  owner_sub: string;
  brand_name: string;
  owner_name: string;
  city: string;
  website_url: string;
  contact_email: string;
  phone_mobile: string;
  phone_landline: string;
  postal_address: string;
  tax_note: string;
  positioning_statement: string;
  tone_rules: string;
  core_services: CoreService[];
  excluded_services: string[];
  verified_references: VerifiedReference[];
  discovery_questions: string[];
  pricing_benchmarks: PricingBenchmark[];
  openrouter_config: OpenRouterConfig;
  budget_config: BudgetConfig;
  weekly_targets: WeeklyTargets;
  updated_at: string;
}

export interface LeadFinding {
  category: "technik" | "mobile" | "vertrauen" | "ux" | "produkt" | "chance";
  severity: "hoch" | "mittel" | "hinweis";
  title: string;
  evidence: string;
  verified: boolean;
}

export interface LeadScanData {
  scannedAt: string;
  inputUrl: string;
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  httpsEnabled: boolean;
  title: string;
  metaDescription: string;
  h1: string;
  hasViewportMeta: boolean;
  detectedCms: string;
  copyrightYear: number | null;
  hasImprintLink: boolean;
  hasPrivacyLink: boolean;
  hasContactFormOrCta: boolean;
  extractedEmails: string[];
  extractedPhones: string[];
  visibleSummary: string;
  pageSpeed?: {
    strategy: "mobile" | "desktop";
    performanceScore: number | null;
    seoScore: number | null;
    accessibilityScore: number | null;
    lcpText: string | null;
  } | null;
}

export interface Lead {
  id: string;
  owner_sub: string;
  company_name: string;
  industry: string;
  target_track: TargetTrack;
  city: string;
  postal_address: string;
  website_url: string;
  decision_maker: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  priority: LeadPriority;
  status: LeadStatus;
  contact_channel: ContactChannel;
  first_contact_at: string | null;
  next_follow_up_at: string | null;
  visual_checked_desktop: boolean;
  visual_checked_mobile: boolean;
  visual_notes: string;
  research_summary: string;
  findings: LeadFinding[];
  scan_data: LeadScanData | null;
  pitch_angle: string;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutreachItem {
  id: string;
  owner_sub: string;
  lead_id: string;
  channel: OutreachChannel;
  subject: string;
  body: string;
  notes: string;
  status: OutreachStatus;
  model_used: string;
  privacy_masked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentPost {
  id: string;
  owner_sub: string;
  title: string;
  format: ContentFormat;
  target_track: TargetTrack;
  source_basis: string;
  body: string;
  verification_notes: string[];
  status: ContentStatus;
  model_used: string;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiRun {
  id: string;
  owner_sub: string;
  task_type: string;
  model: string;
  provider_mode: "openrouter" | "local_fallback";
  privacy_masked: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  summary: string;
  created_at: string;
}

export interface RadarCandidate {
  osmId: string;
  companyName: string;
  industry: string;
  city: string;
  postalAddress: string;
  websiteUrl: string;
  contactEmail: string;
  contactPhone: string;
  alreadyInPipeline: boolean;
}

export interface ViewerInfo {
  name: string;
  kind: "person" | "key";
  simulated: boolean;
  stage: "production" | "preview";
}
