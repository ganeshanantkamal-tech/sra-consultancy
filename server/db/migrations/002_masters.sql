CREATE TABLE IF NOT EXISTS financial_years (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label varchar(9) NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '', state_code varchar(2) NOT NULL DEFAULT '', pincode varchar(10) NOT NULL DEFAULT '',
  gstin varchar(15) NOT NULL DEFAULT '', pan varchar(10) NOT NULL DEFAULT '', phone varchar(20) NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '', website text, logo_path text, upi_id text NOT NULL DEFAULT '', payee_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '', account_number text NOT NULL DEFAULT '', ifsc_code varchar(20) NOT NULL DEFAULT '', branch text,
  invoice_prefix varchar(20) NOT NULL DEFAULT 'SRA', quotation_prefix varchar(20) NOT NULL DEFAULT 'SRAQ', credit_note_prefix varchar(20) NOT NULL DEFAULT 'SRACN',
  nongst_invoice_prefix varchar(20) NOT NULL DEFAULT 'SRANG', nongst_quotation_prefix varchar(20) NOT NULL DEFAULT 'SRANGQ', nongst_credit_note_prefix varchar(20) NOT NULL DEFAULT 'SRANGCN',
  default_financial_year_id bigint REFERENCES financial_years(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO company_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL UNIQUE,
  parent_group_id bigint REFERENCES account_groups(id),
  nature varchar(10) NOT NULL CHECK (nature IN ('Asset', 'Liability', 'Income', 'Expense')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledgers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(160) NOT NULL UNIQUE,
  group_id bigint NOT NULL REFERENCES account_groups(id),
  system_key varchar(60) UNIQUE,
  gstin varchar(15), pan varchar(10), state_code varchar(2), city varchar(100), address text,
  contact varchar(30), email text, opening_balance bigint NOT NULL DEFAULT 0,
  opening_balance_type varchar(2) NOT NULL DEFAULT 'Dr' CHECK (opening_balance_type IN ('Dr', 'Cr')),
  credit_period_days integer, is_client boolean NOT NULL DEFAULT false, upi_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledgers_group_id_idx ON ledgers(group_id);
CREATE INDEX IF NOT EXISTS ledgers_is_client_idx ON ledgers(is_client);

CREATE TABLE IF NOT EXISTS hsn_sac_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code varchar(20) NOT NULL UNIQUE,
  description text NOT NULL,
  type varchar(3) NOT NULL CHECK (type IN ('HSN', 'SAC')),
  gst_rate_pct smallint NOT NULL CHECK (gst_rate_pct IN (0, 5, 12, 18, 28)),
  notes text, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO account_groups (name, nature, is_primary) VALUES
  ('Assets', 'Asset', true), ('Liabilities', 'Liability', true), ('Income', 'Income', true), ('Expenses', 'Expense', true)
ON CONFLICT (name) DO NOTHING;
INSERT INTO account_groups (name, parent_group_id, nature) VALUES
  ('Cash-in-Hand', (SELECT id FROM account_groups WHERE name = 'Assets'), 'Asset'),
  ('Bank Accounts', (SELECT id FROM account_groups WHERE name = 'Assets'), 'Asset'),
  ('Sundry Debtors', (SELECT id FROM account_groups WHERE name = 'Assets'), 'Asset'),
  ('Fixed Assets', (SELECT id FROM account_groups WHERE name = 'Assets'), 'Asset'),
  ('Sundry Creditors', (SELECT id FROM account_groups WHERE name = 'Liabilities'), 'Liability'),
  ('Duties & Taxes', (SELECT id FROM account_groups WHERE name = 'Liabilities'), 'Liability'),
  ('Direct Income', (SELECT id FROM account_groups WHERE name = 'Income'), 'Income'),
  ('Indirect Income', (SELECT id FROM account_groups WHERE name = 'Income'), 'Income'),
  ('Direct Expenses', (SELECT id FROM account_groups WHERE name = 'Expenses'), 'Expense'),
  ('Indirect Expenses', (SELECT id FROM account_groups WHERE name = 'Expenses'), 'Expense')
ON CONFLICT (name) DO NOTHING;
INSERT INTO ledgers (name, group_id, system_key) VALUES
  ('Cash', (SELECT id FROM account_groups WHERE name = 'Cash-in-Hand'), 'cash'),
  ('Sales', (SELECT id FROM account_groups WHERE name = 'Direct Income'), 'sales'),
  ('Output CGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'output_cgst'),
  ('Output SGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'output_sgst'),
  ('Output IGST', (SELECT id FROM account_groups WHERE name = 'Duties & Taxes'), 'output_igst'),
  ('Round Off', (SELECT id FROM account_groups WHERE name = 'Indirect Expenses'), 'round_off')
ON CONFLICT (system_key) DO NOTHING;
INSERT INTO hsn_sac_codes (code, description, type, gst_rate_pct, is_default) VALUES
  ('9954', 'Construction services', 'SAC', 18, true),
  ('995421', 'General construction services of residential buildings', 'SAC', 18, true),
  ('995422', 'General construction services of commercial buildings', 'SAC', 18, true),
  ('998331', 'Engineering advisory services', 'SAC', 18, true),
  ('998314', 'Design and development services', 'SAC', 18, true)
ON CONFLICT (code) DO NOTHING;
