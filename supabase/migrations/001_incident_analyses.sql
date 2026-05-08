-- 在 Supabase SQL Editor 中执行，或通过 CLI 迁移。
-- 服务端使用 service_role key 写入；勿把 service_role 暴露到浏览器。

create table if not exists public.incident_analyses (
  id text primary key,
  created_at timestamptz not null default now(),
  alarm_text text,
  use_rag boolean not null default true,
  result_json jsonb,
  elapsed double precision default 0,
  markdown text,
  bukong_plan jsonb,
  bukong_markdown text,
  bukong_error text,
  bukong_inputs jsonb default '{}'::jsonb
);

comment on table public.incident_analyses is '警擎工作台研判 + 布控快照，供历史恢复';

create index if not exists incident_analyses_created_at_idx
  on public.incident_analyses (created_at desc);
