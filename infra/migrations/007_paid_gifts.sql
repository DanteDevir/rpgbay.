ALTER TABLE payment_orders ADD COLUMN gift_id uuid UNIQUE REFERENCES gifts;
