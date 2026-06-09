# Form Platform — monorepo starter

A schema-driven form builder split so one JSON contract drives many platforms.

## Packages

| Package | Role | Weight | Installed by |
|---|---|---|---|
| `@org/form-schema` | The CONTRACT: types, Zod validation, `formVersion` + migration chain | tiny | everyone |
| `@org/form-core` | Platform-agnostic runtime: safe conditional logic, RBAC, registry interface | small | every renderer |
| `@org/form-renderer-web` | antd renderer, responsive (24-col, xs/sm/md/lg) | medium | every web project |
| `@org/form-renderer-native` | React Native renderer, single-column | medium | every mobile project |
| `@app/builder` | The drag-drop builder app, hosted ONCE | heavy | nobody (it's an app) |

## The two ideas that make this last

1. **One schema, many renderers.** The schema is platform-agnostic data. Web and
   native each have their own renderer but share `form-schema` + `form-core`
   (validation, conditional logic, RBAC). antd is web-only, so the native renderer
   is a separate implementation — only the leaf components differ.

2. **`formVersion` is decoupled from the package version.** Bump the package on
   every code change; bump `formVersion` only when the JSON shape changes, and add
   a migration. A renderer can load ANY older JSON via the migration chain. That is
   what prevents "version conflicts" — old saved forms keep rendering, and a project
   on renderer v1 and another on v3 coexist because their data migrates independently.

## Commands

```bash
pnpm install
pnpm build          # turbo: builds packages in dependency order
pnpm test           # runs the migration tests in form-schema
pnpm changeset      # record a version bump + changelog entry
pnpm version-packages
pnpm release        # build + changeset publish to your PRIVATE registry
```

## Versioning rules of thumb

- Breaking change to the schema shape -> MAJOR on `@org/form-schema` + new `formVersion` + migration.
- `react`, `react-dom`, `antd`, `react-native` are **peerDependencies** in the
  renderers (never bundled) — the host app owns those versions.
- Publish to a private registry (GitHub Packages / Verdaccio / Nexus), not public npm.

> Versions in package.json are illustrative — pin the latest stable when you install.
