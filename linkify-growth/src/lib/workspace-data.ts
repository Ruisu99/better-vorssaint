import { sql } from "./db";
import {
  buildDefaultBrandProfile,
  buildSampleContentPosts,
  buildSampleLeads,
} from "./defaults";
import type {
  AiRun,
  BrandProfile,
  ContentPost,
  Lead,
  OutreachItem,
} from "./types";

function asJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function asIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asNullableIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapBrandProfileRow(row: Record<string, unknown>, ownerSub: string): BrandProfile {
  const defaults = buildDefaultBrandProfile(ownerSub);
  return {
    owner_sub: String(row.owner_sub ?? ownerSub),
    brand_name: String(row.brand_name ?? defaults.brand_name),
    owner_name: String(row.owner_name ?? defaults.owner_name),
    city: String(row.city ?? defaults.city),
    website_url: String(row.website_url ?? defaults.website_url),
    contact_email: String(row.contact_email ?? defaults.contact_email),
    phone_mobile: String(row.phone_mobile ?? ""),
    phone_landline: String(row.phone_landline ?? ""),
    postal_address: String(row.postal_address ?? ""),
    tax_note: String(row.tax_note ?? defaults.tax_note),
    positioning_statement: String(
      row.positioning_statement ?? defaults.positioning_statement,
    ),
    tone_rules: String(row.tone_rules ?? defaults.tone_rules),
    core_services: asJson(row.core_services, defaults.core_services),
    excluded_services: asJson(row.excluded_services, defaults.excluded_services),
    verified_references: asJson(
      row.verified_references,
      defaults.verified_references,
    ),
    discovery_questions: asJson(
      row.discovery_questions,
      defaults.discovery_questions,
    ),
    pricing_benchmarks: asJson(
      row.pricing_benchmarks,
      defaults.pricing_benchmarks,
    ),
    openrouter_config: asJson(
      row.openrouter_config,
      defaults.openrouter_config,
    ),
    budget_config: {
      ...defaults.budget_config,
      ...asJson(row.budget_config, defaults.budget_config),
    },
    weekly_targets: asJson(row.weekly_targets, defaults.weekly_targets),
    updated_at: asIso(row.updated_at),
  };
}

function mapLeadRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    owner_sub: String(row.owner_sub),
    company_name: String(row.company_name),
    industry: String(row.industry ?? ""),
    target_track: (row.target_track === "startup" ? "startup" : "kmu"),
    city: String(row.city ?? ""),
    postal_address: String(row.postal_address ?? ""),
    website_url: String(row.website_url ?? ""),
    decision_maker: String(row.decision_maker ?? ""),
    contact_email: String(row.contact_email ?? ""),
    contact_phone: String(row.contact_phone ?? ""),
    source: String(row.source ?? "manuell"),
    priority: (row.priority as Lead["priority"]) ?? "warm",
    status: (row.status as Lead["status"]) ?? "neu",
    contact_channel: (row.contact_channel as Lead["contact_channel"]) ?? "email",
    first_contact_at: asNullableIso(row.first_contact_at),
    next_follow_up_at: asNullableIso(row.next_follow_up_at),
    visual_checked_desktop: Boolean(row.visual_checked_desktop),
    visual_checked_mobile: Boolean(row.visual_checked_mobile),
    visual_notes: String(row.visual_notes ?? ""),
    research_summary: String(row.research_summary ?? ""),
    findings: asJson(row.findings, []),
    scan_data: asJson(row.scan_data, null),
    pitch_angle: String(row.pitch_angle ?? ""),
    is_sample: Boolean(row.is_sample),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

