import {
  childrenOf,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
  type Reaction,
} from "@org/form-schema";
import { evalRule, isVisible } from "./conditions.js";

/** Option payload for an `effect: "options"` reaction (same shape as a select/radio
 *  option). The reaction's loose `value: any` is coerced to this at apply time. */
export interface ReactionOption {
  label: string;
  value: string | number;
}

/** The resolved effects for a single target field, after all matching reactions are
 *  collapsed. `value` is wrapped so that "set to undefined" (`{ set: undefined }`) is
 *  distinguishable from "no value effect" (the key absent). */
export interface FieldEffects {
  visible?: boolean;
  disabled?: boolean;
  value?: { set: unknown };
  options?: ReactionOption[];
}

/** Map of target field name -> its resolved effects. Computed once per scope. */
export type EffectMap = Record<string, FieldEffects>;

/** A reaction together with the name of the field it was declared on, so a
 *  reaction that targets its own host can be skipped (self-target). */
interface SourcedReaction {
  reaction: Reaction;
  source: string;
}

/** Collect every reaction in a node list, walking through value-transparent
 *  containers but NOT descending into `array.itemFields` — those are row-scoped and
 *  computed per row in G4. Only leaf fields carry `reactions` (G1 schema), so the
 *  declaring field always has a `name`. */
function collectReactions(nodes: FieldNode[]): SourcedReaction[] {
  const out: SourcedReaction[] = [];
  const walk = (list: FieldNode[]): void => {
    for (const node of list) {
      const reactions = (node as { reactions?: Reaction[] }).reactions;
      const name = (node as { name?: string }).name;
      if (reactions && name) {
        for (const reaction of reactions) out.push({ reaction, source: name });
      }
      // Row-scoped subtree — skip; the array's own siblings still walk normally.
      if (node.type === "array") continue;
      const children = childrenOf(node);
      if (children) walk(children);
    }
  };
  walk(nodes);
  return out;
}

/** Extract every field name referenced by a JSONLogic rule's `var` operators.
 *  Supports both `{ var: "a" }` and `{ var: ["a", default] }`. Used by the static
 *  cycle guard to know which fields a value-effect reaction depends on. */
function extractVars(rule: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      if ("var" in obj) {
        const v = obj.var;
        if (typeof v === "string") out.push(v);
        else if (Array.isArray(v) && typeof v[0] === "string") out.push(v[0]);
        return;
      }
      for (const k of Object.keys(obj)) walk(obj[k]);
    }
  };
  walk(rule);
  return out;
}

/** Drop any `effect: "value"` reaction whose dependency would close a cycle through
 *  other value effects (e.g. A's value depends on B while B's value depends on A).
 *  Builds a target -> dependency-vars graph incrementally; the earlier-declared
 *  reaction wins, so the later one that closes the cycle is dropped. Only value
 *  effects participate — visible/disabled/options can't feed each other's values. */
function dropValueCycles(collected: SourcedReaction[]): SourcedReaction[] {
  const graph = new Map<string, Set<string>>();
  const canReach = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const next = graph.get(cur);
      if (next) for (const n of next) stack.push(n);
    }
    return false;
  };
  const kept: SourcedReaction[] = [];
  for (const item of collected) {
    if (item.reaction.effect !== "value") {
      kept.push(item);
      continue;
    }
    const target = item.reaction.target;
    const vars = extractVars(item.reaction.when.rule);
    const closesCycle = vars.some((v) => v === target || canReach(v, target));
    if (closesCycle) continue;
    const set = graph.get(target) ?? new Set<string>();
    for (const v of vars) set.add(v);
    graph.set(target, set);
    kept.push(item);
  }
  return kept;
}

/** Apply one matching reaction's effect onto the target's accumulating effects.
 *  Last matching reaction wins per (target, effect) since callers iterate in
 *  declaration order and overwrite. */
function applyEffect(eff: FieldEffects, reaction: Reaction): void {
  switch (reaction.effect) {
    case "visible":
      eff.visible = reaction.value === undefined ? true : Boolean(reaction.value);
      break;
    case "disabled":
      eff.disabled = reaction.value === undefined ? true : Boolean(reaction.value);
      break;
    case "value":
      eff.value = { set: reaction.value };
      break;
    case "options":
      eff.options = Array.isArray(reaction.value) ? (reaction.value as ReactionOption[]) : [];
      break;
  }
}

/**
 * Compute the EffectMap for a list of nodes against `values`. Single pass: every
 * `when` is evaluated against the INPUT values only (no fixpoint). Self-target
 * reactions are skipped; value-effect cycles are broken statically. Walks through
 * containers but not into array item fields (row-scoped). Reactions whose source is
 * itself hidden still fire — a deliberate single-pass tradeoff.
 */
export function computeNodeReactions(
  nodes: FieldNode[],
  values: Record<string, unknown>,
): EffectMap {
  const collected = dropValueCycles(collectReactions(nodes));
  const map: EffectMap = {};
  for (const { reaction, source } of collected) {
    if (reaction.target === source) continue; // self-target skip
    if (!evalRule(reaction.when.rule, values)) continue;
    map[reaction.target] ??= {};
    applyEffect(map[reaction.target], reaction);
  }
  return map;
}

/** Top-level convenience: compute reactions for a whole form's fields. */
export function computeReactions(form: FormSchema, values: Record<string, unknown>): EffectMap {
  return computeNodeReactions(form.fields, values);
}

/**
 * Resolve a node's visibility with reaction precedence: a `visible` effect (if any)
 * overrides `visibleWhen`, which overrides the implicit "always visible". The single
 * helper used by both validation and rendering so they stay consistent. `effects`
 * is omitted (or the node unnamed) → falls through to `visibleWhen`.
 */
export function effectiveVisible(
  node: FieldNode,
  values: Record<string, unknown>,
  effects?: EffectMap,
): boolean {
  const name = (node as { name?: string }).name;
  const eff = name ? effects?.[name] : undefined;
  if (eff && eff.visible !== undefined) return eff.visible;
  return isVisible(node, values);
}

/**
 * Collect the value-effect assignments across the whole form: RHF field path -> the
 * value to set. Top-level paths are bare names; per-row array paths are dotted
 * (`array.{i}.{field}`), evaluated against the merged row scope. Used by the renderer
 * to push reaction-driven values via `setValue`. Only VISIBLE arrays are descended.
 */
export function collectValueEffects(
  form: FormSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (nodes: FieldNode[], scope: Record<string, unknown>, prefix: string): void => {
    const effects = computeNodeReactions(nodes, scope);
    for (const [name, eff] of Object.entries(effects)) {
      if (eff.value) out[`${prefix}${name}`] = eff.value.set;
    }
    // Descend into visible arrays for per-row value effects (computeNodeReactions
    // deliberately doesn't walk itemFields). Recurse through containers to find them.
    const visitArrays = (list: FieldNode[]): void => {
      for (const node of list) {
        if (node.type === "array") {
          if (!effectiveVisible(node, scope, effects)) continue;
          const rows = scope[node.name];
          if (!Array.isArray(rows)) continue;
          rows.forEach((row, i) => {
            const rowObj = (row ?? {}) as Record<string, unknown>;
            walk(node.itemFields, { ...scope, ...rowObj }, `${prefix}${node.name}.${i}.`);
          });
        } else if (isLayoutContainer(node)) {
          visitArrays(node.children);
        }
      }
    };
    visitArrays(nodes);
  };
  walk(form.fields, values, "");
  return out;
}
