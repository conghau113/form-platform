# api — architecture

NestJS backend. File-backed persistence (`.data/`) for forms and themes. The server is
the source of truth: every saved body is run through the schema's `migrate` /
`migrateTheme` (validate + normalize) before it lands on disk. ESM, `module: NodeNext`
→ relative imports use explicit `.js` extensions.

## Layout (`src/`)
| Concern | File |
|---|---|
| Bootstrap (CORS, port) | `main.ts` |
| Root module — composes feature modules | `app.module.ts` |
| Shared storage helpers (`DATA_DIR`, `dataFile`, `ensureDataDir`) | `common/file-store.ts` |
| Forms feature (save/load `<id>.json`) | `modules/forms/{forms.module,forms.controller,forms.service}.ts` |
| Themes feature (save/load `<id>.theme.json`) | `modules/themes/{themes.module,themes.controller,themes.service}.ts` |

## Adding a feature
Create `src/modules/<feature>/` with a `*.module.ts` (declares its controllers +
providers) and register it in `app.module.ts`'s `imports`. Reuse `common/file-store.ts`
for path resolution + the path-traversal id guard rather than re-deriving `.data` paths.

## Endpoints
- `POST /forms` → save (400 on invalid) · `GET /forms/:id` → load (404 if missing)
- `POST /themes/:id` → save · `GET /themes/:id` → load
