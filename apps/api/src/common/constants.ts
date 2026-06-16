/**
 * Placeholder owner for everything written before auth exists. W1 (minimal session/JWT auth)
 * replaces this with the real authenticated owner id; the schema is owner-aware from day one
 * so that swap never needs a destructive migration.
 */
export const SEED_OWNER_ID = "local";
