import { hasAnyFunction } from "../auth/functions";

/**
 * AppShell navigation catalog (Product Roadmap §6.7 — adaptive shell, progressive disclosure).
 *
 * The SINGLE source of the top-level sections. Sections carry two gates: the static `enabled`
 * rollout flag and an optional `anyFunction` list — the
 * section shows only when the signed-in user's effective functions grant at least one code
 * (Phase D1, mirroring web-admin's `hasPermissionForAccessPage`). Hiding nav ≠ security; the
 * server's FunctionGuard is the real boundary.
 */

export interface NavSection {
  /** Stable key — also the antd Menu selected key. */
  key: string;
  /** Rail label (Vietnamese). */
  label: string;
  /** Route this section lands on. */
  path: string;
  /** Whether the section is live yet (§6.7 rollout). */
  enabled: boolean;
  /** Function codes any one of which reveals the section; omitted = visible to all members. */
  anyFunction?: string[];
}

export const NAV_SECTIONS: NavSection[] = [
  { key: "design", label: "Thiết kế", path: "/projects", enabled: true },
  // Phase E. Gated on `workflow.run` ALONE, exactly like the server: `workflow.admin` does not
  // imply it (`resolveFunctions` never expands `parentCode`), so admitting it here would show a
  // section whose every request answers 403.
  {
    key: "operate",
    label: "Vận hành",
    path: "/operate",
    enabled: true,
    anyFunction: ["workflow.run"],
  },
  {
    key: "admin",
    label: "Quản trị",
    path: "/admin",
    enabled: true,
    anyFunction: ["user.admin", "role.admin", "form.admin", "workflow.admin", "org.admin"],
  },
];

/** Sections to render in the rail for a user holding these function codes. */
export function visibleSections(functions: readonly string[]): NavSection[] {
  return NAV_SECTIONS.filter(
    (s) => s.enabled && (!s.anyFunction || hasAnyFunction(functions, s.anyFunction)),
  );
}

/**
 * Which section a pathname belongs to — the visible section whose `path` is the longest matching
 * prefix. Returns `undefined` for routes owned by no section (e.g. `/settings`, which the rail
 * highlights via its own footer button, not the section menu).
 */
export function activeNavKey(pathname: string, functions: readonly string[]): string | undefined {
  let match: NavSection | undefined;
  for (const s of visibleSections(functions)) {
    if (pathname === s.path || pathname.startsWith(`${s.path}/`)) {
      if (!match || s.path.length > match.path.length) match = s;
    }
  }
  return match?.key;
}
