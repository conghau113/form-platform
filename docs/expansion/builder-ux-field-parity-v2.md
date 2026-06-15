# Builder UX & field‑parity v2 — taxonomy, presets, icons, token‑style

> Planning doc (written 2026‑06‑15). Goal stated by the product owner: **make it easy
> for end users to manipulate and configure forms the way they want.** Two themes:
> (A) bring the component set + categorisation to Formily‑antd parity, and (B) make the
> Property panel far more usable (presets, pinning, icons, controlled styling).
>
> This builds on `formily-parity-dnd-props.md` (tracks X/D, both complete). It is a
> *planning doc*, not a spec freeze — each phase still gets its own plan + tests +
> changeset. **Everything is additive** per the golden rules unless a row says otherwise.

---

## Status at a glance (updated 2026‑06‑15)

Branch `refactor/modularize-fe-be`. Progress against the **Suggested ordering** below.
This table is the single human‑facing tracker — keep it current as each phase lands.
`pending` = committed but commit hash to fill in; `uncommitted` = code done, on disk,
not yet committed (user gates the commit).

| Phase | What | Status | Commit |
| --- | --- | --- | --- |
| R1 | Re‑taxonomy palette (Inputs/Layouts/Arrays/Displays) + relabel | ✅ Done | `bb3f9f0` |
| G1 | Palette search + per‑type icons + tooltips | ✅ Done | `bb3f9f0` |
| G2 | Property panel collapsible sections | ✅ Done | `bb3f9f0` |
| R3 | Array Cards/Table chips + `variant:"auto"` (responsive) | ✅ Done | `uncommitted` |
| R4 | UploadDragger palette chip (built‑in seed) | ✅ Done | `uncommitted` |
| S1 | Setter vocab: icon/token/keyValue/marks (gates I & T) | ⬜ Next | — |
| I1 | Icon registry (token→component) + `prefixIcon`/`suffixIcon` | ⬜ Todo | — |
| I2 | Icon‑picker setter wired into input family | ⬜ Todo | — |
| P1 | Preset data model + storage (api + builder) | ⬜ Todo | — |
| P2 | Preset gallery UI (save/edit/delete, drag→canvas) | ⬜ Todo | — |
| P3 | Built‑in preset library | ⬜ Todo | — |
| G3 | Search within property panel + pin setters | ⬜ Todo | — |
| U1 | Pinning (setters + presets/fields) | ⬜ Todo | — |
| T1 | Typed style tokens (guarded subset) | ⬜ Todo | — |
| T2 | Builder style setters (uses S1) | ⬜ Todo | — |
| R2 | Display "Text" read‑only type | ⬜ Todo | — |
| R5 | Transfer field | ⬜ Todo | — |
| R6 | Object (named nested value container) | ⬜ Todo | — |
| R7 | Form Layout container | ⬜ Todo | — |

**R3/R4 notes:** first additive *schema* change of this plan — `ArrayField.variant`
enum widened `card|table` → `card|table|auto` (no `formVersion` bump). The web renderer
resolves `auto` via `Grid.useBreakpoint()` (table ≥md, cards below). R3/R4 also added the
data‑driven `paletteVariants` mechanism (one schema `type` → several palette chips, each
seeding a default‑prop `patch`) — the minimal in‑app seed of the Track P preset system.
Changeset: `.changeset/array-variant-auto-r3.md`.

**Next:** **S1** — it gates the icon (I) and token‑style (T) tracks.

---

## Locked decisions (from the owner, 2026‑06‑15)

1. **Styling = token‑based, controlled.** Expose a SAFE, typed subset (size, width,
   align, variant, theme‑token overrides). **No arbitrary inline `style`** — it breaks
   "semantic layout only" and the native renderer can't honour it. Presets may still
   capture these typed values.
2. **Presets = built‑in + backend‑synced.** Built‑in library ships with the app; user
   presets persist via `apps/api` so they follow the user across forms/machines and can
   be shared. CRUD by the user.
3. **Icons = Lucide + antd, extensible registry.** Schema stores a string token
   (`"lucide:search"`, `"antd:SearchOutlined"`), the renderer resolves it via an icon
   registry. A future bespoke icon set = register a new namespace; **no schema change**.
