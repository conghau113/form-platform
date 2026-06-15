---
"@org/form-schema": minor
"@org/form-renderer-web": minor
---

Add the responsive `array.variant: "auto"` option (Builder UX v2, R3).

`form-schema` widens `ArrayField.variant` from `"card" | "table"` to
`"card" | "table" | "auto"`. This is an additive enum value — old saved JSON (no
variant, or `card`/`table`) still parses unchanged, so `CURRENT_FORM_VERSION` is not
bumped.

`form-renderer-web` resolves `"auto"` at render time via antd's `Grid.useBreakpoint()`:
the table layout on `>=md` viewports, cards below. `"card"`/`"table"`/unset keep their
fixed layout (unset still defaults to cards). The native renderer can ignore the prop and
always render cards.
