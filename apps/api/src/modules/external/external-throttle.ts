import type { ExecutionContext } from "@nestjs/common";
import type { ThrottlerOptions } from "@nestjs/throttler";
import { type ExternalRequest, hashApiKey, readApiKey } from "./api-key.guard.js";
import { ExternalController } from "./external.controller.js";

/**
 * @fileoverview Rate-limit policy for the `/external/*` integration surface (EVN Q9, P6).
 *
 * The problem this solves: the global limit is per IP, and every call from the integrating system
 * arrives from one egress IP, so their whole organisation shares a budget sized for one browser.
 * `@SkipThrottle()` would fix throughput by removing the only thing in front of the surface a
 * caller can reach *before* authenticating — a worse trade. So the budget moves to the credential.
 *
 * Three named throttlers, whose `skipIf` predicates are exact complements:
 *
 * | name           | tracker | applies to                                    |
 * |----------------|---------|-----------------------------------------------|
 * | `default`      | IP      | everything else — unchanged behaviour          |
 * | `external-ip`  | IP      | `/external/*` calls presenting a key           |
 * | `external-key` | key     | `/external/*` calls presenting a key           |
 *
 * A request to any other controller is untouched **even if it carries an `x-api-key` header**:
 * that header is the caller's own claim, so letting it alone change the policy would make the
 * per-IP limit opt-out for anyone who reads this file.
 *
 * ⚠️ The one cost, stated rather than buried: the guard runs before `ApiKeyGuard`, so at counting
 * time nobody knows whether the presented key is real. An unauthenticated flood of `/external/*`
 * with a made-up header is therefore bounded by `external-ip` rather than by the ordinary limit —
 * higher than before. It cannot be otherwise while the integrator must exceed the per-IP limit, so
 * `externalIpLimit` is meant to stay the smallest number that lets a few keys share an egress IP,
 * not a generous one.
 *
 * ⚠️ Tracking by a value the caller supplies has a second cost besides the one above, and it is why
 * `common/throttler-storage.ts` exists: the library's store never forgets a key and expires hits per
 * throttler *name* rather than per key. Both are harmless for an IP-derived tracker and neither is
 * for this one. That file has the measurements.
 */

export const EXTERNAL_IP_THROTTLER = "external-ip";
export const EXTERNAL_KEY_THROTTLER = "external-key";

/** The limits `buildThrottlers` turns into throttler definitions. All four come from the env. */
export interface ExternalThrottleLimits {
  /** Window shared by all three throttlers (`THROTTLE_TTL`, ms). */
  ttl: number;
  /** `THROTTLE_LIMIT` — per IP, everything that is not a keyed external call. */
  ipLimit: number;
  /** `EXTERNAL_IP_THROTTLE_LIMIT` — per IP, keyed external calls only. */
  externalIpLimit: number;
  /** `EXTERNAL_THROTTLE_LIMIT` — per API key. */
  externalKeyLimit: number;
}

/**
 * True for a call on the external surface that presents a key — the only traffic whose budget is
 * the credential's rather than the IP's.
 *
 * Must stay synchronous: the guard calls `skipIf(context)` without awaiting it, so a promise here
 * would be truthy always and skip every throttler.
 *
 * The surface is identified by controller class rather than by path prefix, which survives a global
 * prefix being added later. A *second* controller under `/external` would silently fall back to the
 * per-IP limit; `external-throttle.test.ts` pins the module's controller list and scans the source
 * for stray `@Controller("external…")` so that stays a deliberate act.
 */
export function isKeyedExternalRequest(ctx: ExecutionContext): boolean {
  if (ctx.getClass() !== ExternalController) return false;
  const req = ctx.switchToHttp().getRequest<ExternalRequest>();
  return readApiKey(req) !== null;
}

/**
 * Tracker for the per-key throttler: the SHA-256 of the presented key, never the key itself — the
 * tracker ends up in storage keys and in anything that logs a throttling decision.
 *
 * Throws rather than falling back to the IP when there is no key. The fallback is unreachable
 * (`skipIf` already excluded those requests), and if that ever stopped being true, quietly pooling
 * every anonymous caller into one bucket is the failure that would be hardest to notice.
 */
export function apiKeyTracker(req: ExternalRequest): string {
  const raw = readApiKey(req);
  if (!raw) throw new Error("apiKeyTracker called for a request with no API key");
  return hashApiKey(raw);
}

/**
 * Build the throttler definitions. Pure, so the policy can be tested against a real `ThrottlerGuard`
 * without booting the app.
 *
 * Both external throttlers generate their own storage key. The library's default key includes the
 * controller and handler names, which would make every limit *per route*: one key would get its
 * budget once per endpoint, and the number would silently grow the day a third route is added. What
 * we tell the integrator ("N requests per minute per key") has to mean one budget for the surface.
 *
 * Limits are validated because `limit: undefined` does not fail — `totalHits > undefined` is always
 * false, so a typo in an env key would turn rate limiting off while every response still looked
 * normal.
 */
export function buildThrottlers(limits: ExternalThrottleLimits): ThrottlerOptions[] {
  assertPositiveInt(limits.ttl, "ttl");
  assertPositiveInt(limits.ipLimit, "ipLimit");
  assertPositiveInt(limits.externalIpLimit, "externalIpLimit");
  assertPositiveInt(limits.externalKeyLimit, "externalKeyLimit");

  return [
    {
      name: "default",
      ttl: limits.ttl,
      limit: limits.ipLimit,
      skipIf: isKeyedExternalRequest,
    },
    {
      name: EXTERNAL_IP_THROTTLER,
      ttl: limits.ttl,
      limit: limits.externalIpLimit,
      skipIf: (ctx) => !isKeyedExternalRequest(ctx),
      generateKey: (_ctx, tracker) => `${EXTERNAL_IP_THROTTLER}:${tracker}`,
    },
    {
      name: EXTERNAL_KEY_THROTTLER,
      ttl: limits.ttl,
      limit: limits.externalKeyLimit,
      skipIf: (ctx) => !isKeyedExternalRequest(ctx),
      getTracker: (req) => apiKeyTracker(req as ExternalRequest),
      generateKey: (_ctx, tracker) => `${EXTERNAL_KEY_THROTTLER}:${tracker}`,
    },
  ];
}

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Throttle limit "${name}" must be a positive integer, got: ${String(value)}`);
  }
}
