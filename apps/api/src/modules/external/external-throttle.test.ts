import "reflect-metadata";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerException, ThrottlerGuard } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";
import { BoundedThrottlerStorage } from "../../common/throttler-storage.js";
import { ProjectsController } from "../projects/projects.controller.js";
import { API_KEY_HEADER, hashApiKey } from "./api-key.guard.js";
import { ExternalController } from "./external.controller.js";
import { ExternalModule } from "./external.module.js";
import { apiKeyTracker, buildThrottlers, isKeyedExternalRequest } from "./external-throttle.js";

/**
 * P6 / EVN Q9. These run the **real** `ThrottlerGuard` against the real in-memory storage, because
 * the claim being made is about counting, not about the shape of a config object: a test that only
 * inspected `buildThrottlers()`'s return value would pass for a policy that never blocks anything.
 *
 * Limits are tiny and deliberately spread apart so each assertion can only trip the throttler it is
 * about — `ipLimit` (3) < `externalKeyLimit` (5) < `externalIpLimit` (12).
 */
const LIMITS = { ttl: 5_000, ipLimit: 3, externalKeyLimit: 5, externalIpLimit: 12 };

async function makeGuard(limits = LIMITS): Promise<ThrottlerGuard> {
  // The same storage the app wires in (`app.module.ts`), not the library's — counting behaviour is
  // half of what these tests are about, so measuring it against a store production does not use
  // would leave the real one untested.
  const guard = new ThrottlerGuard(
    { throttlers: buildThrottlers(limits) },
    new BoundedThrottlerStorage(),
    new Reflector(),
  );
  // Without this the guard has no `throttlers` at all — it is built in the lifecycle hook, not the
  // constructor, and every request would sail through.
  await guard.onModuleInit();
  return guard;
}

/**
 * A request as the guard sees it.
 *
 * `handler` must be a **named** method of the real controller: the library's default `generateKey`
 * interpolates `context.getHandler().name`, so anonymous arrows would give every route the same
 * empty name and make the "one budget across the surface" test pass even without our own
 * `generateKey`.
 */
