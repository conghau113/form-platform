import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { RefreshTokenRepo } from "../persistence/repositories/refresh-token.repo.js";
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

/**
 * RefreshTokenRepo stub for the P5 session check. `live` lists the session ids still signed in;
 * `calls` records every lookup so a test can prove the store was (or was not) consulted. Extends
 * the real abstract class rather than casting, so a future signature change fails to compile here
 * instead of quietly passing a stale stub.
 */
class StubRefreshTokenRepo extends RefreshTokenRepo {
  readonly calls: { sessionId: string; userId: string }[] = [];
  constructor(private readonly live: string[] = []) {
    super();
  }
  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    this.calls.push({ sessionId, userId });
    return this.live.includes(sessionId);
  }
  create(): never {
    throw new Error("not used — the guard only reads sessions");
  }
  findByHash(): never {
    throw new Error("not used — the guard only reads sessions");
  }
  revoke(): never {
    throw new Error("not used — the guard only reads sessions");
  }
  revokeSession(): never {
    throw new Error("not used — the guard only reads sessions");
  }

  revokeAllForUser(): never {
    throw new Error("not used — the guard only reads sessions");
  }
}

function sessions(live: string[] = []): StubRefreshTokenRepo {
  return new StubRefreshTokenRepo(live);
}

/** A token for a session that is signed in — the ordinary happy path. */
const LIVE_SID = "sid-live";

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
  it("lets a @Public route through with no token — without touching the session store", async () => {
    const store = sessions();
    const guard = new JwtAuthGuard(jwt, reflector(true), store);
    const { ctx } = context({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(store.calls).toEqual([]);
  });

  it("accepts a valid bearer token and stashes the verified payload on req.user", async () => {
    const token = await jwt.signAsync({ sub: "user-1", email: "a@b.com", sid: LIVE_SID });
    const store = sessions([LIVE_SID]);
    const guard = new JwtAuthGuard(jwt, reflector(false), store);
    const { ctx, req } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "user-1", email: "a@b.com", sid: LIVE_SID });
    // The session is looked up *for this subject*, so a session id can never be honoured on behalf
    // of somebody else even if the two claims were ever to disagree.
    expect(store.calls).toEqual([{ sessionId: LIVE_SID, userId: "user-1" }]);
  });

  it("rejects a missing or non-bearer Authorization header", async () => {
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
    await expect(guard.canActivate(context({}).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(context({ authorization: "Basic abc" }).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts a valid token from the access_token cookie (browser path)", async () => {
    const token = await jwt.signAsync({ sub: "user-2", email: "c@d.com", sid: LIVE_SID });
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
    const { ctx, req } = context({ cookie: `foo=bar; access_token=${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "user-2", email: "c@d.com", sid: LIVE_SID });
  });

  it("prefers the cookie over a (stale) bearer header", async () => {
    const cookieToken = await jwt.signAsync({
      sub: "cookie-user",
      email: "cookie@x.com",
      sid: LIVE_SID,
    });
    const bearerToken = await jwt.signAsync({
      sub: "bearer-user",
      email: "bearer@x.com",
      sid: LIVE_SID,
    });
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
    const { ctx, req } = context({
      cookie: `access_token=${cookieToken}`,
      authorization: `Bearer ${bearerToken}`,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.sub).toBe("cookie-user");
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = new JwtService({ secret: "some-other-secret-16chars" });
    const token = await foreign.signAsync({ sub: "user-1", email: "a@b.com", sid: LIVE_SID });
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
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
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
    for (const payload of [
      { typ: "oauth_state", n: "abc" },
      { sub: "", sid: LIVE_SID },
      { sub: "   ", sid: LIVE_SID },
    ]) {
      const token = await jwt.signAsync(payload);
      const { ctx, req } = context({ authorization: `Bearer ${token}` });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(req.user).toBeUndefined();
    }
  });

  /**
   * The P5 revocation check. A signature stays valid for the token's full 15 minutes, so this
   * lookup is the only thing that makes logout take effect now rather than then.
   */
  it("rejects a perfectly valid token whose session has been logged out", async () => {
    const token = await jwt.signAsync({ sub: "user-3", email: "e@f.com", sid: "sid-revoked" });
    const guard = new JwtAuthGuard(jwt, reflector(false), sessions([LIVE_SID]));
    const { ctx, req } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  /** Pre-P5 tokens carry no `sid`; no session can vouch for them, so they must not authenticate. */
  it("rejects a token with no sid, and does not ask the session store about it", async () => {
    const store = sessions([LIVE_SID]);
    const guard = new JwtAuthGuard(jwt, reflector(false), store);
    for (const payload of [
      { sub: "user-4", email: "g@h.com" },
      { sub: "user-4", email: "g@h.com", sid: "" },
      { sub: "user-4", email: "g@h.com", sid: "   " },
    ]) {
      const token = await jwt.signAsync(payload);
      const { ctx, req } = context({ authorization: `Bearer ${token}` });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(req.user).toBeUndefined();
    }
    expect(store.calls).toEqual([]);
  });

  /**
   * A store outage is an infrastructure fault, not a bad credential: it must not be laundered into
   * a 401 that tells the client to throw its (perfectly good) session away.
   */
  it("lets a session-store failure surface instead of turning it into a 401", async () => {
    const token = await jwt.signAsync({ sub: "user-5", email: "i@j.com", sid: LIVE_SID });
    class BrokenRepo extends StubRefreshTokenRepo {
      override async isSessionActive(): Promise<boolean> {
        throw new Error("database is down");
      }
    }
    const guard = new JwtAuthGuard(jwt, reflector(false), new BrokenRepo());
    const { ctx } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow("database is down");
  });
});
