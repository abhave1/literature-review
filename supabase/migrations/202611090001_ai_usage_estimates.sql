-- Separate from provider-reported usage. The backfill runner executes this inside
-- its rollback transaction first; this file deliberately contains no COMMIT.
create table public.ai_usage_estimates (
  source_system text not null check (length(source_system) > 0),
  source_request_id text not null check (length(source_request_id) > 0),
  user_id uuid not null,
  occurred_at timestamptz not null,
  operation text not null check (operation in ('analyze', 'screening')),
  model_provider text not null,
  model_name text not null,
  tokenizer_model text not null,
  tokenizer_version text not null,
  estimated_input_tokens bigint not null check (estimated_input_tokens >= 0),
  estimated_visible_output_tokens bigint not null check (estimated_visible_output_tokens >= 0),
  input_usd_per_million numeric not null check (input_usd_per_million >= 0 and input_usd_per_million < 'Infinity'::numeric),
  output_usd_per_million numeric not null check (output_usd_per_million >= 0 and output_usd_per_million < 'Infinity'::numeric),
  estimated_text_cost_usd numeric generated always as (
    (estimated_input_tokens * input_usd_per_million +
     estimated_visible_output_tokens * output_usd_per_million) / 1000000
  ) stored,
  coverage text not null default 'reconstructed_text_only' check (coverage = 'reconstructed_text_only'),
  -- Raw prompts, paper text, responses, emails, and credentials never go here.
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  record_sha256 text not null check (record_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (source_system, source_request_id)
);
create index ai_usage_estimates_user_time_idx on public.ai_usage_estimates(user_id, occurred_at);
alter table public.ai_usage_estimates enable row level security;
revoke all on public.ai_usage_estimates from public, anon, authenticated, service_role;
grant select on public.ai_usage_estimates to authenticated;
grant select, insert on public.ai_usage_estimates to service_role;
create policy "Admins read historical estimates" on public.ai_usage_estimates
  for select to authenticated using (public.is_admin());
comment on table public.ai_usage_estimates is 'Reconstructed historical text-usage estimates, not billed credits. Excludes hidden thinking, missing retries, caching adjustments, and provider overhead. Never automatically summed with ai_usage_ledger.';
comment on column public.ai_usage_estimates.source_request_id is 'Stable ID for one original provider call, backed by source evidence. Never a filename or content hash invented to guess calls.';
comment on column public.ai_usage_estimates.user_id is 'User attribution reviewed against historical evidence; retained without a cascading account foreign key.';
notify pgrst, 'reload schema';
