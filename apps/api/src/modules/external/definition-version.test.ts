import { describe, expect, it } from "vitest";
import {
  canonicalize,
  EVN_PCT_DEFINITION_VERSION,
  hashDefinition,
  PCT_DEFINITION,
} from "./definition-version.js";

/**
 * The verbatim pin below is the whole point of the feature.
 *
 * `EVN_PCT_DEFINITION_VERSION` does not detect drift by existing — it only takes a different value.
 * This test is what turns that into a signal, and it runs in CI, unlike the assertions inside
 * `src/scripts/measure-evn-*.ts` which need EVN's source tree present to run at all.
 *
 * ⚠️ When this goes red, do NOT paste the new digest in. Find out which table moved and why: a
 * regenerated table is a real change to every answer endpoint C gives.
 */
describe("EVN_PCT_DEFINITION_VERSION", () => {
  it("is this exact value for the tables committed today", () => {
    // Moved once, deliberately: P4d-2 added `workflowNodes` as a sixth table, so every reply now
    // also depends on `WORKFLOW_PCT.json`. Was `pct-708f1e878dc4f403` through P4d-1.
    expect(EVN_PCT_DEFINITION_VERSION).toBe("pct-9b0938e686556167");
  });

  it("looks like a digest, so an empty or broken hash cannot be pinned above by accident", () => {
    // A literal pin will happily lock in `pct-undefined` or `pct-[object Object]`. This one will not.
    expect(EVN_PCT_DEFINITION_VERSION).toMatch(/^pct-[0-9a-f]{16}$/);
  });

  it("covers exactly the tables endpoint C reads", () => {
    // The pin catches a change to any of these six. It cannot notice a SEVENTH generated table that
    // `check-transition.ts` starts reading and nobody adds here — the version would then sit still
    // while the answers moved, which is the one failure this whole feature exists to prevent.
    // Adding or removing a member is therefore a deliberate act with a red test attached.
    //
    // ⚠️ "reads", not "decides from": `workflowNodes` shapes `progress` and takes no part in
    // `allowed`/`nextStatus`. The membership rule is what C consults, not what it concludes.
    expect(Object.keys(PCT_DEFINITION).sort()).toEqual([
      "guards",
      "noStatusChangeActions",
      "requiredContent",
      "tieBreaks",
      "transitions",
      "workflowNodes",
    ]);
  });
});

describe("hashDefinition", () => {
  it("is deterministic across calls", () => {
    const value = { transitions: [{ statusCode: "PCT_S_WORKING" }] };
    expect(hashDefinition(value)).toBe(hashDefinition(value));
    expect(hashDefinition(value)).toBe(hashDefinition(structuredClone(value)));
  });

  it("ignores object key ORDER, so a reordered generator does not churn a pinned version", () => {
    expect(hashDefinition({ a: 1, b: 2 })).toBe(hashDefinition({ b: 2, a: 1 }));
    expect(hashDefinition({ outer: { x: [{ p: 1, q: 2 }] } })).toBe(
      hashDefinition({ outer: { x: [{ q: 2, p: 1 }] }, ...{} }),
    );
  });

  it("respects array ORDER, because row order in the transition table is data", () => {
    // `ambiguousNext` reports candidates in table order, so two tables differing only by row order
    // are two different tables — sorting arrays here would hide that.
    expect(hashDefinition(["a", "b"])).not.toBe(hashDefinition(["b", "a"]));
  });

  it("changes when a single nested cell changes", () => {
    const before = { guards: { PCT_A_END: ["CONTENT_FINISHED"] } };
    const after = { guards: { PCT_A_END: ["CONTENT_FINISHED", "CHTT_IS_WORKING"] } };
    expect(hashDefinition(before)).not.toBe(hashDefinition(after));
  });

  it("treats an own key holding `undefined` as an absent key", () => {
    // `EvnTransitionRow.statusCodeNext` is optional and means "the table said nothing here". A
    // generator that started emitting the key explicitly as `undefined` would otherwise move the
    // version while the measured data stayed identical.
    expect(hashDefinition({ statusCode: "X", statusCodeNext: undefined })).toBe(
      hashDefinition({ statusCode: "X" }),
    );
  });

  it("escapes keys, so a key containing the delimiters cannot forge a second entry", () => {
    // Measured before this test existed: emitting the key as `"${key}"` instead of
    // `JSON.stringify(key)` left the entire suite green while making these two collide.
    expect(hashDefinition({ 'a":1,"b': 1 })).not.toBe(hashDefinition({ a: 1, b: 1 }));
  });

  it("orders keys by code unit, not by locale", () => {
    // `localeCompare` would make the value committed in the pin above depend on the ICU data of
    // whichever machine ran the test. These two keys are ordered differently by the two rules.
    expect(canonicalize({ a_b: 1, aB: 2 })).toBe('{"aB":2,"a_b":1}');
  });

  it("refuses an exotic object rather than flattening it to `{}`", () => {
    // `Date`, `Set` and `Map` all serialise to `{}` under a plain key walk, so they collide with
    // each other AND with the empty object. A table quietly switched to a `Set<string>` would move
    // the version once and then freeze — a drift signal that has stopped working while still
    // looking like it works.
    expect(() => canonicalize(new Set([1, 2]))).toThrow(TypeError);
    expect(() => canonicalize({ rows: new Date(0) })).toThrow(TypeError);
    // `function`, `symbol` and `bigint` are not objects, so they slip past the prototype check and
    // would serialise to "null" — colliding with each other and with a real absent value.
    expect(() => canonicalize({ rows: () => [] })).toThrow(TypeError);
    expect(() => canonicalize({ rows: Symbol("x") })).toThrow(TypeError);
    expect(() => canonicalize({ rows: 1n })).toThrow(TypeError);
    // A null-prototype bag is still plain data, and stays allowed.
    expect(canonicalize(Object.assign(Object.create(null), { a: 1 }))).toBe('{"a":1}');
  });

  it("does not confuse a null with an absent key", () => {
    // The pair above must not be bought by flattening every empty-ish value together: `null` is a
    // value EVN's payloads carry, and it is not the same claim as "the key is not there".
    expect(hashDefinition({ a: null })).not.toBe(hashDefinition({}));
  });
});

describe("canonicalize", () => {
  it("sorts keys and preserves array order", () => {
    expect(canonicalize({ b: 1, a: [3, 1, 2] })).toBe('{"a":[3,1,2],"b":1}');
  });

  it("does not collide values that merely serialise similarly", () => {
    // The string "1" and the number 1 are different table contents; a canonicaliser that dropped
    // JSON quoting would hash them alike.
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: "1" }));
  });
});
