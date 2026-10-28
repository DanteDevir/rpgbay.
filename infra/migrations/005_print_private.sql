CREATE TABLE IF NOT EXISTS print_addresses (
 print_job_id uuid PRIMARY KEY REFERENCES print_jobs ON DELETE CASCADE,
 encrypted_address jsonb NOT NULL, key_id text NOT NULL, version integer NOT NULL DEFAULT 1,
 supplied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS print_address_links (
 id uuid PRIMARY KEY, print_job_id uuid NOT NULL REFERENCES print_jobs ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_address_link_job_idx ON print_address_links(print_job_id);
