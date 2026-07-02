/**
 * AppShell navigation catalog (Product Roadmap §6.7 — adaptive shell, progressive disclosure).
 *
 * The SINGLE source of the top-level sections. Rollout §6.7: only `design` (+ Settings, handled
 * separately in the rail footer) is enabled today; `operate`/`admin` stay in the catalog but hidden
 * until Phase E / Phase C-D implement them. Later phases flip `enabled` and — once `useAuth().functions`
 * exists (Phase C) — gate each section by `functions × tenant.edition` instead of the static flag.
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
}

export const NAV_SECTIONS: NavSection[] = [
  { key: "design", label: "Thiết kế", path: "/projects", enabled: true },
  { key: "operate", label: "Vận hành", path: "/operate", enabled: false }, // Phase E
  { key: "admin", label: "Quản trị", path: "/admin", enabled: false }, // Phase C/D
];

/** Sections to render in the rail right now. */
export function visibleSections(): NavSection[] {
  return NAV_SECTIONS.filter((s) => s.enabled);
}

/**
 * Which section a pathname belongs to — the enabled section whose `path` is the longest matching
 * prefix. Returns `undefined` for routes owned by no section (e.g. `/settings`, which the rail
 * highlights via its own footer button, not the section menu).
 */
export function activeNavKey(pathname: string): string | undefined {
  let match: NavSection | undefined;
  for (const s of visibleSections()) {
    if (pathname === s.path || pathname.startsWith(`${s.path}/`)) {
      if (!match || s.path.length > match.path.length) match = s;
    }
  }
  return match?.key;
}
