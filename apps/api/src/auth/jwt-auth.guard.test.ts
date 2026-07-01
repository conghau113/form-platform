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

  it("rejects a token signed with a different secret", async () => {
    const foreign = new JwtService({ secret: "some-other-secret-16chars" });
    const token = await foreign.signAsync({ sub: "user-1", email: "a@b.com" });
    const guard = new JwtAuthGuard(jwt, reflector(false));
    const { ctx } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
