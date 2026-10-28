CREATE TABLE IF NOT EXISTS table_betas (
 table_id uuid PRIMARY KEY REFERENCES tables ON DELETE CASCADE,
 beta_id uuid NOT NULL REFERENCES beta_programs,
 pinned_version_id uuid NOT NULL REFERENCES product_versions,
 linked_by text NOT NULL REFERENCES users,
 linked_at timestamptz NOT NULL DEFAULT now()
);
