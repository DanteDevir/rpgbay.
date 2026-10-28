CREATE TABLE IF NOT EXISTS storage_quotas (tenant_id text PRIMARY KEY, limit_bytes bigint NOT NULL CHECK(limit_bytes>0));
ALTER TABLE upload_intents ADD COLUMN product_id uuid REFERENCES products;
ALTER TABLE upload_intents ADD COLUMN version_label text;
ALTER TABLE upload_intents ADD COLUMN changelog text NOT NULL DEFAULT '';