4. **Array switch = add `variant: "auto"`.** `array` stays one type with three palette
   entries: Array (list, `variant:"auto"` → web table / mobile card), Array Cards
   (`"card"`), Array Table (`"table"`).

## Two divergences we KEEP (do not "fix")
Same as the X/D doc: **closed typed contract, not an open `x-component-props` bag**; and
**JSONLogic only, never `eval`/`new Function`**. The expansions below grow the *typed*
surface and add *declarative* tokens — they never open a free‑form bag or run code.

---

## Current state (what we found)

- Palette categories are ad‑hoc (`Input/Choice/Boolean/Number/Date & time/Advanced/
  Layout`). Owner wants Formily‑antd's 4: **Inputs / Layouts / Arrays / Displays**.
- `type:"text"` is actually the **antd Input** (placeholder/prefix/suffix…). The owner's
  "Text" is a read‑only **Display**. → relabel `text`→"Input"; add a new display type.
- `array` **already** carries `variant?: "card"|"table"` + table inline‑edit
  (`schema.ts:566`). Array Cards/Table are mostly a palette + renderer surfacing job.
- `prefix`/`suffix` are **plain strings** today (`FieldControl.tsx`); no icon mechanism.
- `SettingControl` vocabulary is `text|number|checkbox|options|select|segmented|slider`.
  Icon picker, token/style, key‑value (slider marks) setters are missing.
- **Missing field types** vs the target set: `transfer`, `object` (named nested value
  container), Form Layout container, the display `text`. UploadDragger exists only as a
  `dragger` boolean flag.

Target field set (owner): **Inputs**: Input, TextArea, Password, NumberInput, Rate,
Slider, Select, TreeSelect, Cascader, Transfer, Checkbox, Radio, DatePicker, DateRange,
TimePicker, TimeRange, Upload, UploadDragger, Switch, Object · **Layouts**: Card, Grid,
Tabs, Form Layout, Collapse, Space · **Arrays**: Array (list, switchable), Array Cards,
Array Table · **Displays**: Text. (`color` stays — not in the list but kept, additive.)

---

## Tracks & phases

Five tracks. **S (setters) gates I and T.** R is mostly independent (cheap wins first).

