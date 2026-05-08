-- 研判结果专页：结构化展示 JSON + 用户对 AI 结论的反馈（采纳/忽略）
-- 在已存在 public.incident_analyses 的前提下执行。

alter table public.incident_analyses
  add column if not exists presentation_json jsonb;

alter table public.incident_analyses
  add column if not exists user_feedback text;

comment on column public.incident_analyses.presentation_json is '专页渲染用结构化载荷（version/facts/ai 等）';
comment on column public.incident_analyses.user_feedback is 'adopt | ignore，由 POST 反馈接口写入';
