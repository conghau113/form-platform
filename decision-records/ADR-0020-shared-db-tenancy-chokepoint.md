# ADR-0020: Shared-DB multi-tenancy via the tenant access chokepoint

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; established Phase B1–B4 (2026-07-02, origin commits in Evidence).
- **Deciders:** Owner
- **Source:** `apps/api/prisma/schema.prisma` (`Tenant`); `projects.service.ts` `requireAccess`; product-roadmap Phase B.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

The product is multi-tenant: `1 tenant = 1 client/installation`. Rather than a database
per tenant, all tenants share one PostgreSQL schema, with `Tenant` as the top-level
container owning projects, org units, roles, and memberships. Every project belongs to a
tenant, and access to any project resource must be confined to members of that project's
tenant.

## Decision

Multi-tenancy is **shared-database, row-scoped by `tenantId`**, enforced through a
**single access chokepoint**: `ProjectsService.requireAccess` resolves the caller's role
on a project by mapping their RBAC functions **in that project's tenant**
(`project.tenantId → resolveFunctions → projectRoleFromFunctions`). No access resolves to
**404** (never leaking existence), insufficient role to **403**. Existing pre-tenant data
was backfilled to a personal tenant per distinct `ownerId`; the `projectId → tenantId`
scoping (B4) moved slug-uniqueness and creation from owner-scoped to tenant-scoped. Role
mutations are always narrowed by `tenantId` so they never touch a user's assignments in
other tenants.

## Rationale

Cross-tenant data leakage is the defining failure mode of a shared-DB SaaS, so tenant
scoping cannot be sprinkled ad hoc across services — it must funnel through one place that
every read/write consults, or a single forgotten `where tenantId` becomes a breach.
Routing all project access through `requireAccess` (which derives the role *from the
project's own tenant*) makes "which tenant" a property of the resource, not of the request,
and returning 404-not-403 for no-access avoids leaking that a resource exists to
outsiders. Sharing one database (vs database-per-tenant) keeps migrations and operations
single-track, which suits the vendor's additive-migration discipline. A future session
adding a query that filters by `ownerId` or omits the tenant scope would silently
reintroduce cross-tenant visibility — the chokepoint and its 404 semantics are the guard.

## Evidence

- `apps/api/prisma/schema.prisma:14-29` — `Tenant` model, "`1 tenant = 1 client`. Existing
  data is backfilled to a personal tenant per distinct `ownerId`".
- `apps/api/src/modules/projects/projects.service.ts:40-48` — access "resolves through
  `requireAccess`… the role their RBAC functions in the project's tenant map to"; `:170-183`
  — `requireAccess` (no access → 404, low role → 403); `:158` — `resolveFunctions(userId,
  project.tenantId)`.
- `apps/api/src/persistence/repositories/rbac.repo.ts:84-88` — `setUserRoles` "Scoped by
  `tenantId` so it never touches the user's assignments in other tenants".
- Origin commits: `8a12adc` (Phase B1 Tenant+Membership), `2ff4170` (Phase B4 tenant writes:
  create-into-team-tenant + per-tenant slugs).
- Related: [ADR-0018](ADR-0018-vendor-client-no-hardcoded-business.md), [ADR-0021](ADR-0021-data-driven-rbac-wildcard.md).
