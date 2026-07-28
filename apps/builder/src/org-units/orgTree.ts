import type { OrgUnit } from "./client";

/** A generic antd tree node (shape shared by `Tree` and `TreeSelect`). */
export interface OrgTreeNode {
  key: string;
  value: string;
  title: string;
  children: OrgTreeNode[];
}

/**
 * Build the antd tree data for a flat org-unit list (pure; used by the org panel, the role
 * data-scope picker, and the project placement picker). Roots are units with no parent or whose
 * parent is absent from the list; each level is ordered by `order` then `name`. Tolerates cycles
 * by only visiting each unit once.
 */
export function buildOrgTree(units: OrgUnit[]): OrgTreeNode[] {
  const byParent = new Map<string | null, OrgUnit[]>();
  const ids = new Set(units.map((u) => u.id));
  for (const u of units) {
    const parent = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    (byParent.get(parent) ?? byParent.set(parent, []).get(parent)!).push(u);
  }
  const seen = new Set<string>();
  const build = (parentId: string | null): OrgTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .filter((u) => !seen.has(u.id) && seen.add(u.id))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((u) => ({ key: u.id, value: u.id, title: u.name, children: build(u.id) }));
  return build(null);
}
