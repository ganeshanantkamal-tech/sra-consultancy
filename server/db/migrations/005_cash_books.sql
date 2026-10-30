ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_prefix varchar(20) NOT NULL DEFAULT 'REC';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS payment_prefix varchar(20) NOT NULL DEFAULT 'PAY';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS expense_prefix varchar(20) NOT NULL DEFAULT 'EXP';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS journal_prefix varchar(20) NOT NULL DEFAULT 'JRN';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contra_prefix varchar(20) NOT NULL DEFAULT 'CON';
CREATE TABLE IF NOT EXISTS receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, voucher_id bigint NOT NULL UNIQUE REFERENCES vouchers(id), client_ledger_id bigint NOT NULL REFERENCES ledgers(id),
  account_ledger_id bigint NOT NULL REFERENCES ledgers(id), date date NOT NULL, amount bigint NOT NULL CHECK (amount > 0), mode varchar(30) NOT NULL DEFAULT 'cash', reference text NOT NULL DEFAULT '', narration text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, voucher_id bigint NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE, invoice_id bigint NOT NULL REFERENCES invoices(id), amount bigint NOT NULL CHECK (amount > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocations_invoice_idx ON allocations(invoice_id);
CREATE TABLE IF NOT EXISTS expenses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, voucher_id bigint NOT NULL UNIQUE REFERENCES vouchers(id), expense_ledger_id bigint NOT NULL REFERENCES ledgers(id),
  account_ledger_id bigint NOT NULL REFERENCES ledgers(id), date date NOT NULL, amount bigint NOT NULL CHECK (amount > 0), category text NOT NULL DEFAULT '', vendor text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', narration text NOT NULL DEFAULT '', is_capex boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_kind varchar(30) NOT NULL, owner_id bigint NOT NULL, pathname text NOT NULL, content_type text NOT NULL, filename text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments(owner_kind, owner_id);
CREATE TABLE IF NOT EXISTS bank_statements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, bank_ledger_id bigint NOT NULL REFERENCES ledgers(id), filename text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), imported_by bigint NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, statement_id bigint NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE, bank_ledger_id bigint NOT NULL REFERENCES ledgers(id),
  date date NOT NULL, description text NOT NULL, reference text NOT NULL DEFAULT '', amount bigint NOT NULL CHECK (amount <> 0), balance bigint,
  dedupe_hash varchar(64) NOT NULL UNIQUE, status varchar(12) NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored')), matched_voucher_id bigint REFERENCES vouchers(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON bank_transactions(status, bank_ledger_id);
