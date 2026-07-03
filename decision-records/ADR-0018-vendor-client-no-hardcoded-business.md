# ADR-0018: Vendor↔client separation — no hardcoded client (EVN) business logic

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; decided by owner 2026-07-01 (product-roadmap §1.1).
- **Deciders:** Owner
- **Source:** `docs/expansion/product-roadmap.md` §1.1 + Phase B/C guardrails; entity code across `apps/api`.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

`form-platform` is a **vendor product** sold to many client installations. EVN is one
*sample* client that supplied real reference entities (`core-service` / `web-admin`,
TypeORM). The temptation, given a concrete first client, is to encode that client's
business domain (its device types, electrical-work categories, specific departments)
directly into the platform.

## Decision

The platform contains **no hardcoded client business logic.** A client's business
domain — organisation/departments, roles, permission functions, forms, workflows — is
**data the client configures inside their tenant**, never vendor code. EVN is treated as
a *reference to emulate, not to copy*: its model informs generic platform primitives, but
EVN-specific entities and rules never enter the codebase. Two admin tiers follow from
this: **vendor-admin** manages tenants/installations; **client-admin** configures
everything inside their own tenant.

## Rationale

Hardcoding EVN's domain would collapse the product into a single-client bespoke build:
every other client would need code changes to onboard, and EVN's rules would leak into
tenants that have nothing to do with electricity. The vendor's durable asset is the
*generic* machinery (data-driven RBAC, configurable org tree, schema-driven forms) that
lets any client model their own domain as data. This is the root principle the whole
multi-tenant/RBAC/org-unit architecture serves, so several downstream ADRs (0020 tenancy,
0021 data-driven RBAC) are concrete expressions of it. It is also the constraint most
easily eroded one convenient shortcut at a time ("just add EVN's two-level org model"),
which is exactly why the roadmap records the generalisation decision every time
(e.g. the 2-entity EVN org model was deliberately unified into one generic `OrgUnit`
tree rather than copied).

## Evidence

- `docs/expansion/product-roadmap.md:24-42` — §1.1 "Mô hình vendor ↔ client": "EVN = một
  CLIENT mẫu", "**TUYỆT ĐỐI KHÔNG hardcode nghiệp vụ EVN** … đó là cấu hình của client,
  không phải code của vendor", two admin tiers, "phỏng theo, KHÔNG copy".
- `docs/expansion/product-roadmap.md:181-187` — B2 decision: EVN's 2-entity
  `Organization`+`Department` was **unified into one generic `OrgUnit` tree**, not copied.
- `docs/expansion/product-roadmap.md:406-412` — guardrails: "Không hardcode nghiệp vụ
  client (EVN)… đều là DATA client"; "Không copy EVN (TypeORM, kiến trúc khác)".
- Code realisation: `apps/api/prisma/schema.prisma` models `Tenant`/`Function`/`OrgUnit`
  as generic, data-driven entities (see ADR-0020, ADR-0021).
- Related ADRs: [ADR-0019](ADR-0019-prisma-not-typeorm.md) (emulate-not-copy → Prisma),
  [ADR-0020](ADR-0020-shared-db-tenancy-chokepoint.md), [ADR-0021](ADR-0021-data-driven-rbac-wildcard.md).
