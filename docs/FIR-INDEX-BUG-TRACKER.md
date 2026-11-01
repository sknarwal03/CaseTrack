# FIR Index Bug Tracker

This task-specific tracker records confirmed source findings separately from conditional risks. It does not register work in the canonical project issue tracker.

| Issue ID | Severity | Component | Root Cause | Status | Proposed Fix |
|---|---|---|---|---|---|
| FIR-INDEX-001 | Medium | FIR Index search (`assets/js/fir-index.js`) | `searchMatch()` rescans all loaded records for every candidate FIR on every non-empty input event to find related proceedings. | Confirmed in source; browser impact not measured. | Precompute a related-record map keyed by the same FIR identity function. Preserve supported fields and verify search equivalence; benchmark using 1,000+ fixture records. |
| FIR-INDEX-002 | Low / data-dependent | FIR Index year picker (`assets/js/fir-index.js`) | Default year choices are current year ±5; other years appear only if passed in the URL. | Conditional risk; no data evidence of inaccessible records. Not a confirmed bug. | Check available FIR years and retention requirements. If necessary, populate from authorized record years or a scoped year query. |

## Evidence and handling

- `FIR-INDEX-001` reproduction from source: load a dataset with multiple proceedings per FIR, type a non-empty query, and observe the per-summary scan of the full `records` list. Runtime timing was not collected.
- `FIR-INDEX-002` becomes a user-facing issue only if valid FIRs exist outside the picker window and the user enters without a `?year=` parameter for that year.
- No browser, Emulator, live Firestore, or viewport test was available. No other bug is classified as confirmed.
- Implementation is not approved. Do not change application code based on this tracker until the user authorizes it.
