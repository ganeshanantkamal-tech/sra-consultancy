CREATE TABLE IF NOT EXISTS estimates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, client_ledger_id bigint REFERENCES ledgers(id), enquiry_id bigint,
  title text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', building_type text NOT NULL DEFAULT '', problem_note text NOT NULL DEFAULT '',
  status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','analysed','approved','quoted','discarded')),
  is_nongst boolean NOT NULL DEFAULT true, place_of_supply_state_code varchar(2) NOT NULL DEFAULT '', contingency_pct numeric(5,2) NOT NULL DEFAULT 15,
  basis_line text NOT NULL DEFAULT '', important_note text NOT NULL DEFAULT '', assumptions jsonb NOT NULL DEFAULT '[]'::jsonb, exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_raw jsonb, quotation_id bigint REFERENCES quotations(id), generated_excel_path text, created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS estimate_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, estimate_id bigint NOT NULL REFERENCES estimates(id) ON DELETE CASCADE, position integer NOT NULL,
  description text NOT NULL, material bigint NOT NULL DEFAULT 0, labour bigint NOT NULL DEFAULT 0, other_cost bigint NOT NULL DEFAULT 0, low_rate bigint NOT NULL DEFAULT 0, high_rate bigint NOT NULL DEFAULT 0,
  rate_mode varchar(8) NOT NULL DEFAULT 'low' CHECK (rate_mode IN ('low','high','custom')), custom_rate bigint, selected_rate bigint NOT NULL DEFAULT 0,
  included boolean NOT NULL DEFAULT true, hsn_sac varchar(20) NOT NULL DEFAULT '', gst_rate_pct smallint NOT NULL DEFAULT 0, notes text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS estimate_photos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, estimate_id bigint NOT NULL REFERENCES estimates(id) ON DELETE CASCADE, pathname text NOT NULL, content_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS estimate_id bigint REFERENCES estimates(id);
CREATE INDEX IF NOT EXISTS estimates_client_idx ON estimates(client_ledger_id); CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON estimate_items(estimate_id);
