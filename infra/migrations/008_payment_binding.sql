ALTER TABLE payment_orders ADD COLUMN provider_payment_id text;
CREATE UNIQUE INDEX payment_canonical_id ON payment_orders(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL;
