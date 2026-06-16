import type { FieldNode, FormSchema } from "@org/form-schema";

/**
 * The slice of a preset that field resolution needs. Presets are **authoring metadata that
 * lives OUTSIDE the form contract** (fetched from the workspace API), so form-core never
 * embeds or fetches them — the host injects a {@link PresetResolver}. This mirrors the
 * dataSource `fetchImpl` seam and keeps form-core (and the native renderer) portable.
 */
export interface PresetLike {
  /** The schema field type this preset seeds; must match the linked field's `type`. */
  fieldType: string;
  /** Default props merged into a linked instance (the same opaque record a preset stores). */
  patch: Record<string, unknown>;
}

/** Looks a preset up by id; returns `undefined` when it is unknown (deleted/unavailable). */
export type PresetResolver = (presetId: string) => PresetLike | undefined;

/** Outcome of {@link resolveLinkedFields}: the resolved form plus diagnostics for the host. */
export interface ResolveResult {
  /** A new form with every linked field re-synced against its preset (input is untouched). */
  form: FormSchema;
  /** Preset ids referenced by a field but not found — those fields froze to their snapshot. */
  missing: string[];
  /** Preset ids whose `fieldType` no longer matches the linking field — also frozen. */
  mismatched: string[];
}

type AnyNode = Record<string, unknown>;

function pushUnique(into: string[], id: string): void {
  if (!into.includes(id)) into.push(id);
}

function resolveNode(
  node: FieldNode,
  resolve: PresetResolver,
  missing: string[],
  mismatched: string[],
): FieldNode {
  const n = node as AnyNode;
  let out: AnyNode = n;

  const presetId = typeof n.presetId === "string" ? n.presetId : undefined;
  if (presetId) {
    const preset = resolve(presetId);
    if (!preset) {
      // Preset deleted/unavailable → freeze: render from this node's own props (the snapshot).
      pushUnique(missing, presetId);
    } else if (preset.fieldType !== n.type) {
      // Preset retyped → freeze: never apply a text patch onto a number field.
      pushUnique(mismatched, presetId);
    } else {
      // Re-sync: preset `patch` is the base, instance `overrides` win, identity preserved.
      const overrides = (n.overrides ?? {}) as Record<string, unknown>;
      out = { ...n, ...preset.patch, ...overrides };
      out.type = n.type;
      out.name = n.name;
      out.presetId = presetId;
      out.overrides = n.overrides;
      // Presets are leaf-only, but the resolver is a general contract: never let a patch's
      // structural keys replace this node's real subtree (the recursion below walks them).
      if ("children" in n) out.children = n.children;
      if ("itemFields" in n) out.itemFields = n.itemFields;
    }
  }

  // Recurse structural children immutably (containers via `children`, arrays via `itemFields`),
  // mirroring the migration walk so a linked field nested anywhere still resolves.
  if (Array.isArray(out.children)) {
    if (out === n) out = { ...n };
    out.children = (out.children as FieldNode[]).map((c) =>
      resolveNode(c, resolve, missing, mismatched),
    );
  }
  if (Array.isArray(out.itemFields)) {
    if (out === n) out = { ...n };
    out.itemFields = (out.itemFields as FieldNode[]).map((c) =>
      resolveNode(c, resolve, missing, mismatched),
    );
  }

  return out as FieldNode;
}

/**
 * Resolve **linked fields** (Track W4) against an injected preset source. For every field
 * carrying a `presetId`, the preset's `patch` is re-applied (with the field's `overrides`
 * layered on top) so editing a preset propagates to every instance. When the preset cannot
 * be resolved (deleted) or its `fieldType` changed, the field is left as-is — it renders from
 * its own props (a frozen snapshot) and the id is reported in {@link ResolveResult.missing} /
 * `mismatched`. The input form is never mutated; untouched subtrees are shared by reference.
 *
 * Pure and declarative — no `eval`, no fetching. Call it after `migrate()` and before render.
 */
export function resolveLinkedFields(form: FormSchema, resolve: PresetResolver): ResolveResult {
  const missing: string[] = [];
  const mismatched: string[] = [];
  const fields = form.fields.map((f) => resolveNode(f, resolve, missing, mismatched));
  return { form: { ...form, fields }, missing, mismatched };
}
