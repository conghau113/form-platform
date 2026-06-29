---
"@org/form-renderer-web": patch
---

Stop forwarding antd `addonBefore`/`addonAfter` on `text`/`number` inputs when the field doesn't
configure them. antd 5.x deprecates those props and warns whenever the prop key is present (even
`undefined`), so the renderer was emitting the deprecation warning on every input render. The props
are now passed only when set, silencing the warning for the common (no-addon) case while keeping
addons working when configured.
