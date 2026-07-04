<!-- TEMPLATE — copy to reports/drift/DRIFT-<date>-<artifact>.md and fill. Delete this comment. -->

# Drift report — <artifact id> — <YYYY-MM-DD>

> **Nature:** Evidence (append-only, §5) · **Date:** <YYYY-MM-DD> · **Author:** <agent/owner>
> **Method:** <the index.yaml method that was run> · **Result:** DRIFT FOUND / clean
> **Evidence class:** E1 (a drift claim requires the method to have been run — §7/§10)

- **Registered artifact:** <index.yaml id> (`<path>`)
- **Scope checked:** <the L0 globs from the index entry>
- **Claimed `verified-on`:** <date on the doc/index>
- **Drift:** <what the doc claims> **vs** <what L0 actually shows>
- **Method output (evidence):**
  ```
  <the actual command output that proves the drift>
  ```
- **Severity:** <low | medium | high — does it mislead a decision?>
- **Disposition:** <filed as remediation task … | fixed in commit … | accepted + re-stamped `verified-on`>
  (drift is a defect remediated as its OWN task — never patched silently mid-work, §10)
- **Notes:**
