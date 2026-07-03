# ADR-0019: Prisma (not TypeORM) as the API persistence layer

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; in force from Track W persistence (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** `apps/api/prisma/schema.prisma`; product-roadmap §1.1 reference note; `apps/api` persistence layer.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

The API (`apps/api`, NestJS) needs an ORM. The EVN reference system this product emulates
uses **TypeORM**. The persistence layer was built in Track W and now spans ~17 repositories
behind abstract interfaces, with additive Prisma migrations.

## Decision

The API uses **Prisma** as its ORM, **not TypeORM** — even though the emulated EVN
reference uses TypeORM. Persistence is expressed as `schema.prisma` + Prisma migrations,
and services depend on **abstract repository interfaces**, never on Prisma directly (the
Prisma implementation is one swappable adapter behind each `*Repo`).

## Rationale

This is a direct application of "emulate, don't copy" (ADR-0018): the product borrows
EVN's *domain model* while implementing it on the vendor's own stack. Choosing TypeORM
merely because the reference used it would inherit another system's technical decisions
with no benefit. Prisma gives a typed client and a first-class additive-migration workflow
that matches the platform's additive-change discipline (cf. ADR-0014 for the schema
contract). Keeping services behind abstract repositories means the ORM choice is
contained: it is an implementation detail of the persistence layer, not something the
domain services couple to — so this decision, while settled, is also cheap to revisit
should it ever need to be. Recording it prevents a future session from "aligning with the
EVN reference" by reintroducing TypeORM.

## Evidence

- `apps/api/prisma/schema.prisma:5-12` — `generator client { provider = "prisma-client-js" }`
  and `datasource db { provider = "postgresql" ... }`.
- `apps/api/src/persistence/repositories/rbac.repo.ts:1-7` — services "depend on this
  interface, never on Prisma"; Prisma impls live under `persistence/prisma/`.
- `docs/expansion/product-roadmap.md:59` — "**Prisma, không TypeORM** — phỏng theo mô hình
  EVN, hiện thực bằng Prisma additive migrations"; `:412` — "Không copy EVN (TypeORM…)".
- Origin commit: `9476f80` *feat(api): W0 — Prisma persistence + repository layer; migrate
  flat .data to DB* (Postgres came later, production-hardening 1B).
- Related: [ADR-0018](ADR-0018-vendor-client-no-hardcoded-business.md) (the emulate-not-copy principle).
