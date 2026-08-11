import "reflect-metadata";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY } from "../../auth/public.decorator.js";
import { ProjectsController } from "../projects/projects.controller.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ExternalController } from "./external.controller.js";

/**
 * These assert *metadata*, not HTTP, and that is deliberate. `apps/api` has no e2e harness, so a
 * test that called the controller method directly would bypass the guard entirely and pass while
 * the route was wide open. Reading the decorators back is the only unit-level way to prove the
 * binding exists. End-to-end proof is the live-smoke step in the plan.
 */
const reflector = new Reflector();

/** The guards Nest will apply to a class, as `@UseGuards` records them. */
function classGuards(target: object): unknown[] {
  return (Reflect.getMetadata("__guards__", target) as unknown[] | undefined) ?? [];
}

describe("ExternalController wiring", () => {
  it("is marked @Public at the CLASS level", () => {
    // Required: the global JwtAuthGuard would otherwise 401 a caller with no browser session.
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, ExternalController)).toBe(true);
  });

  it("binds ApiKeyGuard at the CLASS level", () => {
    // The pairing is the whole security property. Bound per method instead, a route added later
    // would inherit @Public() (class-level) without inheriting the key check.
    expect(classGuards(ExternalController)).toContain(ApiKeyGuard);
  });

  it("guards every route on the controller, including ones added later", () => {
    // Walk the prototype: any handler carrying its own @Public() or its own guard set would mean
    // someone split the pair across levels — which is the failure mode this whole file exists for.
    const proto: object = ExternalController.prototype;
    const handlers = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== "constructor")
      .map((name) => Reflect.get(proto, name) as unknown)
      .filter((value): value is (...args: unknown[]) => unknown => typeof value === "function");

    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(classGuards(handler)).toEqual([]);
    }
  });

  it("answers check-transition with 200, not @Post's default 201", () => {
    // C creates nothing — it answers a question — and the partner's spec shows a judgment body.
    // Only the live smoke would otherwise notice, and that step needs a database and a running
    // instance, so it does not run in CI.
    expect(Reflect.getMetadata("__httpCode__", ExternalController.prototype.checkTransition)).toBe(
      200,
    );
  });
});

describe("the key does not reach the rest of the API", () => {
  it("leaves other controllers non-public", () => {
    // The reverse direction of the same property: `@Public()` must not have spread. A controller
    // that is not public is still behind the global JwtAuthGuard, which an API key cannot satisfy —
    // it carries no JWT at all.
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, ProjectsController)).toBeUndefined();
  });

  it("does not bind ApiKeyGuard anywhere else", () => {
    expect(classGuards(ProjectsController)).not.toContain(ApiKeyGuard);
  });

  it("keeps the set of unauthenticated files to the three that are meant to be", () => {
    // A source scan rather than a reflection check, because the risk is a file this test file has
    // never heard of. `@Public()` removes the ONLY authentication on a route; the set of places
    // that may do so is small enough to enumerate, so make growing it a deliberate act that turns
    // this test red instead of something that lands unnoticed in a large diff.
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .filter((file) => /@Public\(\)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file).replaceAll("\\", "/"))
      // The guard/controller docstrings mention `@Public()` in prose; only real call sites count.
      .filter((rel) => rel !== "modules/external/api-key.guard.ts");

    expect(new Set(offenders)).toEqual(
      new Set([
        "modules/auth/auth.controller.ts",
        "modules/external/external.controller.ts",
        "modules/health/health.controller.ts",
      ]),
    );
  });
});

/** Every non-test `.ts` under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}
