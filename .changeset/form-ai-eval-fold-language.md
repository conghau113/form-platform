---
"@org/form-ai": patch
---

Make the golden-set eval robust to legitimate language variation and tighten the
generation prompt's language directive:

- Eval scoring now matches `expectFields` diacritic-/case-/separator-insensitively
  (via `@org/ai-core` `foldedIncludes`), so a Vietnamese label like `"Họ và tên"`
  matches an ascii needle without the assertion being brittle to diacritics.
- The generation prompt now states explicitly that every human-readable string
  (title, label, placeholder, option text) must be in the request's language and
  must not default to English — reducing language drift on non-English prompts.
