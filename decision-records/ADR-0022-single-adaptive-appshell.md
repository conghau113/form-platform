# ADR-0022: One adaptive AppShell, not separate portals

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; established product-roadmap §6.7 (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** `apps/builder/src/shell/AppShell.tsx` + `shell/nav.ts`/`NavRail.tsx`; product-roadmap §6.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

The product serves several user kinds (client-admin, designers, operators) across several
sections (Design forms/workflows, Operate/run, Admin, Settings). A common enterprise
pattern is to build separate front-end apps/portals per audience. The builder instead has
a single shell that adapts what it shows.

## Decision

The front end is **one adaptive AppShell**, not multiple portals. `AppShell` is a layout
route behind `RequireAuth` with a persistent `NavRail` and a routed content area; sections
(Design, Settings today; Operate/Admin as they land) **slot into the same shell**, and the
navigation adapts to the user rather than switching apps. (The **vendor console** is the
one deliberate exception — it is separated out for platform-staff, gated by a
system-function.)

## Rationale

Separate portals would multiply the surface that must be built, themed, authenticated, and
kept consistent — and force users who wear several hats (an admin who also designs forms)
to hop between apps. A single shell whose nav is driven by the user's data-driven
permissions (ADR-0021) means a new capability is *added as a section*, not as a new
application, and every user sees exactly the one coherent product surface their roles
unlock. This keeps the "one adaptive platform" promise aligned with the data-driven RBAC:
the same permission data that gates the server also shapes the nav. Splitting the vendor
console off is consistent, not contradictory — it is a different *audience tier*
(platform-staff vs client), not a different client-facing portal. Recording this prevents a
future session from spinning up a parallel "admin app" and fragmenting the surface.

## Evidence

- `apps/builder/src/shell/AppShell.tsx:4-18` — "The unified app shell (Product Roadmap
  §6.1/§6.7 — **one adaptive platform, not two portals**)… Operate/Admin slot in at Phase C-E."
- `apps/builder/src/shell/` — `NavRail.tsx` + `nav.ts` drive the single persistent rail.
- `docs/expansion/product-roadmap.md:447` — the deliberate exception: "**Vendor console TÁCH
  RIÊNG**… chỉ platform-staff qua system-function".
- Origin commit: `70c803d` *feat(builder): product-roadmap §6.7 — unified AppShell (nav rail
  + Settings)*.
- Related: [ADR-0021](ADR-0021-data-driven-rbac-wildcard.md) (nav follows the same permission data).
