---
"@org/form-schema": minor
---

Add an open compile target for agents/tooling (AI-agent-native P0). Two derived,
machine-readable projections of the existing Zod contract — neither changes the
contract or `CURRENT_FORM_VERSION`:

- `json-schema.ts`: `buildFormJsonSchema()` / `FORM_JSON_SCHEMA` emit the form
  contract as a standalone JSON Schema (draft-07) so an external tool or LLM can
  validate/author a `FormSchema` without importing Zod. Stamped with a
  version-pinned `$id` (`FORM_SCHEMA_ID`). Adds a `zod-to-json-schema` dependency.
- `capabilities.ts`: `FIELD_CAPABILITIES` / `formCapabilities()` — a flat field
  catalog (type, category, value shape, options, container) for agent discovery,
  guarded by a drift test that derives the truth set from the Zod union.
