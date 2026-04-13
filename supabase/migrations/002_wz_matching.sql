-- supabase/migrations/002_wz_matching.sql
-- ============================================================
-- WZ Matching Engine — schema additions
-- ============================================================

-- 1. Add wz_numbers array to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wz_numbers text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS invoices_wz_gin_idx ON invoices USING GIN(wz_numbers);

-- 2. Add WZ + carrier fields to shipments
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS wz_number text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_name text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_invoice_number text;
CREATE INDEX IF NOT EXISTS shipments_wz_idx ON shipments(org_id, wz_number);

-- 3. Make customers.upload_id nullable (customers live at org level)
ALTER TABLE customers ALTER COLUMN upload_id DROP NOT NULL;
-- Unique per (org, customer_code) for UPSERT
DO $$ BEGIN
  ALTER TABLE customers ADD CONSTRAINT customers_org_code_unique
    UNIQUE (org_id, customer_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. wz_matches — result of pairing invoices ↔ shipments
CREATE TABLE IF NOT EXISTS wz_matches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wz_number              text NOT NULL,
  invoice_id             uuid REFERENCES invoices(id) ON DELETE SET NULL,
  shipment_id            uuid REFERENCES shipments(id) ON DELETE SET NULL,
  invoice_number         text,
  invoice_date           date,
  customer_code          text,
  customer_name          text,
  net_value              numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost          numeric(14,2) NOT NULL DEFAULT 0,
  parcels_count          smallint NOT NULL DEFAULT 0,
  carrier_name           text,
  carrier_invoice_number text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wz_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_read_wz_matches"
  ON wz_matches FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS wz_matches_org_idx      ON wz_matches(org_id);
CREATE INDEX IF NOT EXISTS wz_matches_wz_idx       ON wz_matches(org_id, wz_number);
CREATE INDEX IF NOT EXISTS wz_matches_invoice_idx  ON wz_matches(org_id, invoice_number);
CREATE INDEX IF NOT EXISTS wz_matches_customer_idx ON wz_matches(org_id, customer_code);

-- 5. column_mappings — saved column mapping per org + file type
CREATE TABLE IF NOT EXISTS column_mappings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_type  text NOT NULL CHECK (file_type IN ('impuls', 'gls', 'customers')),
  mapping    jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, file_type)
);

ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_manage_column_mappings"
  ON column_mappings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
