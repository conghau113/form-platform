import { createHmac } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, OAUTH_STATE_COOKIE_NAME } from "../../auth/cookie.js";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

/**
 * The OAuth handlers are where this feature's *safety* lives — the CSRF double-submit, the
 * not-configured gate, and the rule that every failure funnels to one opaque `?error=oauth`. The
 * live smoke cannot drive the real Google leg, so these are asserted here instead (same approach
 * the repo already takes for the guards in `auth/function.guard.test.ts`).
 */

const APP_URL = "http://localhost:5173";

/** Captures what the controller did to the response, the way express would see it. */
function fakeRes() {
  return {
    cookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
    cleared: [] as string[],
    redirectedTo: null as string | null,
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name: string) {
      this.cleared.push(name);
    },
    redirect(url: string) {
      this.redirectedTo = url;
    },
  };
}

const JWT_SECRET = "test-secret-at-least-16-chars";

const config = {
  get: (key: string, fallback?: unknown) => {
    if (key === "JWT_SECRET") return JWT_SECRET;
    if (key === "APP_PUBLIC_URL") return APP_URL;
    if (key === "AUTH_COOKIE_SECURE") return false;
    if (key === "JWT_ACCESS_EXPIRES_IN") return "15m";
    if (key === "JWT_REFRESH_EXPIRES_IN") return "30d";
    return fallback;
  },
} as unknown as ConfigService;

/** The two AuthService calls the OAuth callback makes; everything else is out of scope here. */
function fakeAuthService() {
  return {
    exchangeGoogleCode: vi.fn(async () => ({ email: "g@example.com", emailVerified: true })),
    loginWithGoogle: vi.fn(async () => ({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "g@example.com", displayName: null, emailVerifiedAt: null },
    })),
  };
}

