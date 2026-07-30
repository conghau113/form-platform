-- Product-roadmap A3 (Google sign-in): an account that only ever signs in through an external
-- provider has no password. Pure loosening — every existing row stays valid, so no backfill.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