### Track R — Taxonomy & missing fields
| # | What | Schema impact | Effort |
| --- | --- | --- | --- |
| **R1** | Re‑categorise palette → Inputs/Layouts/Arrays/Displays; relabel `text`→"Input"; surface the container layouts (Card/Grid/Tabs/Collapse/Space) in the palette under Layouts | none (builder‑only) | S |
| **R2** | **Display "Text"** — new read‑only type `display-text` (renders authored content/typography; no value) | additive new type | S–M |
| **R3** | **Array Cards/Table + `variant:"auto"`** — 3 palette entries, one `array` type; add `"auto"` to the variant enum; web=table / mobile=card responsive render | additive enum value | M |
| **R4** | **UploadDragger** palette entry (seeds `upload` + `dragger:true`) — implemented as a built‑in preset (see Track P) | none | S |
| **R5** | **Transfer** field — new type, dual‑list, options via existing DataSourceEditor | additive new type | M |
| **R6** | **Object** — named nested value container (children's values nest under its name); needs form‑core path handling + registry behavior | additive new type | L |
| **R7** | **Form Layout** container — applies labelCol/`layout` (horizontal/vertical/inline) to descendant Form.Items via context | additive new type | M |

### Track S — Setter vocabulary completion (gates I & T)
| # | What | Effort |
| --- | --- | --- |
| **S1** | Add setter kinds: `icon` (picker), `token`/style setters, `keyValue`/`marks` (unblocks slider marks), plus the still‑deferred `color`/`multiSelect`/`textarea`/`json`. Descriptor‑driven, reused across fields. No schema change. | M |

### Track I — Icons (prefix/suffix + addons)
| # | What | Schema impact | Effort |
| --- | --- | --- | --- |
| **I1** | Icon **registry** (token→component) in the web renderer + resolver; ship Lucide + antd namespaces. Schema: additive `prefixIcon`/`suffixIcon` (string token) on the input family (keep existing text `prefix`/`suffix`). | additive | M |
| **I2** | Icon‑picker **setter** (S1) wired into the input family; searchable, grouped by namespace. | none | M |

### Track P — Preset system (the flagship)
| # | What | Where | Effort |
| --- | --- | --- | --- |
| **P1** | Preset **data model + storage**: `{id, fieldType, name, icon?, patch}`. Built‑in registry in‑app; user presets CRUD via a new `apps/api` feature module (file‑backed). | api + builder | M |
| **P2** | Builder **UI**: preset gallery in the palette (grouped, searchable, add/edit/delete), "Save current field as preset", drag preset → canvas applies `newField(type)+patch`. | builder | M–L |
| **P3** | Ship **built‑in preset library**: Search input (suffix search icon), Currency NumberInput, Email, OTP, Date‑of‑birth, Avatar upload (picture‑card), UploadDragger, etc. | builder | S |

### Track T — Token‑based styling & decorator
| # | What | Schema impact | Effort |
| --- | --- | --- | --- |
| **T1** | Typed **style tokens** (guarded subset: width/min‑width, align, density/size, variant, a few theme‑token overrides). Renderer maps to antd token/className — portable, native can ignore safely. | additive | M |
| **T2** | Builder **setters** for the token subset (uses S1), grouped in a "Style" section of the Property panel. | none | S |

### Track G — Builder ergonomics (palette + property panel usability)
The two surfaces the user touches most are functional but raw: the palette is a flat
list of plain‑text chips with no search/icons, and `FieldForm` is one long ungrouped
vertical scroll. This track is the direct answer to "property settings hơi khó dùng" and
is sequenced EARLY (right after R1) because it improves every existing and future field.
| # | What | Where | Effort |
| --- | --- | --- | --- |
| **G1** | Palette: a **search/filter** box + a per‑type **icon** + a tooltip description. (`Palette.tsx` renders only text today; `ComponentMeta.icon` exists but is unused.) | builder | S |
| **G2** | Property panel: group `FieldForm` into **collapsible sections** (Basic / Properties / Validation / Layout / Logic = visibility+reactions / Permissions); the common ones open, advanced collapsed. | builder | M |
| **G3** | **Search within the property panel** + (ties to U1) pin favourite setters to the top. | builder | M |

### Track U — Ergonomics
| # | What | Where | Effort |
| --- | --- | --- | --- |
| **U1** | **Pinning**: pin favourite setters to the top of the Property panel; pin favourite presets/fields to the top of the palette. Pure builder UI state (localStorage). | builder | S |

---

## Suggested ordering (impact × cost)
1. **R1** — instant, fixes "categorisation is off", zero schema risk.
2. **G1 + G2** — palette search/icons + property‑panel grouping. Removes the usability
   pain immediately and benefits every existing + future field. (Owner's stated goal.)
3. **R3 + R4** — leverage the existing `array.variant` + a tiny preset; very visible.
4. **S1** — unblocks icons + token style + slider marks.
5. **I1 + I2** — icons in prefix/suffix (an explicit owner ask, high visibility).
6. **P1 → P2 → P3** — the preset system (the long‑term flagship).
7. **G3 + U1** — property‑panel search + pinning.
8. **T1 + T2** — token‑based styling.
9. **R2, R5, R7** — Display Text, Transfer, Form Layout (new fields).
10. **R6** — Object (heaviest; value nesting + form‑core).

## Guardrails (every phase)
- **Additive only** — optional props / new optional types; old saved JSON keeps parsing →
  no `formVersion` bump unless a *shape* changes (then bump + migration + fixture test).
- **One contract, many renderers** — new props live in `form-schema`; web renderer
  consumes; native must keep rendering (ignore web‑only props, never crash). Mark web‑only.
- **No `eval`/`new Function`** — icons, presets, style are declarative tokens/data.
- **peerDeps** — never add react/antd/react‑native as deps in renderers. Lucide is a
  renderer dependency only if it ships in the web renderer (evaluate tree‑shaking in I1).
- **DoD** — `pnpm typecheck` + `pnpm test` green, biome clean (scoped to changed files),
  a changeset per changed PUBLISHED package (`apps/*` are private → no changeset).
