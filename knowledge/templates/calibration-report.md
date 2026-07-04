<!-- TEMPLATE — copy to reports/calibration/CALIBRATION-<date>.md and fill. Delete this comment. -->

# Calibration report — index freshness methods — <YYYY-MM-DD>

> **Nature:** Evidence (append-only, §5) · **Date:** <YYYY-MM-DD> · **Author:** <agent/owner>
> **Method:** run every `knowledge/index.yaml` method once against L0 · **Result:** <N pass / M drift>
> **Evidence class:** E1 (each method was executed)

Run the registered methods as a batch — the freshness detector calibrating itself (roadmap E2
validation, then each periodic sweep). A method that mis-fires on a known-good artifact is a
**detector bug**, fixed like any other.

| index id | method run? | result | note |
|---|---|---|---|
| <system-overview> | ☐ | pass / drift | |
| <api-architecture> | ☐ | pass / drift | |
| <…every artifact…> | ☐ | | |

- **False positives** (method flagged a correct doc): <method id → fix applied>
- **False negatives** (method missed real drift): <…>
- **`verified-on` updates applied:** <artifact → new date>
- **Drift findings filed:** <link the drift-report(s)>
