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
