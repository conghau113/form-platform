---
"@org/form-theme": minor
---

Add `@org/form-theme`: a platform-neutral design-token contract (colors, radius,
spacing, typography) with Zod validation and a versioned `migrateTheme()`, plus a
`toAntdTheme()` mapper to an antd `ThemeConfig` (default/dark algorithm). The builder
gains a Theme Editor that previews tokens live via `<ConfigProvider>`, exports theme
JSON, and persists the theme alongside its form through the API.
