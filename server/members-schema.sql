CREATE TABLE IF NOT EXISTS ktts_users (
 id BIGSERIAL PRIMARY KEY,
 username TEXT UNIQUE NOT NULL,
 salt TEXT NOT NULL,
 password_hash BYTEA NOT NULL,
 member_until BIGINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL
);
ALTER TABLE ktts_users ADD COLUMN IF NOT EXISTS store_owner_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ktts_users ADD COLUMN IF NOT EXISTS paid_member_until BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ktts_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES ktts_users(id) ON DELETE CASCADE,
 expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ktts_session_expiry ON ktts_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ktts_invitations (
 code_hash TEXT PRIMARY KEY,
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 3660),
 uses_left INTEGER NOT NULL CHECK(uses_left >= 0),
 expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ktts_auth_attempts (
 bucket_key TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 until_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ktts_attempt_expiry ON ktts_auth_attempts(until_ms);

CREATE TABLE IF NOT EXISTS ktts_sandbox_orders (
 local_id TEXT PRIMARY KEY,
 session_hash TEXT NOT NULL,
 cart_hash TEXT NOT NULL,
 total_cents INTEGER NOT NULL CHECK(total_cents > 0),
 items_json TEXT NOT NULL,
 paypal_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('CREATING','CREATED','COMPLETED')),
 capture_id TEXT,
 created_at BIGINT NOT NULL,
 lease_token TEXT,
 lease_until BIGINT NOT NULL DEFAULT 0
);