function ctxFor(opts: {
  // biome-ignore lint/complexity/noBannedTypes: this is exactly the `getClass()` contract.
  cls: Function;
  handler: (...args: never[]) => unknown;
  ip: string;
  key?: string;
}): ExecutionContext {
  const req = {
    ip: opts.ip,
    headers: opts.key === undefined ? {} : { [API_KEY_HEADER]: opts.key },
  };
  const res = { header: () => undefined };
  return {
    getClass: () => opts.cls,
    getHandler: () => opts.handler,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

const externalGet = (ip: string, key?: string) =>
  ctxFor({
    cls: ExternalController,
    handler: ExternalController.prototype.getFormTemplate,
    ip,
    key,
  });

const externalPost = (ip: string, key?: string) =>
  ctxFor({
    cls: ExternalController,
    handler: ExternalController.prototype.checkTransition,
    ip,
    key,
  });

/** `"blocked"` for the 429 the guard raises, so a test can assert on the request number. */
async function fire(guard: ThrottlerGuard, ctx: ExecutionContext): Promise<"ok" | "blocked"> {
  try {
    await guard.canActivate(ctx);
    return "ok";
  } catch (error) {
    if (error instanceof ThrottlerException) return "blocked";
    throw error;
  }
}

async function fireAll(
  guard: ThrottlerGuard,
  contexts: ExecutionContext[],
): Promise<("ok" | "blocked")[]> {
  const results: ("ok" | "blocked")[] = [];
  for (const ctx of contexts) results.push(await fire(guard, ctx));
  return results;
}

describe("external rate limiting", () => {
  it("blocks one key past its budget even when the requests come from different IPs", async () => {
    // (a) The budget belongs to the credential. Spreading the calls over six source addresses must
    // not buy a seventh request.
    const guard = await makeGuard();
    const results = await fireAll(
      guard,
      Array.from({ length: 6 }, (_, i) => externalGet(`10.0.0.${i}`, "key-alpha")),
    );
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok", "blocked"]);
  });

  it("does not let two keys sharing one egress IP exhaust each other's budget", async () => {
    // (b) The reason the whole slice exists: an integrating system NATs its whole organisation
    // behind one address. Ten calls, five per key, none blocked.
    //
    // The budgets are separate for real, not just at the arithmetic level: the counter store is
    // ours (`common/throttler-storage.ts`) precisely because the library's expires hits per
    // throttler NAME, which let one blocked key freeze another key's counter. That property has its
    // own test next to the store; this one covers the composition.
    const guard = await makeGuard();
    const results = await fireAll(guard, [
      ...Array.from({ length: 5 }, () => externalGet("203.0.113.9", "key-alpha")),
      ...Array.from({ length: 5 }, () => externalGet("203.0.113.9", "key-beta")),
    ]);
    expect(results.every((r) => r === "ok")).toBe(true);
  });

  it("lets one key exceed the ordinary per-IP limit from a single IP", async () => {
    // (b′) The purpose of P6, pinned on its own. `ipLimit` is 3; five keyed calls from one IP must
    // all pass. Without the `default` throttler stepping aside for keyed external traffic, the
    // integrator stays capped at the browser-sized budget and this is the only test that notices.
    const guard = await makeGuard();
    const results = await fireAll(
      guard,
      Array.from({ length: 5 }, () => externalGet("198.51.100.7", "key-alpha")),
    );
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });

  it("still caps one IP that cycles through invented keys, across routes", async () => {
    // (c) Counting happens before authentication, so a made-up key is indistinguishable from a real
    // one here and each new value would otherwise open a fresh bucket. The per-IP ceiling is what
    // bounds that flood. Split 7/6 over two routes: neither route alone reaches 12, so this also
    // fails if the per-IP throttler ever goes back to the library's per-route storage key.
    const guard = await makeGuard();
    const results = await fireAll(guard, [
      ...Array.from({ length: 7 }, (_, i) => externalGet("192.0.2.5", `invented-${i}`)),
      ...Array.from({ length: 6 }, (_, i) => externalPost("192.0.2.5", `invented-${100 + i}`)),
    ]);
    expect(results.slice(0, 12).every((r) => r === "ok")).toBe(true);
    expect(results[12]).toBe("blocked");
  });

  it("keeps the ordinary per-IP limit on external calls that present no key", async () => {
    // (d) The 401 path. Nothing about it changed, and it must not inherit the widened ceiling.
    const guard = await makeGuard();
    const results = await fireAll(
      guard,
      Array.from({ length: 4 }, () => externalGet("192.0.2.50")),
    );
    expect(results).toEqual(["ok", "ok", "ok", "blocked"]);
  });

  it("gives no relief to a normal route just because the caller sent an api-key header", async () => {
    // (e) The header is the caller's own claim. If presenting one were enough to leave the per-IP
    // budget, the global limit would be opt-out for anyone who reads this file.
    const guard = await makeGuard();
    const results = await fireAll(
      guard,
      Array.from({ length: 4 }, () =>
        ctxFor({
          cls: ProjectsController,
          handler: ProjectsController.prototype.list,
          ip: "192.0.2.77",
          key: "key-alpha",
        }),
      ),
    );
    expect(results).toEqual(["ok", "ok", "ok", "blocked"]);
  });

  it("spends one budget per key across the whole surface, not one per route", async () => {
    // (f) What we tell the integrator is "N requests per window per key". The library's default
    // storage key includes the handler name, which would quietly make it N per endpoint — and grow
    // the day a third route is added.
    const guard = await makeGuard();
    const results = await fireAll(guard, [
      ...Array.from({ length: 3 }, () => externalGet("192.0.2.8", "key-alpha")),
      ...Array.from({ length: 3 }, () => externalPost("192.0.2.8", "key-alpha")),
    ]);
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok", "blocked"]);
  });
});

describe("apiKeyTracker", () => {
  it("tracks the digest, never the key itself", () => {
    // (g) The tracker reaches storage keys and any log of a throttling decision.
    const tracker = apiKeyTracker({ headers: { [API_KEY_HEADER]: "super-secret" } });
    expect(tracker).toMatch(/^[0-9a-f]{64}$/);
    expect(tracker).not.toContain("super-secret");
    expect(tracker).toBe(hashApiKey("super-secret"));
  });

  it("reads the header exactly as authentication does", () => {
    // Counting and authenticating must resolve the same request to the same credential; a reader
    // that disagreed on the array form would hand one request two identities.
    expect(apiKeyTracker({ headers: { [API_KEY_HEADER]: ["  spaced  "] } })).toBe(
      hashApiKey("spaced"),
    );
  });

  it("refuses to invent a tracker for a request with no key", () => {
    expect(() => apiKeyTracker({ headers: {} })).toThrow(/no API key/);
  });
});

describe("buildThrottlers", () => {
  it("refuses a limit that is not a positive integer", () => {
    // `totalHits > undefined` is always false, so a mistyped env key would switch rate limiting off
    // while every response still looked healthy. Fail at boot instead.
    expect(() => buildThrottlers({ ...LIMITS, externalKeyLimit: 0 })).toThrow(/externalKeyLimit/);
    expect(() => buildThrottlers({ ...LIMITS, ipLimit: undefined as unknown as number })).toThrow(
      /ipLimit/,
    );
    expect(() => buildThrottlers({ ...LIMITS, ttl: 1.5 })).toThrow(/ttl/);
  });

  it("names all three throttlers, so their identity survives a refactor of the array order", () => {
    expect(buildThrottlers(LIMITS).map((t) => t.name)).toEqual([
      "default",
      "external-ip",
      "external-key",
    ]);
  });
});

describe("the surface the policy applies to", () => {
  it("recognises only the external controller, key present", () => {
    expect(isKeyedExternalRequest(externalGet("1.1.1.1", "key-alpha"))).toBe(true);
    expect(isKeyedExternalRequest(externalGet("1.1.1.1"))).toBe(false);
    expect(
      isKeyedExternalRequest(
        ctxFor({
          cls: ProjectsController,
          handler: ProjectsController.prototype.list,
          ip: "1.1.1.1",
          key: "key-alpha",
        }),
      ),
    ).toBe(false);
  });

  it("has exactly one controller in ExternalModule", () => {
    // `isKeyedExternalRequest` matches on the class. A second controller added here would keep
    // working and silently fall back to the per-IP budget — the failure mode nobody would look for.
    expect(Reflect.getMetadata("controllers", ExternalModule)).toEqual([ExternalController]);
  });

  it("has no other file serving an /external route", () => {
    // Reflection above cannot see a controller declared in a module it was never told about; this
    // scan can. Same technique as the `@Public()` census in `external.controller.test.ts`. Anchored
    // to the start of a line so a docstring that merely names the decorator is not an offender —
    // a real one always sits at column zero above a top-level class.
    // Anchored to this file rather than to `process.cwd()`, so the scan covers the same tree no
    // matter which directory the runner was started from.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const offenders = sourceFiles(root)
      // Both spellings: `@Controller("external")` and `@Controller({ path: "external" })`.
      .filter((file) =>
        /^@Controller\(\s*(\{[^)]*path:\s*)?["'`]external/m.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(root, file).replaceAll("\\", "/"));

    expect(offenders).toEqual(["modules/external/external.controller.ts"]);
  });
});

/** Every non-test `.ts` under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [full] : [];
  });
}
