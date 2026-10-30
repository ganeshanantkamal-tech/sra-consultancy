ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS round_off bigint NOT NULL DEFAULT 0;

-- ERP account groups that 002 did not seed (anantkamal-erp-api-new/src/utils/seed.ts).
INSERT INTO account_groups (name, nature, is_primary) VALUES
  ('Capital Account', 'Liability', true), ('Loans (Liability)', 'Liability', true), ('Current Liabilities', 'Liability', true),
  ('Current Assets', 'Asset', true), ('Sales Accounts', 'Income', true), ('Purchase Accounts', 'Expense', true)
ON CONFLICT (name) DO NOTHING;
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Current Assets')
  WHERE name IN ('Cash-in-Hand', 'Bank Accounts', 'Sundry Debtors');
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Current Liabilities')
  WHERE name IN ('Sundry Creditors', 'Duties & Taxes');
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Assets') WHERE name = 'Current Assets';
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Liabilities')
  WHERE name IN ('Capital Account', 'Loans (Liability)', 'Current Liabilities');
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Income') WHERE name = 'Sales Accounts';
UPDATE account_groups SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Expenses') WHERE name = 'Purchase Accounts';
UPDATE account_groups SET is_primary = false WHERE name IN ('Current Assets', 'Capital Account', 'Loans (Liability)', 'Current Liabilities', 'Sales Accounts', 'Purchase Accounts');
-- The ERP keeps Sales under Sales Accounts.
UPDATE ledgers SET group_id = (SELECT id FROM account_groups WHERE name = 'Sales Accounts') WHERE system_key = 'sales';

INSERT INTO ledgers (name, group_id, system_key, opening_balance_type) VALUES
  ('Input CGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'input_cgst', 'Dr'),
  ('Input SGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'input_sgst', 'Dr'),
  ('Input IGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'input_igst', 'Dr')
ON CONFLICT DO NOTHING;
UPDATE ledgers SET opening_balance_type = 'Cr' WHERE system_key IN ('sales', 'output_cgst', 'output_sgst', 'output_igst');

-- User management (Phase 0): display name, email for password resets, audit fields.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS allocations_voucher_idx ON allocations(voucher_id);
