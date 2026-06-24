---
"@org/ai-core": minor
---

Add `foldForMatch` / `foldedIncludes` text helpers — case-, diacritic- and
separator-insensitive substring matching used by the AI eval scorers. Lets a
golden expectation authored in plain ascii (e.g. `"tu_choi"`) match a model that
legitimately emits the same concept with Vietnamese diacritics or different word
separators (e.g. `"Từ chối"`). Folding only removes characters, so it widens
matches without ever narrowing a match that already held.
