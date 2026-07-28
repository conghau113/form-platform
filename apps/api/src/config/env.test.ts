import { describe, expect, it } from "vitest";
import { durationToMs, parseCorsOrigins, validateEnv } from "./env.js";

/**
 * Pins the env contract enforced at boot (production-hardening 1D). `validateEnv` is the
 * `ConfigModule` validate hook — a missing required var must throw (fail-fast) and optional
 * vars must take their defaults + coerce numeric strings.
 */
describe("validateEnv", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
    JWT_SECRET: "test-secret-at-least-16-chars",
  };

  it("fails fast when DATABASE_URL is missing", () => {
    expect(() => validateEnv({ JWT_SECRET: base.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it("fails fast when JWT_SECRET is missing or too short", () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });

  it("applies defaults for PORT, CORS_ORIGINS, throttle window, JWT token lifetimes when omitted", () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toBe("http://localhost:5173");
    expect(env.THROTTLE_TTL).toBe(60_000);
    expect(env.THROTTLE_LIMIT).toBe(120);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe("15m");
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe("30d");
    expect(env.NODE_ENV).toBe("development");
  });

  it("treats present-but-empty mail vars as absent (compose `${FOO:-}` must not crash boot)", () => {
    const env = validateEnv({
      ...base,
      SMTP_PORT: "",
      MAIL_FROM: "",
      APP_PUBLIC_URL: "",
      AUTH_VERIFY_TOKEN_EXPIRES_IN: "",
      AUTH_RESET_TOKEN_EXPIRES_IN: "",
    });
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.MAIL_FROM).toBe("Form Platform <no-reply@form-platform.local>");
    expect(env.APP_PUBLIC_URL).toBe("http://localhost:5173");
    expect(env.AUTH_VERIFY_TOKEN_EXPIRES_IN).toBe("24h");
    expect(env.AUTH_RESET_TOKEN_EXPIRES_IN).toBe("1h");
  });

  it("rejects an APP_PUBLIC_URL that is not a URL (emailed links must be absolute)", () => {
    expect(() => validateEnv({ ...base, APP_PUBLIC_URL: "localhost:5173" })).toThrow(
      /APP_PUBLIC_URL/,
    );
  });

  it("coerces numeric strings to numbers", () => {
    const env = validateEnv({ ...base, PORT: "4000", THROTTLE_LIMIT: "50" });
    expect(env.PORT).toBe(4000);
    expect(env.THROTTLE_LIMIT).toBe(50);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => validateEnv({ ...base, PORT: "not-a-port" })).toThrow(/PORT/);
  });

  it("passes unknown vars (e.g. AI_*) through untouched", () => {
    const env = validateEnv({ ...base, AI_PROVIDER: "anthropic" }) as Record<string, unknown>;
    expect(env.AI_PROVIDER).toBe("anthropic");
  });

  it("parses AUTH_COOKIE_SECURE from a string flag (default false)", () => {
    expect(validateEnv({ ...base }).AUTH_COOKIE_SECURE).toBe(false);
    expect(validateEnv({ ...base, AUTH_COOKIE_SECURE: "true" }).AUTH_COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...base, AUTH_COOKIE_SECURE: "1" }).AUTH_COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...base, AUTH_COOKIE_SECURE: "false" }).AUTH_COOKIE_SECURE).toBe(false);
  });
});

describe("durationToMs", () => {
  it("converts unit suffixes to milliseconds", () => {
    expect(durationToMs("7d")).toBe(7 * 86_400_000);
    expect(durationToMs("12h")).toBe(12 * 3_600_000);
    expect(durationToMs("30m")).toBe(30 * 60_000);
    expect(durationToMs("45s")).toBe(45_000);
    expect(durationToMs("500ms")).toBe(500);
  });

  it("treats a bare number as seconds (JWT convention)", () => {
    expect(durationToMs("3600")).toBe(3_600_000);
  });

  it("falls back to 7 days on unparseable input", () => {
    expect(durationToMs("not-a-duration")).toBe(7 * 86_400_000);
  });
});

describe("parseCorsOrigins", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseCorsOrigins("http://a.com, http://b.com ,")).toEqual([
      "http://a.com",
      "http://b.com",
    ]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseCorsOrigins("")).toEqual([]);
  });
});
