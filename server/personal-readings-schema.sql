ALTER TABLE ktts_users ADD COLUMN IF NOT EXISTS paid_member_until BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ktts_tarot_wallets (
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 user_id BIGINT NOT NULL REFERENCES ktts_users(id),
 balance INTEGER NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 15),
 updated_at BIGINT NOT NULL,
 PRIMARY KEY(environment,user_id)
);
CREATE TABLE IF NOT EXISTS ktts_tarot_months (
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 payment_id TEXT NOT NULL,
 subscription_id TEXT NOT NULL,
 user_id BIGINT NOT NULL REFERENCES ktts_users(id),
 period_start BIGINT NOT NULL,
 period_end BIGINT NOT NULL CHECK(period_end>period_start),
 amount_cents INTEGER NOT NULL CHECK(amount_cents=1111),
 credited INTEGER NOT NULL CHECK(credited IN (0,1)),
 created_at BIGINT NOT NULL,
 PRIMARY KEY(environment,payment_id),
 UNIQUE(environment,subscription_id,period_start)
);
CREATE TABLE IF NOT EXISTS ktts_personal_readings (
 id UUID PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 user_id BIGINT NOT NULL REFERENCES ktts_users(id),
 nonce UUID NOT NULL,
 contact_email TEXT NOT NULL,
 question TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('REQUESTED','IN_PROGRESS','READY')),
 response_text TEXT,
 created_at BIGINT NOT NULL,
 started_at BIGINT,
 completed_at BIGINT,
 UNIQUE(environment,user_id,nonce),
 CHECK((status='READY' AND response_text IS NOT NULL AND completed_at IS NOT NULL) OR (status<>'READY' AND response_text IS NULL))
);
CREATE INDEX IF NOT EXISTS ktts_personal_reading_queue ON ktts_personal_readings(environment,status,created_at);
ALTER TABLE ktts_tarot_months ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND 1111);
ALTER TABLE ktts_tarot_months ADD COLUMN IF NOT EXISTS reversed_at BIGINT;
ALTER TABLE ktts_tarot_months ADD COLUMN IF NOT EXISTS payment_time BIGINT;
ALTER TABLE ktts_tarot_months ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(payment_status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','REVERSED'));
ALTER TABLE ktts_personal_readings ADD COLUMN IF NOT EXISTS funding_payment_id TEXT;
ALTER TABLE ktts_personal_readings ADD COLUMN IF NOT EXISTS payment_review BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS ktts_reading_credits (
 environment TEXT NOT NULL,
 payment_id TEXT NOT NULL,
 user_id BIGINT NOT NULL REFERENCES ktts_users(id),
 state TEXT NOT NULL CHECK(state IN ('AVAILABLE','SPENT','VOID')),
 request_id UUID UNIQUE REFERENCES ktts_personal_readings(id),
 created_at BIGINT NOT NULL,
 PRIMARY KEY(environment,payment_id),
 FOREIGN KEY(environment,payment_id) REFERENCES ktts_tarot_months(environment,payment_id)
);
CREATE INDEX IF NOT EXISTS ktts_available_reading_credits ON ktts_reading_credits(environment,user_id,state,created_at);
-- Existing paid credits must be reviewed rather than assigned to invented payment evidence.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ktts_tarot_wallets w WHERE w.balance<>(SELECT COUNT(*) FROM ktts_reading_credits c WHERE c.environment=w.environment AND c.user_id=w.user_id AND c.state='AVAILABLE'))
 THEN RAISE EXCEPTION 'Review existing reading credits before migrating their payment provenance'; END IF;
END $$;
