alter table brand_profiles
  add column if not exists budget_config jsonb not null default '{}'::jsonb;

alter table ai_runs
  add column if not exists estimated_cost_usd double precision not null default 0;
