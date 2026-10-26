# CaseTrack — Project Status

> **Document status:** Canonical project status summary  
> **Last updated:** 2026-10-25  
> **Issue tracker:** [PROJECT-ISSUE-TRACKER.md](./PROJECT-ISSUE-TRACKER.md)

## Current status

Four source-confirmed record-management findings have been registered for future resolution. They are all **Open** and **Not Started**. They are not completed implementation work, and no fix is authorized by this status entry.

## Known Issues & Technical Debt

Priorities are provisional and may change after impact analysis.

| Issue ID | Module | Priority | Status |
|---|---|---|---|
| [CT-ISSUE-001](./PROJECT-ISSUE-TRACKER.md#ct-issue-001) | Add/Edit Case, All Cases, Disposed Cases, FIR Register | High | Open |
| [CT-ISSUE-002](./PROJECT-ISSUE-TRACKER.md#ct-issue-002) | Documentation | Medium | Open |
| [CT-ISSUE-003](./PROJECT-ISSUE-TRACKER.md#ct-issue-003) | Register Diary | Medium | Open |
| [CT-ISSUE-004](./PROJECT-ISSUE-TRACKER.md#ct-issue-004) | PO Cases | Medium | Open |

**Open issue count:** 4

Manual issue registration follows the rules in [PROJECT-ISSUE-TRACKER.md](./PROJECT-ISSUE-TRACKER.md#manual-issue-registration). No issue is being registered by this policy update; the next available ID is **CT-ISSUE-005**.

## Audit scope and evidence boundary

- The Calendar page was excluded from the audit. Its deleted page, script, and stylesheet were left untouched.
- Register Diary date-picker workflows remained in scope.
- Findings were based on repository source and the Firestore rules file selected by the repository Firebase configuration.
- Deployed Firestore documents and deployed security rules were not verified. No production-data issue is claimed as confirmed without further evidence.
- The findings are source-confirmed code/documentation behavior, not proof that affected production records exist or have suffered data loss.

## Future issue workflow

Resolve one issue at a time when the project owner explicitly requests its ID. Revalidate the finding against current code, explain the root cause and affected modules, propose a resolution plan, and wait for explicit implementation approval. Implement and verify only the approved issue, then update its tracker entry and this status document. Do not automatically resolve other open issues. Manual registration is governed by the tracker workflow above; conversation about an idea alone does not create an issue.

