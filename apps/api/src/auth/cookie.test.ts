import { describe, expect, it } from "vitest";
import { authCookieOptions, oauthStateCookieOptions, parseCookies } from "./cookie.js";

describe("parseCookies", () => {
  it("parses a multi-pair cookie header into a map", () => {
    expect(parseCookies("a=1; access_token=xyz; b=2")).toEqual({
      a: "1",
      access_token: "xyz",
      b: "2",
    });
  });

  it("URL-decodes values and trims whitespace", () => {
    expect(parseCookies("t=a%20b")).toEqual({ t: "a b" });
  });

  it("returns {} for a missing/blank header and skips malformed pairs", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
    expect(parseCookies("novalue; =orphan; k=v")).toEqual({ k: "v" });
  });

  it("joins an array header before parsing", () => {
    expect(parseCookies(["a=1", "b=2"])).toEqual({ a: "1", b: "2" });
  });
});

describe("authCookieOptions", () => {
  it("is HttpOnly + SameSite=Strict, with env-driven secure and the given maxAge", () => {
    expect(authCookieOptions(true, 1000)).toEqual({
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 1000,
    });
    expect(authCookieOptions(false, 5).secure).toBe(false);
  });
});

describe("oauthStateCookieOptions", () => {
  /**
   * `lax` is load-bearing, not a style choice: the OAuth callback arrives as a top-level
   * navigation from accounts.google.com, and a `strict` cookie is withheld on exactly that
   * request — the nonce would never come back and every sign-in would fail. This test exists so
   * that "unifying" it with authCookieOptions turns red instead of silently breaking sign-in.
   */
  it("is Lax (NOT Strict) + HttpOnly, at path / so clearCookie matches", () => {
    expect(oauthStateCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 600_000,
    });
    // `secure` still follows AUTH_COOKIE_SECURE like every other cookie here.
    expect(oauthStateCookieOptions(false).secure).toBe(false);
  });
});
