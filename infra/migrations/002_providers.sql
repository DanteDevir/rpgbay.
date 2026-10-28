CREATE TABLE IF NOT EXISTS oidc_flows (state text PRIMARY KEY, flow jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS payment_orders (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users, provider text NOT NULL CHECK(provider IN ('stripe','asaas')),
 idempotency_key text NOT NULL, total_cents integer NOT NULL CHECK(total_cents>0), currency text NOT NULL DEFAULT 'BRL',
 snapshot jsonb NOT NULL, state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','pending','paid','refunded','disputed','failed','requires_reconciliation')),
 external_id text, checkout_url text, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS order_external_id ON payment_orders(provider,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS payment_events (provider text NOT NULL, event_id text NOT NULL, order_id uuid REFERENCES payment_orders, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id));
CREATE TABLE IF NOT EXISTS financial_ledger (id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES payment_orders, reference text NOT NULL UNIQUE, postings jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Ledger is immutable: insert compensating entries'; END $$;
CREATE TRIGGER immutable_financial_ledger BEFORE UPDATE OR DELETE ON financial_ledger FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();
CREATE TABLE IF NOT EXISTS publisher_payment_accounts (publisher_id uuid PRIMARY KEY REFERENCES publishers, stripe_account_id text, asaas_wallet_id text, verified_at timestamptz);
CREATE TABLE IF NOT EXISTS upload_intents (id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users, tenant_id text NOT NULL, storage_class text NOT NULL, intent jsonb NOT NULL, state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','validating','published','rejected','expired')), reserved_bytes bigint NOT NULL CHECK(reserved_bytes>0), published_key text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS customer_payment_accounts (user_id text PRIMARY KEY REFERENCES users, asaas_customer_id text UNIQUE NOT NULL);