function mapOutreachRow(row: Record<string, unknown>): OutreachItem {
  return {
    id: String(row.id),
    owner_sub: String(row.owner_sub),
    lead_id: String(row.lead_id),
    channel: (row.channel as OutreachItem["channel"]) ?? "email",
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    notes: String(row.notes ?? ""),
    status: (row.status as OutreachItem["status"]) ?? "entwurf",
    model_used: String(row.model_used ?? ""),
    privacy_masked: Boolean(row.privacy_masked),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

function mapContentRow(row: Record<string, unknown>): ContentPost {
  return {
    id: String(row.id),
    owner_sub: String(row.owner_sub),
    title: String(row.title),
    format: (row.format as ContentPost["format"]) ?? "linkedin",
    target_track: row.target_track === "startup" ? "startup" : "kmu",
    source_basis: String(row.source_basis ?? ""),
    body: String(row.body ?? ""),
    verification_notes: asJson(row.verification_notes, []),
    status: (row.status as ContentPost["status"]) ?? "entwurf",
    model_used: String(row.model_used ?? ""),
    is_sample: Boolean(row.is_sample),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

function mapAiRunRow(row: Record<string, unknown>): AiRun {
  return {
    id: String(row.id),
    owner_sub: String(row.owner_sub),
    task_type: String(row.task_type),
    model: String(row.model),
    provider_mode:
      row.provider_mode === "openrouter" ? "openrouter" : "local_fallback",
    privacy_masked: Boolean(row.privacy_masked),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    summary: String(row.summary ?? ""),
    created_at: asIso(row.created_at),
  };
}

export async function getBrandProfile(ownerSub: string): Promise<BrandProfile> {
  const rows = await sql<Record<string, unknown>>(
    "select * from brand_profiles where owner_sub = $1 limit 1",
    [ownerSub],
  );
  if (rows.length === 0) {
    return buildDefaultBrandProfile(ownerSub);
  }
  return mapBrandProfileRow(rows[0], ownerSub);
}

export async function hasPersistedProfile(ownerSub: string): Promise<boolean> {
  const rows = await sql<{ owner_sub: string }>(
    "select owner_sub from brand_profiles where owner_sub = $1 limit 1",
    [ownerSub],
  );
  return rows.length > 0;
}

export async function saveBrandProfile(profile: BrandProfile): Promise<BrandProfile> {
  await sql(
    `insert into brand_profiles (
      owner_sub, brand_name, owner_name, city, website_url, contact_email,
      phone_mobile, phone_landline, postal_address, tax_note,
      positioning_statement, tone_rules, core_services, excluded_services,
      verified_references, discovery_questions, pricing_benchmarks,
      openrouter_config, budget_config, weekly_targets, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,now()
    )
    on conflict (owner_sub) do update set
      brand_name = excluded.brand_name,
      owner_name = excluded.owner_name,
      city = excluded.city,
      website_url = excluded.website_url,
      contact_email = excluded.contact_email,
      phone_mobile = excluded.phone_mobile,
      phone_landline = excluded.phone_landline,
      postal_address = excluded.postal_address,
      tax_note = excluded.tax_note,
      positioning_statement = excluded.positioning_statement,
      tone_rules = excluded.tone_rules,
      core_services = excluded.core_services,
      excluded_services = excluded.excluded_services,
      verified_references = excluded.verified_references,
      discovery_questions = excluded.discovery_questions,
      pricing_benchmarks = excluded.pricing_benchmarks,
      openrouter_config = excluded.openrouter_config,
      budget_config = excluded.budget_config,
      weekly_targets = excluded.weekly_targets,
      updated_at = now()`,
    [
      profile.owner_sub,
      profile.brand_name,
      profile.owner_name,
      profile.city,
      profile.website_url,
      profile.contact_email,
      profile.phone_mobile,
      profile.phone_landline,
      profile.postal_address,
      profile.tax_note,
      profile.positioning_statement,
      profile.tone_rules,
      JSON.stringify(profile.core_services),
      JSON.stringify(profile.excluded_services),
      JSON.stringify(profile.verified_references),
      JSON.stringify(profile.discovery_questions),
      JSON.stringify(profile.pricing_benchmarks),
      JSON.stringify(profile.openrouter_config),
      JSON.stringify(profile.budget_config),
      JSON.stringify(profile.weekly_targets),
    ],
  );
  return getBrandProfile(profile.owner_sub);
}

export async function ensureWorkspaceSeeded(ownerSub: string): Promise<{
  seededNow: boolean;
}> {
  const already = await hasPersistedProfile(ownerSub);
  if (already) {
    return { seededNow: false };
  }
  await saveBrandProfile(buildDefaultBrandProfile(ownerSub));
  const leadCount = await sql<{ count: string }>(
    "select count(*)::text as count from leads where owner_sub = $1",
    [ownerSub],
  );
  if (Number(leadCount[0]?.count ?? 0) === 0) {
    for (const lead of buildSampleLeads(ownerSub)) {
      await upsertLead(lead);
    }
  }
  const postCount = await sql<{ count: string }>(
    "select count(*)::text as count from content_posts where owner_sub = $1",
    [ownerSub],
  );
  if (Number(postCount[0]?.count ?? 0) === 0) {
    for (const post of buildSampleContentPosts(ownerSub)) {
      await createContentPost(post);
    }
  }
  return { seededNow: true };
}

export async function listLeads(ownerSub: string): Promise<Lead[]> {
  const rows = await sql<Record<string, unknown>>(
    `select * from leads where owner_sub = $1
     order by
       case priority when 'heiss' then 0 when 'warm' then 1 else 2 end,
       updated_at desc`,
    [ownerSub],
  );
  return rows.map(mapLeadRow);
}

export async function getLeadById(
  ownerSub: string,
  leadId: string,
): Promise<Lead | null> {
  const rows = await sql<Record<string, unknown>>(
    "select * from leads where id = $1 and owner_sub = $2 limit 1",
    [leadId, ownerSub],
  );
  return rows.length > 0 ? mapLeadRow(rows[0]) : null;
}

export async function upsertLead(
  lead: Omit<Lead, "created_at" | "updated_at">,
): Promise<Lead> {
  const rows = await sql<Record<string, unknown>>(
    `insert into leads (
      id, owner_sub, company_name, industry, target_track, city, postal_address,
      website_url, decision_maker, contact_email, contact_phone, source,
      priority, status, contact_channel, first_contact_at, next_follow_up_at,
      visual_checked_desktop, visual_checked_mobile, visual_notes,
      research_summary, findings, scan_data, pitch_angle, is_sample, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24,$25,now()
    )
    on conflict (id) do update set
      company_name = excluded.company_name,
      industry = excluded.industry,
      target_track = excluded.target_track,
      city = excluded.city,
      postal_address = excluded.postal_address,
      website_url = excluded.website_url,
      decision_maker = excluded.decision_maker,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      source = excluded.source,
      priority = excluded.priority,
      status = excluded.status,
      contact_channel = excluded.contact_channel,
      first_contact_at = excluded.first_contact_at,
      next_follow_up_at = excluded.next_follow_up_at,
      visual_checked_desktop = excluded.visual_checked_desktop,
      visual_checked_mobile = excluded.visual_checked_mobile,
      visual_notes = excluded.visual_notes,
      research_summary = excluded.research_summary,
      findings = excluded.findings,
      scan_data = excluded.scan_data,
      pitch_angle = excluded.pitch_angle,
      is_sample = excluded.is_sample,
      updated_at = now()
    where leads.owner_sub = excluded.owner_sub
    returning *`,
    [
      lead.id,
      lead.owner_sub,
      lead.company_name,
      lead.industry,
      lead.target_track,
      lead.city,
      lead.postal_address,
      lead.website_url,
      lead.decision_maker,
      lead.contact_email,
      lead.contact_phone,
      lead.source,
      lead.priority,
      lead.status,
      lead.contact_channel,
      lead.first_contact_at,
      lead.next_follow_up_at,
      lead.visual_checked_desktop,
      lead.visual_checked_mobile,
      lead.visual_notes,
      lead.research_summary,
      JSON.stringify(lead.findings ?? []),
      lead.scan_data ? JSON.stringify(lead.scan_data) : null,
      lead.pitch_angle,
      lead.is_sample,
    ],
  );
  return mapLeadRow(rows[0]);
}

export async function deleteLead(ownerSub: string, leadId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    "delete from leads where id = $1 and owner_sub = $2 returning id",
    [leadId, ownerSub],
  );
  return rows.length > 0;
}

export async function clearSampleData(ownerSub: string): Promise<void> {
  await sql("delete from leads where owner_sub = $1 and is_sample = true", [
    ownerSub,
  ]);
  await sql(
    "delete from content_posts where owner_sub = $1 and is_sample = true",
    [ownerSub],
  );
}

export async function listOutreachForLead(
  ownerSub: string,
  leadId: string,
): Promise<OutreachItem[]> {
  const rows = await sql<Record<string, unknown>>(
    `select * from outreach_items
     where owner_sub = $1 and lead_id = $2
     order by created_at desc`,
    [ownerSub, leadId],
  );
  return rows.map(mapOutreachRow);
}

export async function listRecentOutreach(ownerSub: string): Promise<
  (OutreachItem & { company_name?: string })[]
> {
  const rows = await sql<Record<string, unknown>>(
    `select o.*, l.company_name
     from outreach_items o
     join leads l on l.id = o.lead_id and l.owner_sub = o.owner_sub
     where o.owner_sub = $1
     order by o.created_at desc
     limit 40`,
    [ownerSub],
  );
  return rows.map((r) => ({
    ...mapOutreachRow(r),
    company_name: r.company_name ? String(r.company_name) : undefined,
  }));
}

export async function saveOutreachItem(
  item: Omit<OutreachItem, "created_at" | "updated_at">,
): Promise<OutreachItem> {
  const rows = await sql<Record<string, unknown>>(
    `insert into outreach_items (
      id, owner_sub, lead_id, channel, subject, body, notes, status, model_used, privacy_masked, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict (id) do update set
      channel = excluded.channel,
      subject = excluded.subject,
      body = excluded.body,
      notes = excluded.notes,
      status = excluded.status,
      model_used = excluded.model_used,
      privacy_masked = excluded.privacy_masked,
      updated_at = now()
    where outreach_items.owner_sub = excluded.owner_sub
    returning *`,
    [
      item.id,
      item.owner_sub,
      item.lead_id,
      item.channel,
      item.subject,
      item.body,
      item.notes,
      item.status,
      item.model_used,
      item.privacy_masked,
    ],
  );
  return mapOutreachRow(rows[0]);
}

export async function updateOutreachStatus(
  ownerSub: string,
  itemId: string,
  status: OutreachItem["status"],
  subject?: string,
  body?: string,
): Promise<OutreachItem | null> {
  const rows = await sql<Record<string, unknown>>(
    `update outreach_items
     set status = $3,
         subject = coalesce($4, subject),
         body = coalesce($5, body),
         updated_at = now()
     where id = $1 and owner_sub = $2
     returning *`,
    [itemId, ownerSub, status, subject ?? null, body ?? null],
  );
  return rows.length > 0 ? mapOutreachRow(rows[0]) : null;
}

export async function listContentPosts(ownerSub: string): Promise<ContentPost[]> {
  const rows = await sql<Record<string, unknown>>(
    "select * from content_posts where owner_sub = $1 order by updated_at desc",
    [ownerSub],
  );
  return rows.map(mapContentRow);
}

export async function createContentPost(
  post: Omit<ContentPost, "created_at" | "updated_at">,
): Promise<ContentPost> {
  const rows = await sql<Record<string, unknown>>(
    `insert into content_posts (
      id, owner_sub, title, format, target_track, source_basis, body,
      verification_notes, status, model_used, is_sample, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,now())
    on conflict (id) do update set
      title = excluded.title,
      format = excluded.format,
      target_track = excluded.target_track,
      source_basis = excluded.source_basis,
      body = excluded.body,
      verification_notes = excluded.verification_notes,
      status = excluded.status,
      model_used = excluded.model_used,
      updated_at = now()
    where content_posts.owner_sub = excluded.owner_sub
    returning *`,
    [
      post.id,
      post.owner_sub,
      post.title,
      post.format,
      post.target_track,
      post.source_basis,
      post.body,
      JSON.stringify(post.verification_notes ?? []),
      post.status,
      post.model_used,
      post.is_sample,
    ],
  );
  return mapContentRow(rows[0]);
}

export async function deleteContentPost(
  ownerSub: string,
  postId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    "delete from content_posts where id = $1 and owner_sub = $2 returning id",
    [postId, ownerSub],
  );
  return rows.length > 0;
}

export async function logAiRun(
  run: Omit<AiRun, "created_at">,
): Promise<void> {
  await sql(
    `insert into ai_runs (
      id, owner_sub, task_type, model, provider_mode, privacy_masked,
      prompt_tokens, completion_tokens, estimated_cost_usd, summary
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      run.id,
      run.owner_sub,
      run.task_type,
      run.model,
      run.provider_mode,
      run.privacy_masked,
      run.prompt_tokens,
      run.completion_tokens,
      run.estimated_cost_usd,
      run.summary,
    ],
  );
}

export async function listAiRuns(ownerSub: string): Promise<AiRun[]> {
  const rows = await sql<Record<string, unknown>>(
    "select * from ai_runs where owner_sub = $1 order by created_at desc limit 50",
    [ownerSub],
  );
  return rows.map(mapAiRunRow);
}

export async function getAiUsageSummary(ownerSub: string): Promise<{
  monthCalls: number;
  monthCostUsd: number;
  todayCalls: number;
  todayCostUsd: number;
  monthTokens: number;
}> {
  const rows = await sql<{
    month_calls: string;
    month_cost_usd: string;
    today_calls: string;
    today_cost_usd: string;
    month_tokens: string;
  }>(
    `select
      count(*) filter (where provider_mode = 'openrouter' and created_at >= date_trunc('month', now()))::text as month_calls,
      coalesce(sum(estimated_cost_usd) filter (where provider_mode = 'openrouter' and created_at >= date_trunc('month', now())), 0)::text as month_cost_usd,
      count(*) filter (where provider_mode = 'openrouter' and created_at >= date_trunc('day', now()))::text as today_calls,
      coalesce(sum(estimated_cost_usd) filter (where provider_mode = 'openrouter' and created_at >= date_trunc('day', now())), 0)::text as today_cost_usd,
      coalesce(sum(prompt_tokens + completion_tokens) filter (where provider_mode = 'openrouter' and created_at >= date_trunc('month', now())), 0)::text as month_tokens
     from ai_runs
     where owner_sub = $1`,
    [ownerSub],
  );
  const r = rows[0];
  return {
    monthCalls: Number(r?.month_calls ?? 0),
    monthCostUsd: Number(r?.month_cost_usd ?? 0),
    todayCalls: Number(r?.today_calls ?? 0),
    todayCostUsd: Number(r?.today_cost_usd ?? 0),
    monthTokens: Number(r?.month_tokens ?? 0),
  };
}
