CREATE TABLE IF NOT EXISTS ktts_subscriptions (
 id UUID PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 user_id BIGINT NOT NULL REFERENCES ktts_users(id),
 nonce UUID NOT NULL,
 plan_id TEXT NOT NULL,
 terms_version TEXT NOT NULL,
 paypal_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('CREATING','APPROVAL_PENDING','APPROVED','ACTIVE','SUSPENDED','CANCELLED','EXPIRED')),
 created_at BIGINT NOT NULL,
 provider_updated_at BIGINT NOT NULL DEFAULT 0,
 last_verified_at BIGINT NOT NULL DEFAULT 0,
 reconciled_through BIGINT NOT NULL DEFAULT 0,
 billing_anchor BIGINT,
 next_billing_at BIGINT,
 failed_payments INTEGER NOT NULL DEFAULT 0,
 cancellation_requested_at BIGINT,
 cancelled_at BIGINT,
 lease_token UUID,
 lease_until BIGINT NOT NULL DEFAULT 0,
 UNIQUE(environment,paypal_id),
 UNIQUE(environment,user_id,nonce)
);
CREATE UNIQUE INDEX IF NOT EXISTS ktts_one_open_subscription ON ktts_subscriptions(environment,user_id) WHERE status NOT IN ('CANCELLED','EXPIRED');
CREATE INDEX IF NOT EXISTS ktts_subscription_reconcile ON ktts_subscriptions(environment,last_verified_at);
