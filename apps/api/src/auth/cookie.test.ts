import { describe, expect, it } from "vitest";
import { authCookieOptions, parseCookies } from "./cookie.js";

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
