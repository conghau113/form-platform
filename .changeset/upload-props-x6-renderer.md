---
"@org/form-renderer-web": minor
---

Phase X6: the web renderer honours the new Upload props. `multiple`/`directory` thread
through to antd's `Upload`, and `dragger: true` renders `Upload.Dragger`'s drop‑zone
instead of the compact trigger button. Files still stay local unless `settings.submitUrl`
is set. Additive — uploads without the props render unchanged.
