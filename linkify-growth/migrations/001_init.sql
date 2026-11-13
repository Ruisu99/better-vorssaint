create table if not exists brand_profiles (
  owner_sub text primary key,
  brand_name text not null,
  owner_name text not null,
  city text not null,
  website_url text not null,
  contact_email text not null,
  phone_mobile text not null default '',
  phone_landline text not null default '',
  postal_address text not null default '',
  tax_note text not null default '',
  positioning_statement text not null,
  tone_rules text not null,
  core_services jsonb not null default '[]'::jsonb,
  excluded_services jsonb not null default '[]'::jsonb,
  verified_references jsonb not null default '[]'::jsonb,
  discovery_questions jsonb not null default '[]'::jsonb,
  pricing_benchmarks jsonb not null default '[]'::jsonb,
  openrouter_config jsonb not null default '{}'::jsonb,
  weekly_targets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  owner_sub text not null,
  company_name text not null,
  industry text not null default '',
  target_track text not null default 'kmu',
  city text not null default '',
  postal_address text not null default '',
  website_url text not null default '',
  decision_maker text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  source text not null default 'manuell',
  priority text not null default 'warm',
  status text not null default 'neu',
  contact_channel text not null default 'email',
  first_contact_at timestamptz,
  next_follow_up_at timestamptz,
  visual_checked_desktop boolean not null default false,
  visual_checked_mobile boolean not null default false,
  visual_notes text not null default '',
  research_summary text not null default '',
  findings jsonb not null default '[]'::jsonb,
  scan_data jsonb,
  pitch_angle text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_owner_status on leads (owner_sub, status);
create index if not exists idx_leads_owner_followup on leads (owner_sub, next_follow_up_at);

create table if not exists outreach_items (
  id text primary key,
  owner_sub text not null,
  lead_id text not null references leads(id) on delete cascade,
  channel text not null,
  subject text not null default '',
  body text not null,
  notes text not null default '',
  status text not null default 'entwurf',
  model_used text not null default '',
  privacy_masked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outreach_owner_lead on outreach_items (owner_sub, lead_id);

create table if not exists content_posts (
  id text primary key,
  owner_sub text not null,
  title text not null,
  format text not null,
  target_track text not null default 'kmu',
  source_basis text not null default '',
  body text not null,
  verification_notes jsonb not null default '[]'::jsonb,
  status text not null default 'entwurf',
  model_used text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_owner on content_posts (owner_sub, status);

create table if not exists ai_runs (
  id text primary key,
  owner_sub text not null,
  task_type text not null,
  model text not null,
  provider_mode text not null,
  privacy_masked boolean not null default true,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_runs_owner on ai_runs (owner_sub, created_at desc);
