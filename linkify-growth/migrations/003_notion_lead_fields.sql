alter table leads
  add column if not exists buying_signals jsonb not null default '[]'::jsonb,
  add column if not exists score_reason text not null default '',
  add column if not exists relaunch_benefit text not null default '',
  add column if not exists follow_up_note text not null default '',
  add column if not exists letter_printed_at timestamptz,
  add column if not exists found_at timestamptz not null default now();
