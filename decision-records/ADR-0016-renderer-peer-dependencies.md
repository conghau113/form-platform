# ADR-0016: Framework libraries are peerDependencies in renderers

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; in force from the founding of `form-renderer-web` (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** AGENTS.md "Architecture (non-negotiable)" + `packages/form-renderer-*/package.json`.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

The renderers (`form-renderer-web`, `form-renderer-native`) are libraries designed to
**drop into other host applications** (Track V, renderer portability), not just the
in-repo `apps/builder`. Each renderer maps schema to platform components using a UI
framework (React + antd on web; React Native on native).

## Decision

The host-provided UI framework libraries — `react`, `react-dom`, `antd`,
`react-native` (and on web, also `@ant-design/icons` and `@tanstack/react-query`) —
are declared as **`peerDependencies`** in renderer `package.json`, never as regular
`dependencies`, and are **never bundled** into the renderer output. They appear under
`devDependencies` only so the package can build and test itself.

## Rationale

A renderer that bundled its own React/antd would ship a second copy of those libraries
into any host that already has them. Two copies of React is a hard runtime failure
(invalid-hook-call, broken context), and two copies of antd doubles bundle size and
splits the theme/ConfigProvider context so styling silently diverges. Declaring them as
peers means the **host owns the single instance** and the renderer adapts to whatever
compatible version the host runs (hence the loose ranges, e.g. React `^18 || ^19`). This
is the standard contract for a redistributable component library and is what makes the
"one schema, many host apps" portability goal actually achievable. A future session
adding one of these to `dependencies` to make a local build "just work" would reintroduce
the duplicate-instance hazard for every downstream host — the reason the split exists must
be recorded so that convenience edit is recognized as a regression.

## Evidence

- `packages/form-renderer-web/package.json:28-34` — `peerDependencies`: `@ant-design/icons`,
  `@tanstack/react-query`, `antd`, `react` (`^18.0.0 || ^19.0.0`), `react-dom`; the same
  libraries under `devDependencies` (lines 35-51) for local build/test only.
- AGENTS.md, "Architecture (non-negotiable)": "`react`, `react-dom`, `antd`, `react-native`
  are peerDependencies in renderers. Never add them as dependencies; never bundle them."
- Portability intent: renderer-portability track (memory `renderer-portability-track-v`),
  Track V "renderer drops into other apps (react/antd peerDeps)".
- Origin commit: `236d587` *feat(form-renderer-web): antd responsive renderer + tests*.
