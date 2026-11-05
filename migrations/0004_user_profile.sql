-- 0004_user_profile.sql
-- Store the QvaPay profile fields we are allowed to receive (scope: profile).
-- Email, phone and balance are never shared by the platform, so they are absent
-- by design, not by omission.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lastname text;

COMMENT ON COLUMN users.avatar IS 'QvaPay profile avatar URL, or null.';
COMMENT ON COLUMN users.lastname IS 'QvaPay profile last name, or null.';

COMMIT;
