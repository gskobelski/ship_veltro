-- ============================================================
-- ship.veltro.ai — Initial Schema  v2
-- CZYŚCI istniejące tabele przed utworzeniem (bezpieczne dla nowego projektu)
-- ============================================================

-- Usuń stare tabele jeśli istnieją (kolejność ważna — najpierw zależne)
drop table if exists complaints   cascade;
drop table if exists shipments    cascade;
drop table if exists invoices     cascade;
drop table if exists customers    cascade;
drop table if exists monthly_uploads cascade;
drop table if exists org_members  cascade;
drop table if exists organizations cascade;

-- ============================================================
-- ORGANIZATIONS (tenants)
-- Uwaga: policy która referencuje org_members tworzona jest PONIŻEJ
-- po tym jak tabela org_members istnieje
-- ============================================================
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

-- ============================================================
-- ORG MEMBERS (users ↔ orgs, multi-tenant guard)
-- ============================================================
create table org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')) default 'member',
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

alter table org_members enable row level security;

create policy "members_can_read_own_memberships"
  on org_members for select
  using (user_id = auth.uid());

create policy "owners_can_manage_members"
  on org_members for all
  using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Policy na organizations tworzona PO org_members
create policy "org_members_can_read_own_org"
  on organizations for select
  using (
    id in (select org_id from org_members where user_id = auth.uid())
  );

-- ============================================================
-- MONTHLY UPLOADS
-- ============================================================
create table monthly_uploads (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  period_month        smallint not null check (period_month between 1 and 12),
  period_year         smallint not null check (period_year >= 2020),
  status              text not null check (status in ('pending', 'processing', 'completed', 'error')) default 'pending',
  customers_file_path text,
  impuls_file_path    text,
  gls_file_path       text,
  customers_row_count integer,
  invoices_row_count  integer,
  shipments_row_count integer,
  error_message       text,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  processed_at        timestamptz,
  unique(org_id, period_month, period_year)
);

alter table monthly_uploads enable row level security;

create policy "members_can_read_own_uploads"
  on monthly_uploads for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members_can_insert_uploads"
  on monthly_uploads for insert
  with check (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members_can_update_own_uploads"
  on monthly_uploads for update
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- ============================================================
-- CUSTOMERS (Baza Klientów)
-- ============================================================
create table customers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  upload_id     uuid not null references monthly_uploads(id) on delete cascade,
  customer_code text not null,
  customer_name text not null,
  nip           text,
  address       text,
  city          text,
  postal_code   text,
  region        text,
  trade_rep     text,
  payment_days  integer,
  credit_limit  numeric(14,2),
  raw_data      jsonb,
  created_at    timestamptz not null default now()
);

alter table customers enable row level security;

create policy "members_can_read_own_customers"
  on customers for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create index customers_org_id_idx  on customers(org_id);
create index customers_upload_idx  on customers(upload_id);
create index customers_code_idx    on customers(org_id, customer_code);

-- ============================================================
-- INVOICES (IMPULS)
-- ============================================================
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  upload_id      uuid not null references monthly_uploads(id) on delete cascade,
  invoice_number text not null,
  invoice_date   date not null,
  customer_code  text not null,
  customer_name  text,
  net_value      numeric(14,2) not null default 0,
  gross_value    numeric(14,2) not null default 0,
  vat_value      numeric(14,2) not null default 0,
  product_code   text,
  product_name   text,
  quantity       numeric(14,4),
  unit           text,
  raw_data       jsonb,
  created_at     timestamptz not null default now()
);

alter table invoices enable row level security;

create policy "members_can_read_own_invoices"
  on invoices for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create index invoices_org_id_idx      on invoices(org_id);
create index invoices_upload_idx      on invoices(upload_id);
create index invoices_customer_idx    on invoices(org_id, customer_code);
create index invoices_date_idx        on invoices(org_id, invoice_date);

-- ============================================================
-- SHIPMENTS (GLS)
-- ============================================================
create table shipments (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  upload_id            uuid not null references monthly_uploads(id) on delete cascade,
  shipment_number      text not null,
  shipment_date        date not null,
  customer_code        text,
  receiver_name        text not null,
  receiver_city        text,
  receiver_postal_code text,
  weight_kg            numeric(10,3),
  parcels_count        smallint not null default 1,
  cod_amount           numeric(14,2),
  declared_value       numeric(14,2),
  shipping_cost        numeric(14,2),
  service_type         text,
  status               text,
  reference1           text,
  reference2           text,
  raw_data             jsonb,
  created_at           timestamptz not null default now()
);

alter table shipments enable row level security;

create policy "members_can_read_own_shipments"
  on shipments for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create index shipments_org_id_idx   on shipments(org_id);
create index shipments_upload_idx   on shipments(upload_id);
create index shipments_customer_idx on shipments(org_id, customer_code);
create index shipments_date_idx     on shipments(org_id, shipment_date);

-- ============================================================
-- COMPLAINTS (Zwroty/Reklamacje)
-- Zmieniona nazwa z "returns" (reserved word w PL/pgSQL)
-- ============================================================
create table complaints (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  upload_id       uuid not null references monthly_uploads(id) on delete cascade,
  customer_code   text not null,
  invoice_number  text,
  shipment_number text,
  return_date     date,
  reason          text,
  gross_value     numeric(14,2),
  status          text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  notes           text,
  raw_data        jsonb,
  created_at      timestamptz not null default now()
);

alter table complaints enable row level security;

create policy "members_can_read_own_complaints"
  on complaints for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create index complaints_org_id_idx on complaints(org_id);
create index complaints_upload_idx on complaints(upload_id);
