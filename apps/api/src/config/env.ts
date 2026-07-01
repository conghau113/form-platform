import { z } from "zod";

/**
 * Environment contract for the API. Validated once at boot via `ConfigModule.forRoot({ validate })`
 * so a missing/malformed required var (e.g. `DATABASE_URL`) **fails fast** instead of surfacing as a
 * runtime error deep in a request. Production-hardening 1D. The AI vars (`AI_*`) keep their own
 * lenient parsing in `ai.config.ts` (they are optional BYOK fallbacks) — `.passthrough()` here lets
 * them (and any other process env) flow through untouched.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Postgres connection string (Prisma). Required — there is no usable default. */
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    /** HTTP port. */
    PORT: z.coerce.number().int().positive().default(3001),
    /** Comma-separated browser-origin allowlist for CORS (no trailing slash). */
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    /** Throttler window in milliseconds and the max requests per IP within it. */
    THROTTLE_TTL: z.coerce.number().int().positive().default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    /**
     * JWT signing secret (production-hardening 2A). Required — a missing/short secret is a real
     * auth vulnerability, so we fail fast rather than fall back to a guessable default.
     */
    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    /** Access-token lifetime, as accepted by `@nestjs/jwt` (`"7d"`, `"12h"`, or seconds). */
    JWT_EXPIRES_IN: z.string().default("7d"),
    /**
     * Optional bootstrap admin. When both are set and no user with `id = SEED_OWNER_ID` exists,
     * the app seeds that admin at boot so pre-2A `ownerId="local"` data stays owned/reachable.
     */
    AUTH_BOOTSTRAP_EMAIL: z.string().email().optional(),
    AUTH_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  })
  .passthrough();

export type AppEnv = z.infer<typeof envSchema>;

/**
 * `ConfigModule` validate hook: parse the raw env and throw a readable, aggregated error on the
 * first boot if anything required is missing or wrong-typed.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

/** Split the `CORS_ORIGINS` allowlist string into a clean list of origins. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
