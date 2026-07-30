import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import type { AuthedRequest } from "./jwt-payload.js";

const jwt = new JwtService({
  secret: "test-secret-at-least-16-chars",
  signOptions: { expiresIn: "1h" },
});

/** Reflector stub: returns the desired `isPublic` verdict. */
function reflector(isPublic: boolean): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

/** ExecutionContext stub around a request with the given headers; returns the req to inspect. */
function context(headers: Record<string, string | undefined>): {
  ctx: ExecutionContext;
  req: AuthedRequest;
} {
  const req: AuthedRequest = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe("JwtAuthGuard", () => {
  it("lets a @Public route through with no token", async () => {
    const guard = new JwtAuthGuard(jwt, reflector(true));
    const { ctx } = context({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("accepts a valid bearer token and stashes the verified payload on req.user", async () => {
    const token = await jwt.signAsync({ sub: "user-1", email: "a@b.com" });
    const guard = new JwtAuthGuard(jwt, reflector(false));
    const { ctx, req } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "user-1", email: "a@b.com" });
  });

  it("rejects a missing or non-bearer Authorization header", async () => {
    const guard = new JwtAuthGuard(jwt, reflector(false));
    await expect(guard.canActivate(context({}).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(context({ authorization: "Basic abc" }).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts a valid token from the access_token cookie (browser path)", async () => {
    const token = await jwt.signAsync({ sub: "user-2", email: "c@d.com" });
    const guard = new JwtAuthGuard(jwt, reflector(false));
    const { ctx, req } = context({ cookie: `foo=bar; access_token=${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "user-2", email: "c@d.com" });
  });

  it("prefers the cookie over a (stale) bearer header", async () => {
    const cookieToken = await jwt.signAsync({ sub: "cookie-user", email: "cookie@x.com" });
    const bearerToken = await jwt.signAsync({ sub: "bearer-user", email: "bearer@x.com" });
    const guard = new JwtAuthGuard(jwt, reflector(false));
    const { ctx, req } = context({
      cookie: `access_token=${cookieToken}`,
      authorization: `Bearer ${bearerToken}`,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.sub).toBe("cookie-user");
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = new JwtService({ secret: "some-other-secret-16chars" });
    const token = await foreign.signAsync({ sub: "user-1", email: "a@b.com" });
    const guard = new JwtAuthGuard(jwt, reflector(false));
    const { ctx } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * A correct signature does not make a token an access token. This app signs other JWTs (A3's
   * OAuth `state`, which is publicly visible in URLs and history); those are key-separated, but a
   * subject-less token must be refused here too — otherwise any handler that never reads `sub`
   * (e.g. the AI routes) would happily treat it as a session.
   */
  it("rejects a correctly-signed token that names no subject", async () => {
    const guard = new JwtAuthGuard(jwt, reflector(false));
    for (const payload of [{ typ: "oauth_state", n: "abc" }, { sub: "" }, { sub: "   " }]) {
      const token = await jwt.signAsync(payload);
      const { ctx, req } = context({ authorization: `Bearer ${token}` });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(req.user).toBeUndefined();
    }
  });
});
