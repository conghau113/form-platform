import { z } from "zod";

/**
 * Environment contract for the API. Validated once at boot via `ConfigModule.forRoot({ validate })`
 * so a missing/malformed required var (e.g. `DATABASE_URL`) **fails fast** instead of surfacing as a
 * runtime error deep in a request. Production-hardening 1D. The AI vars (`AI_*`) keep their own
 * lenient parsing in `ai.config.ts` (they are optional BYOK fallbacks) — `.passthrough()` here lets
 * them (and any other process env) flow through untouched.
 */
/**
 * Treat a **present-but-empty** variable as absent, so the wrapped schema's `.default()` applies.
 * Compose (`FOO: ${FOO:-}`) and hand-edited `.env` files both produce `FOO=""`, which would
 * otherwise fail `coerce.number().positive()` (`Number("") === 0`) or hand an empty string to code
 * expecting the default — a boot-time crash-loop for something that is meant to be optional.
 */
function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema);
}

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
    /**
     * Access-token lifetime (production-hardening A1), as accepted by `@nestjs/jwt` (`"15m"`,
     * `"12h"`, or seconds). Deliberately short — the refresh token below extends the session so a
     * leaked access token expires fast.
     */
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    /**
     * Refresh-token lifetime (A1). Long-lived, rotating, revocable; sets both the DB row's
     * `expiresAt` and the `refresh_token` cookie `maxAge`, so the two expire together.
     */
    JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
    /**
     * Set the `Secure` flag on the auth cookie (production-hardening 2B). Keep `false` for local
     * plain-HTTP dev; set `true` in production so the browser only sends the cookie over HTTPS.
     */
    AUTH_COOKIE_SECURE: z
      .preprocess(
        (v) => (typeof v === "string" ? ["1", "true"].includes(v.toLowerCase()) : v),
        z.boolean(),
      )
      .default(false),
    /**
     * Optional bootstrap admin. When both are set and no user with `id = SEED_OWNER_ID` exists,
     * the app seeds that admin at boot so pre-2A `ownerId="local"` data stays owned/reachable.
     */
    AUTH_BOOTSTRAP_EMAIL: z.string().email().optional(),
    AUTH_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
    /**
     * SMTP transport (product-roadmap A2) — **optional by design** (roadmap principle #3: external
     * dependencies must be configurable, never required). With `SMTP_HOST` unset the API runs in
     * log mode: `MailService` writes each message (link included) to the logger instead of sending.
     * Dev/compose points at Mailpit (`SMTP_HOST=mailpit`, port 1025, web UI on 8025).
     */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: emptyAsUndefined(z.coerce.number().int().positive().default(1025)),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z
      .preprocess(
        (v) => (typeof v === "string" ? ["1", "true"].includes(v.toLowerCase()) : v),
        z.boolean(),
      )
      .default(false),
    /** Envelope sender for every transactional email. */
    MAIL_FROM: emptyAsUndefined(z.string().default("Form Platform <no-reply@form-platform.local>")),
    /**
     * Public origin of the SPA — the base of the verify/reset links we email out. Must be the URL
     * the *user's browser* reaches (not the container host), e.g. `http://localhost:8080` in compose.
     */
    APP_PUBLIC_URL: emptyAsUndefined(
      z
        .string()
        .url()
        // `new URL()` (and so Zod's .url()) happily accepts "localhost:5173" — a scheme-less value
        // would produce unusable links in email, so require a real http(s) origin.
        .startsWith("http", "APP_PUBLIC_URL must start with http:// or https://")
        .default("http://localhost:5173"),
    ),
    /** Lifetimes of the one-time email tokens (A2), same duration syntax as the JWT vars. */
    AUTH_VERIFY_TOKEN_EXPIRES_IN: emptyAsUndefined(z.string().default("24h")),
    AUTH_RESET_TOKEN_EXPIRES_IN: emptyAsUndefined(z.string().default("1h")),
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

const DURATION_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Convert a JWT-style lifetime (`"7d"`, `"12h"`, `"3600s"`, or a bare number = seconds) to
 * milliseconds — used to give each auth cookie the same `maxAge` as its token. Unparseable input
 * falls back to 7 days rather than throwing at request time.
 */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) return 7 * DURATION_UNIT_MS.d;
  // A bare number follows the JWT convention (seconds); a suffix uses that unit.
  return Number(match[1]) * DURATION_UNIT_MS[match[2] ?? "s"];
}
