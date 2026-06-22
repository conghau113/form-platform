---
"@org/form-ai": minor
---

Add `stripDisallowedUrls()` — output URL safety for generated forms (P1 slice 2).
A machine-authored form may carry a `settings.submitUrl` or field `dataSource.url`
the model was tricked into inserting (prompt-injection from an image/URL). This
pure helper removes any such URL whose host is not on an explicit allowlist
(empty allowlist ⇒ nothing external is kept) and reports what it stripped. The
HTTP endpoint `POST /ai/forms/generate` applies it with the host allowlist from
`AI_URL_ALLOWLIST`.
