import type { ComponentType } from "react";

/**
 * Icon registry — the token→component resolver behind `prefixIcon`/`suffixIcon` (and any
 * future icon prop). The schema only ever stores a STRING token (`"antd:SearchOutlined"`,
 * `"lucide:search"`); the renderer resolves it here. This file is intentionally
 * dependency-free: it holds no concrete icon imports, so it never bloats the bundle and
 * stays portable. Concrete glyphs are contributed by `registerIcon*` (see `defaultIcons.ts`
 * for the built-in antd namespace). A bespoke icon set = register a new namespace; no
 * schema change is ever required (locked decision #3).
 */

/** A resolved icon component. antd icons and lucide icons both accept `className`/`style`,
 *  so the shared shape stays minimal and permissive (extra props are allowed). */
export type IconComponent = ComponentType<{
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}>;

/** Resolves an icon *name* (the part after the `namespace:`) to a component, or `undefined`
 *  when the namespace doesn't know it. Lets a whole library be registered behind one call. */
export type IconNamespaceResolver = (name: string) => IconComponent | undefined;

/** Exact `"namespace:name"` → component overrides (checked before namespace resolvers). */
const exactRegistry = new Map<string, IconComponent>();
/** `namespace` → resolver. Lets `"antd:X"` map into a whole icon library lazily. */
const namespaceResolvers = new Map<string, IconNamespaceResolver>();

/** Register a single icon under an exact token. Overrides any namespace resolver. */
export function registerIcon(token: string, component: IconComponent): void {
  exactRegistry.set(token, component);
}

/** Register many exact tokens at once. */
export function registerIcons(entries: Record<string, IconComponent>): void {
  for (const [token, component] of Object.entries(entries)) {
    exactRegistry.set(token, component);
  }
}

/** Register a resolver for a whole namespace (e.g. `"antd"`, `"lucide"`). */
export function registerIconNamespace(namespace: string, resolver: IconNamespaceResolver): void {
  namespaceResolvers.set(namespace, resolver);
}

/** Resolve a token to its component, or `undefined` if unknown/empty. The renderer must
 *  treat `undefined` gracefully (fall back to the text prefix/suffix, never crash). */
export function resolveIcon(token: string | undefined | null): IconComponent | undefined {
  if (!token) return undefined;
  const exact = exactRegistry.get(token);
  if (exact) return exact;
  const sep = token.indexOf(":");
  if (sep === -1) return undefined;
  const namespace = token.slice(0, sep);
  const name = token.slice(sep + 1);
  return namespaceResolvers.get(namespace)?.(name);
}
