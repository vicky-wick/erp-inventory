-- 006: invoice branding controls + workspace logo storage

-- ------------------------------------------------------- invoice controls
-- A shop can present a "Tax Invoice", "Bill of Supply" or their own wording,
-- and choose exactly which business details appear on the printed sheet.
alter table workspaces
  add column if not exists invoice_title        text,
  add column if not exists invoice_terms        text,
  add column if not exists invoice_show_logo    boolean not null default true,
  add column if not exists invoice_show_address boolean not null default true,
  add column if not exists invoice_show_phone   boolean not null default true,
  add column if not exists invoice_show_gstin   boolean not null default true,
  add column if not exists invoice_show_sku     boolean not null default true;

-- ----------------------------------------------------------- image files
-- Uploads are stored in Postgres as base64 so they survive deployments and
-- stay scoped to the workspace. The API validates MIME type and size before
-- inserting; the table constraint is the final guard.
create table if not exists files (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id     uuid references profiles(id) on delete set null,
  filename     text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes between 0 and 2097152),
  data         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_files_workspace on files(workspace_id);

alter table files enable row level security;

drop policy if exists files_select on files;
create policy files_select on files for select
  using (app_is_member(workspace_id) or app_is_system());

drop policy if exists files_write on files;
create policy files_write on files for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));
