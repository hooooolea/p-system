-- 案件管理闭环：与研判快照 snap["case"] 同步
alter table public.incident_analyses
  add column if not exists case_mgmt jsonb default '{}'::jsonb;

comment on column public.incident_analyses.case_mgmt is '案件状态/进度/来源（调查中|已结案|已搁置）';
