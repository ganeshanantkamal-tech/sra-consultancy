CREATE TABLE IF NOT EXISTS sequences (
  kind varchar(30) NOT NULL,
  financial_year_id bigint NOT NULL REFERENCES financial_years(id),
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, financial_year_id)
);
CREATE TABLE IF NOT EXISTS vouchers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voucher_type varchar(30) NOT NULL,
  voucher_no varchar(80) NOT NULL,
  financial_year_id bigint NOT NULL REFERENCES financial_years(id),
  date date NOT NULL, narration text NOT NULL DEFAULT '', status varchar(12) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voucher_type, voucher_no, financial_year_id)
);
CREATE TABLE IF NOT EXISTS voucher_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voucher_id bigint NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id bigint NOT NULL REFERENCES ledgers(id), dr bigint NOT NULL DEFAULT 0 CHECK (dr >= 0), cr bigint NOT NULL DEFAULT 0 CHECK (cr >= 0),
  CHECK ((dr = 0) <> (cr = 0))
);
CREATE TABLE IF NOT EXISTS quotations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quotation_no varchar(80) NOT NULL UNIQUE, client_ledger_id bigint NOT NULL REFERENCES ledgers(id), financial_year_id bigint NOT NULL REFERENCES financial_years(id),
  date date NOT NULL, valid_until date NOT NULL, place_of_supply_state_code varchar(2) NOT NULL DEFAULT '', status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','converted','cancelled')),
  is_nongst boolean NOT NULL DEFAULT false, taxable bigint NOT NULL, cgst bigint NOT NULL DEFAULT 0, sgst bigint NOT NULL DEFAULT 0, igst bigint NOT NULL DEFAULT 0, round_off bigint NOT NULL DEFAULT 0, grand_total bigint NOT NULL,
  notes text NOT NULL DEFAULT '', terms text NOT NULL DEFAULT '', public_token uuid NOT NULL UNIQUE, created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, quotation_id bigint NOT NULL REFERENCES quotations(id) ON DELETE CASCADE, position integer NOT NULL,
  description text NOT NULL, hsn_sac varchar(20) NOT NULL DEFAULT '', qty numeric(12,3) NOT NULL, rate bigint NOT NULL, gst_rate_pct smallint NOT NULL, line_taxable bigint NOT NULL, line_cgst bigint NOT NULL DEFAULT 0, line_sgst bigint NOT NULL DEFAULT 0, line_igst bigint NOT NULL DEFAULT 0, line_total bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, voucher_id bigint NOT NULL UNIQUE REFERENCES vouchers(id), invoice_no varchar(80) NOT NULL UNIQUE,
  client_ledger_id bigint NOT NULL REFERENCES ledgers(id), quotation_id bigint REFERENCES quotations(id), financial_year_id bigint NOT NULL REFERENCES financial_years(id), date date NOT NULL, due_date date NOT NULL,
  place_of_supply_state_code varchar(2) NOT NULL DEFAULT '', status varchar(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')), is_nongst boolean NOT NULL DEFAULT false,
  taxable bigint NOT NULL, cgst bigint NOT NULL DEFAULT 0, sgst bigint NOT NULL DEFAULT 0, igst bigint NOT NULL DEFAULT 0, round_off bigint NOT NULL DEFAULT 0, grand_total bigint NOT NULL,
  narration text NOT NULL DEFAULT '', terms text NOT NULL DEFAULT '', public_token uuid NOT NULL UNIQUE, created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, invoice_id bigint NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, position integer NOT NULL,
  description text NOT NULL, hsn_sac varchar(20) NOT NULL DEFAULT '', qty numeric(12,3) NOT NULL, rate bigint NOT NULL, gst_rate_pct smallint NOT NULL, line_taxable bigint NOT NULL, line_cgst bigint NOT NULL DEFAULT 0, line_sgst bigint NOT NULL DEFAULT 0, line_igst bigint NOT NULL DEFAULT 0, line_total bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, voucher_id bigint NOT NULL UNIQUE REFERENCES vouchers(id), note_no varchar(80) NOT NULL UNIQUE, note_type char(1) NOT NULL CHECK (note_type IN ('C','D')),
  invoice_id bigint NOT NULL REFERENCES invoices(id), client_ledger_id bigint NOT NULL REFERENCES ledgers(id), financial_year_id bigint NOT NULL REFERENCES financial_years(id), date date NOT NULL,
  is_nongst boolean NOT NULL DEFAULT false, taxable bigint NOT NULL, cgst bigint NOT NULL DEFAULT 0, sgst bigint NOT NULL DEFAULT 0, igst bigint NOT NULL DEFAULT 0, grand_total bigint NOT NULL,
  reason text NOT NULL DEFAULT '', status varchar(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')), created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_note_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, credit_note_id bigint NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE, position integer NOT NULL,
  description text NOT NULL, hsn_sac varchar(20) NOT NULL DEFAULT '', qty numeric(12,3) NOT NULL, rate bigint NOT NULL, gst_rate_pct smallint NOT NULL, line_taxable bigint NOT NULL, line_cgst bigint NOT NULL DEFAULT 0, line_sgst bigint NOT NULL DEFAULT 0, line_igst bigint NOT NULL DEFAULT 0, line_total bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices(client_ledger_id); CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices(date); CREATE INDEX IF NOT EXISTS quotations_client_idx ON quotations(client_ledger_id);
