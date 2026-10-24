CREATE TABLE IF NOT EXISTS ktts_stock (
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 sku TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('ready_stock','made_to_order')),
 on_hand INTEGER,
 reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
 updated_at BIGINT NOT NULL,
 CHECK((mode='ready_stock' AND on_hand IS NOT NULL AND on_hand>=reserved) OR (mode='made_to_order' AND on_hand IS NULL)),
 PRIMARY KEY(environment,sku)
);
CREATE TABLE IF NOT EXISTS ktts_orders (
 id UUID PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 session_hash TEXT NOT NULL,
 nonce UUID NOT NULL,
 fingerprint TEXT NOT NULL,
 quote_json JSONB NOT NULL,
 customer_json JSONB NOT NULL,
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 status TEXT NOT NULL CHECK(status IN ('RESERVED','PAID','FULFILLED','CANCELED','EXPIRED','PAYMENT_REVIEW')),
 paypal_id TEXT,
 capture_id TEXT,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 paid_at BIGINT,
 fulfilled_at BIGINT,
 fulfillment_json JSONB,
 UNIQUE(environment,session_hash,nonce),
 UNIQUE(environment,paypal_id),
 UNIQUE(environment,capture_id),
 UNIQUE(id,environment)
);
CREATE INDEX IF NOT EXISTS ktts_order_expiry ON ktts_orders(status,expires_at);
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS payment_lease_token UUID;
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS payment_lease_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS payment_lease_phase TEXT;
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID','COMPLETED','PARTIALLY_REFUNDED','REFUNDED','REVERSED','REFUND_PENDING'));
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents>=0);
ALTER TABLE ktts_orders ADD COLUMN IF NOT EXISTS payment_review_reason TEXT;
UPDATE ktts_orders SET payment_status='COMPLETED' WHERE capture_id IS NOT NULL AND payment_status='UNPAID';
CREATE TABLE IF NOT EXISTS ktts_order_lines (
 order_id UUID NOT NULL,
 environment TEXT NOT NULL,
 sku TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9),
 reservation_state TEXT NOT NULL CHECK(reservation_state IN ('HELD','COMMITTED','RELEASED')),
 PRIMARY KEY(order_id,sku),
 FOREIGN KEY(order_id,environment) REFERENCES ktts_orders(id,environment),
 FOREIGN KEY(environment,sku) REFERENCES ktts_stock(environment,sku)
);
CREATE TABLE IF NOT EXISTS ktts_order_events (
 id BIGSERIAL PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES ktts_orders(id),
 event_type TEXT NOT NULL,
 detail_json JSONB NOT NULL,
 created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ktts_payment_events (
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 event_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 event_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('VERIFIED','PROCESSED')),
 received_at BIGINT NOT NULL,
 processed_at BIGINT,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(environment,event_id)
);
CREATE TABLE IF NOT EXISTS ktts_order_refunds (
 environment TEXT NOT NULL,
 refund_id TEXT NOT NULL,
 order_id UUID NOT NULL,
 capture_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 status TEXT NOT NULL CHECK(status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
 updated_at BIGINT NOT NULL,
 PRIMARY KEY(environment,refund_id),
 FOREIGN KEY(order_id,environment) REFERENCES ktts_orders(id,environment)
);
CREATE TABLE IF NOT EXISTS ktts_refund_attempts (
 id UUID PRIMARY KEY,
 environment TEXT NOT NULL,
 order_id UUID NOT NULL,
 nonce UUID NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 refund_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('OPEN','BOUND','DONE')),
 created_at BIGINT NOT NULL,
 lease_token UUID,
 lease_until BIGINT NOT NULL DEFAULT 0,
 UNIQUE(environment,order_id,nonce),
 FOREIGN KEY(order_id,environment) REFERENCES ktts_orders(id,environment)
);
CREATE UNIQUE INDEX IF NOT EXISTS ktts_one_open_refund ON ktts_refund_attempts(environment,order_id) WHERE state IN ('OPEN','BOUND');
CREATE TABLE IF NOT EXISTS ktts_mail_outbox (
 id BIGSERIAL PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 event_key TEXT NOT NULL,
 message_type TEXT NOT NULL CHECK(message_type IN ('PAID','SHIPMENT','PAYMENT_ADJUSTED')),
 recipient TEXT NOT NULL,
 payload_json JSONB NOT NULL,
 created_at BIGINT NOT NULL,
 next_attempt_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at BIGINT,
 lease_token UUID,
 lease_until BIGINT NOT NULL DEFAULT 0,
 last_error TEXT,
 UNIQUE(environment,event_key)
);
CREATE INDEX IF NOT EXISTS ktts_mail_pending ON ktts_mail_outbox(environment,next_attempt_at) WHERE sent_at IS NULL;
