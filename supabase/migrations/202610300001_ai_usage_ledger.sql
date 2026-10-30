begin;

create table public.ai_usage_ledger (
  id uuid primary key,
  -- Retain attribution after account deletion, without cascading away history.
  user_id uuid not null,
  request_id uuid not null,
  call_id uuid not null,
  attempt integer not null check (attempt > 0),
  bot_key text not null,
  project_name text not null,
  operation text not null check (operation in ('analyze', 'screening')),
  model_provider text not null,
  model_name text not null,
  provider_query_id text,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  cost_usd numeric check (cost_usd >= 0),
  http_status integer check (http_status between 100 and 599),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (call_id, attempt),
  check ((status = 'pending' and completed_at is null) or
         (status <> 'pending' and completed_at is not null))
);
create index ai_usage_ledger_user_created_idx on public.ai_usage_ledger(user_id, created_at);
create index ai_usage_ledger_created_idx on public.ai_usage_ledger(created_at);
create index ai_usage_ledger_request_idx on public.ai_usage_ledger(request_id);

alter table public.ai_usage_ledger enable row level security;
revoke all on public.ai_usage_ledger from public, anon, authenticated;
grant select on public.ai_usage_ledger to authenticated;
grant select, insert, update on public.ai_usage_ledger to service_role;
create policy "Admins read usage ledger" on public.ai_usage_ledger
  for select to authenticated using (public.is_admin());

comment on table public.ai_usage_ledger is 'One server-attributed CreateAI HTTP attempt per row. Request IDs group app requests; call IDs group retries. No prompts or response content. NULL usage is unknown, never zero.';
comment on column public.ai_usage_ledger.user_id is 'Verified auth user UUID at request time, retained after account deletion without a cascading foreign key.';
comment on column public.ai_usage_ledger.status is 'Provider HTTP outcome, not downstream analysis parsing. Pending rows indicate interrupted requests or accounting finalization gaps.';
notify pgrst, 'reload schema';
commit;
