ALTER TABLE ktts_users ADD COLUMN IF NOT EXISTS recovery_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ktts_recovery_email_unique ON ktts_users(recovery_email) WHERE recovery_email IS NOT NULL;
CREATE TABLE IF NOT EXISTS ktts_account_challenges (
 token_hash TEXT PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES ktts_users(id) ON DELETE CASCADE,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 purpose TEXT NOT NULL CHECK(purpose IN ('VERIFY','RESET')),
 email TEXT NOT NULL,
 password_marker TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ktts_account_challenge_user ON ktts_account_challenges(user_id,environment);
CREATE TABLE IF NOT EXISTS ktts_account_mail (
 id UUID PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 recipient TEXT NOT NULL,
 encrypted_payload TEXT NOT NULL,
 challenge_hash TEXT,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 next_attempt_at BIGINT NOT NULL,
 state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENT','EXPIRED')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token UUID,
 lease_until BIGINT NOT NULL DEFAULT 0,
 sent_at BIGINT
);
CREATE INDEX IF NOT EXISTS ktts_account_mail_due ON ktts_account_mail(environment,next_attempt_at) WHERE state='QUEUED';
