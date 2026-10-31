-- Structural-repair BOQ layout: section headings (A, B…), numbered items with units,
-- description-only items that group lettered sub-items (a, b…), a subject line and a site
-- reference on every document, and per-unit rates on estimate lines.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotation_items', 'invoice_items', 'credit_note_items'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT ''item''', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit varchar(20) NOT NULL DEFAULT ''''', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS ref varchar(10) NOT NULL DEFAULT ''''', t);
  END LOOP;
END $$;
ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_kind_check;
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_kind_check CHECK (kind IN ('section', 'group', 'item'));
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_kind_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_kind_check CHECK (kind IN ('section', 'group', 'item'));
ALTER TABLE credit_note_items DROP CONSTRAINT IF EXISTS credit_note_items_kind_check;
ALTER TABLE credit_note_items ADD CONSTRAINT credit_note_items_kind_check CHECK (kind IN ('section', 'group', 'item'));
-- A quotation may list an item with unit and quantity but no rate yet (rate-only BOQ).
ALTER TABLE quotation_items ALTER COLUMN rate DROP NOT NULL;

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS site_reference text NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS site_reference text NOT NULL DEFAULT '';
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '';
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS site_reference text NOT NULL DEFAULT '';

-- Estimate lines: material / labour / other / low / high / custom become rates per unit,
-- and the line amount is qty × selected rate. Existing lines keep their totals as 1 LS.
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT '';
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS unit varchar(20) NOT NULL DEFAULT 'LS';
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS qty numeric(12,3) NOT NULL DEFAULT 1;
