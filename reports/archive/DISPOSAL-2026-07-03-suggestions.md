# Disposal record — `suggestions.txt`

- **Disposed:** 2026-07-03
- **Task:** E0 T0.3.2 (AI Dev Framework tracker `docs/expansion/ai-dev-framework.md`).
- **Governance:** [ADR-0007](../../decision-records/ADR-0007-untracked-artifacts-disposition.md)
  6-step disposal workflow (Verify → Extract → Review → Commit → Archive → Delete).
- **Archived copy:** [`suggestions-2026-07-03.txt`](./suggestions-2026-07-03.txt)
  (verbatim; sha1 `af3791caab51825681ecf557dc0f8001ae8facfe`, validated identical to the
  original before deletion).
- **Original committed (safety net) at:** `1bb4d4e` (raw file tracked at repo root before
  archive/delete).

## What it was

An external (codex) review of an **early draft** of `docs/expansion/product-roadmap.md`.
It flagged accuracy gaps ("không bịa") and proposed roadmap additions. It was untracked in
the working tree.

## Why disposed

It is a **stale, context-poisoning artifact**: its suggestions have since been absorbed
into the roadmap, and several of its factual claims are now **false** (a future AI session
finding it would be misinformed). Per ADR-0007 it is "present poison" and must leave the
tree; its still-useful content already lives in the governed roadmap.

## Extract — absorption ledger (verified against `docs/expansion/product-roadmap.md` on 2026-07-03)

| suggestions.txt item | Disposition |
|---|---|
| Evidence ledger (source path / file / date / conclusion) | **Absorbed** → roadmap §7 "Evidence ledger" (attributed "codex đề xuất") + §6.6 |
| `VITE_BASE_PATH` / router basename / nginx base-path "not in source" | **Absorbed + partially shipped** — labelled "📋 CHƯA có trong source" then implemented in Phase 0 (`49dbe18`); full nginx sub-path remains a documented known-gap |
| "Tenant/Membership/UserRole/RefreshToken/RequireFunction/FunctionGuard planned, not in source yet" | **NOW FALSE** — all shipped (A1 refresh, B1–B4 tenant/org, C1/C2/C4 RBAC). This is the exact stale claim ADR-0007 cites |
| Link `[[session-resume-ai-agent-native]]` not verifiable | **Resolved** — not present in current roadmap |
| Migration strategy ownerId → tenantId | **Absorbed + shipped** — roadmap B4 (`20260702063854_add_tenant` + backfill) |
| Function-catalog governance (stable codes, seed, client can't override) | **Absorbed** — roadmap C5 (base catalog seeded, `*` hidden from `listFunctions`) |
| Audit log for admin/RBAC actions | **Absorbed + shipped** — roadmap D1 (`AuditLog` model + admin UI) |
| Test plan for tenant/RBAC (cross-tenant leak, data-scope, multi-role union) | **Absorbed** — roadmap §8 (cross-tenant-404 tests implemented in B/C) |
| AppShell rollout (wrap current `/projects` first) | **Absorbed + shipped** — roadmap §6 (`ProjectWorkspace` becomes a section) + AppShell (`70c803d`) |
| Numbering typo "6.7 before 6.6" | **Fixed** — §6.6 precedes §6.7 in the current roadmap |

**Conclusion:** every item is already absorbed, shipped, or now-stale. **Nothing remained
open to port** — the Extract step ports zero new items into the roadmap or an ADR.

## Recoverability

Full content is preserved in `suggestions-2026-07-03.txt` (this directory) and in git
history at commit `1bb4d4e`.
