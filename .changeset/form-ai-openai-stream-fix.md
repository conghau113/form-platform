---
"@org/form-ai": patch
---

openai-compatible provider: explicitly request a non-streaming response
(`stream: false`) and parse the body defensively. Proxies that stream by default
(e.g. 9router) returned `data: …` SSE chunks that crashed the JSON parse; the
request now forces a single JSON body, and an unexpected streamed body throws a
clear, actionable error instead of a raw `SyntaxError`.
