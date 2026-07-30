import { describe, expect, it } from "vitest";
import {
  decodeIdToken,
  GOOGLE_AUTH_ENDPOINT,
  googleAuthUrl,
  googleConfig,
} from "./google-oauth.js";

const CONFIGURED = {
  GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
  APP_PUBLIC_URL: "https://forms.example.com",
} as NodeJS.ProcessEnv;

/** Build an unsigned id_token — the payload is all `decodeIdToken` ever looks at. */
function idToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ iss: "accounts.google.com", ...claims })).toString(
    "base64url",
  );
  return `header.${body}.signature`;
}

describe("googleConfig", () => {
  it("is null unless BOTH credentials are present", () => {
    expect(googleConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "cid" } as NodeJS.ProcessEnv)).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_SECRET: "s" } as NodeJS.ProcessEnv)).toBeNull();
    // A blank value counts as absent — compose writes `FOO=` for an unset variable.
    expect(
      googleConfig({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "s" } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("derives redirectUri from APP_PUBLIC_URL so only two values must be configured", () => {
    expect(googleConfig(CONFIGURED)?.redirectUri).toBe(
      "https://forms.example.com/api/auth/oauth/google/callback",
    );
  });

  it("tolerates a trailing slash on APP_PUBLIC_URL", () => {
    const cfg = googleConfig({ ...CONFIGURED, APP_PUBLIC_URL: "https://forms.example.com/" });
    expect(cfg?.redirectUri).toBe("https://forms.example.com/api/auth/oauth/google/callback");
  });

  it("lets GOOGLE_REDIRECT_URI override the derived default (API on its own domain)", () => {
    const cfg = googleConfig({ ...CONFIGURED, GOOGLE_REDIRECT_URI: "https://api.example.com/cb" });
    expect(cfg?.redirectUri).toBe("https://api.example.com/cb");
  });
});

describe("googleAuthUrl", () => {
  it("carries every parameter Google needs, including the state nonce", () => {
    const cfg = googleConfig(CONFIGURED);
    if (!cfg) throw new Error("expected a config");
    const url = new URL(googleAuthUrl(cfg, "state-token"));

    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_ENDPOINT);
    expect(url.searchParams.get("client_id")).toBe(CONFIGURED.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    // `openid` + `email` are what make an id_token with a verified address come back at all.
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
  });
});

describe("decodeIdToken", () => {
  const aud = "cid.apps.googleusercontent.com";

  it("reads email / email_verified / name", () => {
    const token = idToken({
      aud,
      email: "  Alice@Example.com ",
      email_verified: true,
      name: "Alice",
    });
    expect(decodeIdToken(token, aud)).toEqual({
      email: "Alice@Example.com",
      emailVerified: true,
      name: "Alice",
    });
  });

  it("reports email_verified false rather than assuming it", () => {
    expect(decodeIdToken(idToken({ aud, email: "a@b.c" }), aud).emailVerified).toBe(false);
    expect(
      decodeIdToken(idToken({ aud, email: "a@b.c", email_verified: "true" }), aud).emailVerified,
    ).toBe(false);
  });

  it("rejects a token minted for a different client", () => {
    expect(() => decodeIdToken(idToken({ aud: "someone-else", email: "a@b.c" }), aud)).toThrow(
      /audience/i,
    );
  });

  it("rejects a token that did not come from Google", () => {
    expect(() =>
      decodeIdToken(idToken({ iss: "evil.example.com", aud, email: "a@b.c" }), aud),
    ).toThrow(/issuer/i);
  });

  it("rejects a token with no email", () => {
    expect(() => decodeIdToken(idToken({ aud, name: "Alice" }), aud)).toThrow(/email/i);
  });

  it("rejects garbage instead of returning half an identity", () => {
    expect(() => decodeIdToken("not-a-jwt", aud)).toThrow(/malformed/i);
    expect(() => decodeIdToken("a.!!!.c", aud)).toThrow(/malformed/i);
  });
});
