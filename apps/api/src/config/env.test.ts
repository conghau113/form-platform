import { describe, expect, it } from "vitest";
import { parseCorsOrigins, validateEnv } from "./env.js";

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

  it("applies defaults for PORT, CORS_ORIGINS, throttle window, JWT_EXPIRES_IN when omitted", () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toBe("http://localhost:5173");
    expect(env.THROTTLE_TTL).toBe(60_000);
    expect(env.THROTTLE_LIMIT).toBe(120);
    expect(env.JWT_EXPIRES_IN).toBe("7d");
    expect(env.NODE_ENV).toBe("development");
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
