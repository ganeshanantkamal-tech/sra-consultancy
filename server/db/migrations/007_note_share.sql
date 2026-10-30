-- Credit/debit notes get their own narration (separate from the GST reason) and a share link.
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS narration text NOT NULL DEFAULT '';
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_public_token_key ON credit_notes(public_token);
