-- supabase/migrations/003_shipments_wz_array.sql
-- Replace shipments.wz_number (text) with wz_numbers (text[])

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS wz_numbers text[] NOT NULL DEFAULT '{}';

-- Migrate existing data
UPDATE shipments SET wz_numbers = ARRAY[wz_number] WHERE wz_number IS NOT NULL;

ALTER TABLE shipments DROP COLUMN IF EXISTS wz_number;

CREATE INDEX IF NOT EXISTS shipments_wz_numbers_gin_idx ON shipments USING GIN(wz_numbers);
