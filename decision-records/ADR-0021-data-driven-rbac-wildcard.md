# ADR-0021: Data-driven RBAC with the `*` wildcard function sentinel

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; established product-roadmap Phase C (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** `apps/api/src/auth/function.guard.ts`, `rbac.repo.ts`, `tenant-role.ts`; product-roadmap §1.1/Phase C.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

Authorization must let each client define their own roles and permissions, mirroring EVN's
model without inheriting its hardcoded `code === 'ADMIN'` check. The platform seeds an
immutable base **function catalog** (permission codes like `form.manage`, `workflow.read`);
tenants compose those codes into **roles**, and assign roles to users.

## Decision

RBAC is **data-driven, not hardcoded roles.** A user's effective permissions are computed
as the **union of function codes over the roles they hold in a tenant**
(`RbacRepo.resolveFunctions`). Enforcement is a NestJS `FunctionGuard` reading a
`@RequireFunction([...])` decorator with **any-of** semantics. Superadmin is expressed as
a **data sentinel**: the function code **`*`** (`WILDCARD_FUNCTION`) grants every function;
a tenant's auto-provisioned `Admin` role holds it. There is **no role-name check anywhere**
— `*` replaces EVN's hardcoded `code === 'ADMIN'`. The server is the real boundary; the
client only hides nav it can't reach.

## Rationale

If roles were hardcoded (e.g. `if role === 'ADMIN'`), every client would be stuck with the
vendor's role vocabulary and admins couldn't define new roles without code changes —
directly violating the vendor↔client principle (ADR-0018). Making permissions *data*
(functions → roles → users, all rows) lets each client model their own authorization while
the enforcement code stays fixed. The `*` sentinel keeps "superadmin" inside that same
data model instead of as a special-cased string in code: `resolveFunctions` returns `*`
and the guard short-circuits, so there is exactly one authorization path and no
out-of-band admin bypass to audit. Anchoring the boundary in a server-side guard (not the
UI) is essential because hiding nav is not access control. A future session tempted to add
a role-name shortcut would fork the authorization model and reintroduce the hardcoding this
decision removed.

## Evidence

- `apps/api/src/persistence/repositories/rbac.repo.ts:9-13` — `export const WILDCARD_FUNCTION
  = "*"` ("a role holding it grants every function (superadmin)"), `ADMIN_ROLE_NAME`;
  `:90-96` — `resolveFunctions` = "union of function codes over the roles they hold".
- `apps/api/src/auth/function.guard.ts:17-51` — any-of enforcement, `held.has(WILDCARD_FUNCTION)
  → return true`, "Server-side is the real boundary; the client only hides nav."
- `apps/api/src/modules/projects/tenant-role.ts:4-20` — data-driven mapping "a member with no
  roles sees nothing"; `*` → `owner`.
- `apps/api/prisma/schema.prisma:31-36` — `Function` catalog; "sentinel code `*` … replacing
  EVN's hardcoded `code==='ADMIN'`".
- `docs/expansion/product-roadmap.md:263,280,480` — "KHÔNG hardcode role", "sentinel `*`→
  allow-all (thay hardcode EVN)", "thay hardcode `code==='ADMIN'` bằng role admin data-driven".
- Origin commit: `fed779e` *feat(api): product-roadmap Phase C (C1+C2+C4) — RBAC data-driven*.
- Related: [ADR-0018](ADR-0018-vendor-client-no-hardcoded-business.md), [ADR-0020](ADR-0020-shared-db-tenancy-chokepoint.md).
