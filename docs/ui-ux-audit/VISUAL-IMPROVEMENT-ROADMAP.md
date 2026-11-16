# CaseTrack — Visual Improvement Roadmap

This roadmap records follow-up candidates from the rendered audit. It does not implement UI fixes.

| Phase | Priority | Recommendation | Dependency | Evidence / acceptance |
|---|---|---|---|---|
| 0 — Complete valid Setup verification | P0 | Provide the missing `validateOperatorSetupCode` / `completeOperatorPasswordSetup` backend handlers, then verify a synthetic valid form at all target sizes. Node 22 and Admin data verification are complete. | Separate source-change approval; current audit prohibits application edits. | Genuine validator/completion endpoints available in demo emulator; valid form renders. |
| 1 — Resolve confirmed mobile collisions | P1 | Review Dashboard chart heading/selector, chart legends, and populated Register Diary row at 320/375/430 px. | UX-013, UX-014, UX-015 screenshots. | No title/control collision; chart labels readable; Diary metadata and controls have separate hit areas. |
| 2 — Choose responsive table strategy | P1 | Review All Cases, FIR Index, nested FIR accused table, and Disposed views with row identity and action needs. | UX-009 rendered confirmation. | At target widths, primary identity/action is discoverable and any horizontal scroll is apparent and keyboard usable. |
| 3 — Align account-flow visuals | P1 | Bring Password Setup valid/invalid states into the shared CaseTrack account visual system and measure contrast. | Working local setup validator; UX-011. | Both states captured at mobile/desktop and remain readable; applicable text/control contrast meets WCAG 2.2 AA. |
| 4 — Clarify Landing preview | P2 | Simplify the nested dashboard preview or make its decorative role clear on phones. | UX-012. | At 320/375 px the preview is legible or nonessential/decorative and does not compete with the primary action. |
| 5 — Interaction and accessibility pass | P1 | Run keyboard, focus, contrast, screen reader, touch target, and zoom checks on authenticated pages and dialogs. | Protected admin/setup view available; no production access. | Findings recorded with reproducible state and measured evidence. |
| 6 — Consolidate shared components | P2 | Standardize tokens/components based on verified page comparisons, not assumptions. | Phases 1–5; preserve current CaseTrack identity. | Component matrix covers both themes, states, and route breakpoints. |
| 7 — Admin dialog and light table readability | P1 | Address transparent dialog surface and low-contrast station headings/UIDs. | UX-016/UX-017 final rendered evidence; separate UI fix authorization. | Opaque themed dialog; normal-size table text at least 4.5:1 in both themes; repeat mobile/desktop captures. |

## Recommended order

Finish the valid Setup form after approved backend repair; Admin data verification is complete. Then address the Admin dialog/contrast defects, confirmed mobile collisions, and table behavior. Revisit Password Setup and the Landing preview independently. Carry out visual changes only after the review findings are ready for implementation planning.