describe("AuthController — Google OAuth (A3)", () => {
  const jwt = new JwtService({ secret: JWT_SECRET });
  /** The key the controller derives for `state` — deliberately NOT the access-token key. */
  const stateSecret = createHmac("sha256", JWT_SECRET).update("oauth-state").digest("hex");
  let auth: ReturnType<typeof fakeAuthService>;
  let controller: AuthController;

  beforeEach(() => {
    auth = fakeAuthService();
    controller = new AuthController(auth as unknown as AuthService, config, jwt);
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  function configure() {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
  }

  /** Drive the start route and hand back the nonce + state it produced. */
  async function start() {
    const res = fakeRes();
    await controller.oauthStart(res);
    const state = new URL(res.redirectedTo ?? "").searchParams.get("state") ?? "";
    const nonce = res.cookies.find((c) => c.name === OAUTH_STATE_COOKIE_NAME)?.value ?? "";
    return { res, state, nonce };
  }

  const req = (cookie?: string) => ({ headers: { cookie } });

  describe("providers", () => {
    it("reports google:false until both credentials are configured", () => {
      expect(controller.providers()).toEqual({ google: false });
      configure();
      expect(controller.providers()).toEqual({ google: true });
    });
  });

  describe("oauthStart", () => {
    it("404s when Google is not configured — no half-working endpoint", async () => {
      await expect(controller.oauthStart(fakeRes())).rejects.toThrow(NotFoundException);
    });

    it("redirects to Google and stores the state nonce in a Lax cookie", async () => {
      configure();
      const { res, state, nonce } = await start();

      expect(res.redirectedTo).toContain("accounts.google.com");
      expect(nonce).toMatch(/^[a-f0-9]{32}$/);
      // Lax is load-bearing: a Strict cookie is withheld on the top-level navigation back
      // from Google, which would break every single sign-in.
      const cookie = res.cookies.find((c) => c.name === OAUTH_STATE_COOKIE_NAME);
      expect(cookie?.options.sameSite).toBe("lax");
      expect(cookie?.options.httpOnly).toBe(true);
      // The state token is tagged so it can never be mistaken for an access token…
      expect(
        await jwt.verifyAsync<{ typ: string; n: string }>(state, { secret: stateSecret }),
      ).toMatchObject({ typ: "oauth_state", n: nonce });
      // …and, more importantly, it is signed with a DIFFERENT key, so the global JwtAuthGuard
      // cannot be handed this publicly-visible token as a session.
      await expect(jwt.verifyAsync(state)).rejects.toThrow();
    });
  });

  describe("oauthCallback", () => {
    it("signs the user in and lands the session in HttpOnly cookies, not the URL", async () => {
      configure();
      const { state, nonce } = await start();
      const res = fakeRes();

      await controller.oauthCallback(
        req(`${OAUTH_STATE_COOKIE_NAME}=${nonce}`),
        res,
        "code",
        state,
      );

      expect(res.redirectedTo).toBe(`${APP_URL}/projects`);
      // No tokens in the redirect URL — they would leak into history, logs and Referer.
      expect(res.redirectedTo).not.toContain("access");
      expect(res.cookies.map((c) => c.name)).toContain(AUTH_COOKIE_NAME);
      expect(res.cleared).toContain(OAUTH_STATE_COOKIE_NAME);
    });

    // The CSRF check itself: without it, an attacker's callback URL signs a victim into the
    // ATTACKER's Google account, and everything the victim then creates lands in it.
    it("rejects a valid state whose nonce does not match the browser's cookie", async () => {
      configure();
      const { state } = await start();
      const res = fakeRes();

      await controller.oauthCallback(
        req(`${OAUTH_STATE_COOKIE_NAME}=some-other-nonce`),
        res,
        "code",
        state,
      );

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.cookies).toHaveLength(0);
      expect(auth.exchangeGoogleCode).not.toHaveBeenCalled();
    });

    it("rejects a valid state when the browser sends no state cookie at all", async () => {
      configure();
      const { state } = await start();
      const res = fakeRes();

      await controller.oauthCallback(req(undefined), res, "code", state);

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.cookies).toHaveLength(0);
    });

    // An access token must never work as a `state`, even though both are JWTs this app signs.
    it("rejects an access-token-shaped JWT presented as state", async () => {
      configure();
      const nonce = "deadbeefdeadbeefdeadbeefdeadbeef";
      const notAState = await jwt.signAsync({ sub: "u1", n: nonce });
      const res = fakeRes();

      await controller.oauthCallback(
        req(`${OAUTH_STATE_COOKIE_NAME}=${nonce}`),
        res,
        "code",
        notAState,
      );

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.cookies).toHaveLength(0);
    });

    it("rejects a forged/expired state", async () => {
      configure();
      const res = fakeRes();

      await controller.oauthCallback(req(`${OAUTH_STATE_COOKIE_NAME}=x`), res, "code", "garbage");

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.cookies).toHaveLength(0);
    });

    it("redirects with the same opaque error when Google sends no code (user cancelled)", async () => {
      configure();
      const { state, nonce } = await start();
      const res = fakeRes();

      await controller.oauthCallback(
        req(`${OAUTH_STATE_COOKIE_NAME}=${nonce}`),
        res,
        undefined,
        state,
      );

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.cookies).toHaveLength(0);
    });

    it("never leaks the underlying failure into the redirect URL", async () => {
      configure();
      auth.exchangeGoogleCode.mockRejectedValueOnce(new Error("invalid_grant: code already used"));
      const { state, nonce } = await start();
      const res = fakeRes();

      await controller.oauthCallback(
        req(`${OAUTH_STATE_COOKIE_NAME}=${nonce}`),
        res,
        "code",
        state,
      );

      expect(res.redirectedTo).toBe(`${APP_URL}/login?error=oauth`);
      expect(res.redirectedTo).not.toContain("invalid_grant");
    });

    // The nonce is spent whatever happens, so a failed attempt cannot be retried against it.
    it("always clears the state cookie, success or failure", async () => {
      configure();
      const res = fakeRes();

      await controller.oauthCallback(req(`${OAUTH_STATE_COOKIE_NAME}=x`), res, "code", "garbage");

      expect(res.cleared).toContain(OAUTH_STATE_COOKIE_NAME);
    });
  });
});
