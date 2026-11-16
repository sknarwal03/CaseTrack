# Phase 3B — Isolated Playwright Smoke Test

**Run date:** 15 November 2026  
**Local Playwright capability:** READY  
**Authenticated CaseTrack verification:** Not tested by this phase

## 1. Executive summary

The existing Playwright installation successfully launched the installed Chrome executable in a fresh headless process and isolated temporary profile. An in-memory synthetic fixture rendered and supported DOM inspection and interaction. All seven viewport widths, light/dark computed styles, three screenshot captures, keyboard checks, and browser shutdown passed. No requests to external or application services were made.

This establishes local Playwright smoke-test capability only. It does not verify CaseTrack routes, authenticated behavior, Firebase, or any open UX issue. CUA remains unavailable as recorded in the prior Phase 3 report; this run did not attempt to repair it.

## 2. Approved scope and isolation

- Used existing Playwright 1.64.1 from `e2e/node_modules` and installed Google Chrome.
- Launched a fresh headless Chrome process with a new profile directory under the unique temporary workspace. Did not reuse an existing profile, browser session, or debugging endpoint.
- Used `page.setContent()` with a self-contained synthetic HTML/CSS/JavaScript fixture. No CaseTrack URL, external resource, or Firebase service was accessed. The page request guard recorded zero unexpected network requests.
- Kept the script, profile, JSON result, and screenshots outside the repository in `%TEMP%\casetrack-pw-smoke-61d1b865351f4bc9bab9acf9296c2e42\`.
- Only the report in this document was added to the repository. No app source, Firebase configuration, issue register, or checklist was changed.

## 3. Environment baseline

| Item | Result |
|---|---|
| Branch / commit | `codex/increment-1b-b1-token-infrastructure` / `17213a6b0c53cccbd9233a73517e254ed2b0622b` |
| OS | Windows 10, build 19045, x64 |
| Node / npm | Node `v24.22.0`; npm `11.19.1` at this run |
| Playwright | `1.64.1`, existing installation under `e2e/node_modules` |
| Browser | `C:\Program Files\Google\Chrome\Application\chrome.exe`, Google Chrome `157.0.8103.51` |
| Other installed browser observed | Microsoft Edge `157.0.4341.60`; not used |
| Existing browser processes | Left untouched; test created and closed a separate Chrome process |
| Git baseline | Branch and commit above; working-tree status counts remained the pre-existing ` M=23, MM=6, M =10, A =319, AM=3, ??=23` before this report was added |

## 4. Fixture and test results

The fixture contained a heading, paragraph, button, text input, one-row synthetic table, native dialog, light/dark styles, focus-visible styles, and a responsive grid. The button updated visible text; the input accepted synthetic text; the dialog opened and closed with Escape.

| Scenario | Result | Evidence |
|---|---|---|
| Browser launch | **PASS** | Fresh headless Chrome, version `157.0.8103.51`; isolated temporary profile |
| Page rendering / DOM | **PASS** | Heading visible; paragraph text, table row, and dialog found by DOM queries |
| Interaction | **PASS** | Button changed “Ready” to “Updated”; input accepted `synthetic-value`; visibility query passed |
| Responsive layout | **PASS** | At each width, document `scrollWidth` equaled viewport width; one-column layout at widths ≤600px and two columns above 600px |
| Theme rendering | **PASS** | Computed light foreground/background `rgb(24, 34, 45)` / `rgb(255, 255, 255)`; dark `rgb(240, 244, 248)` / `rgb(17, 25, 35)` |
| Screenshot capture | **PASS** | Three nonempty PNGs verified by signature and dimensions |
| Keyboard | **PASS** | Tab focus order reached `action`, then `sample`; both had visible solid focus outlines; synthetic dialog closed on Escape |
| Network isolation | **PASS** | Zero unexpected requests recorded |
| Browser cleanup | **PASS** | Playwright context closed; no process remained whose command line referenced the isolated profile |
| Page errors | **PASS** | Zero page errors |

### Viewport matrix

All tests used a viewport height of 800px.

| Width | Responsive layout | Page horizontal overflow | Result |
|---:|---|---|---|
| 320px | 1 column | None (`scrollWidth=320`) | PASS |
| 375px | 1 column | None (`scrollWidth=375`) | PASS |
| 430px | 1 column | None (`scrollWidth=430`) | PASS |
| 768px | 2 columns | None (`scrollWidth=768`) | PASS |
| 1024px | 2 columns | None (`scrollWidth=1024`) | PASS |
| 1366px | 2 columns | None (`scrollWidth=1366`) | PASS |
| 1920px | 2 columns | None (`scrollWidth=1920`) | PASS |

### Screenshots

All files remain in the temporary workspace and were not copied into the repository.

| File | Dimensions | Size |
|---|---:|---:|
| `desktop-light.png` | 1366 × 800 | 24,267 bytes |
| `mobile-light.png` | 320 × 800 | 20,392 bytes |
| `desktop-dark.png` | 1366 × 800 | 24,125 bytes |

## 5. Initial harness correction

The first run reached all browser checks but its keyboard assertion began from a stale focus position after prior interactions, so that assertion failed. This was a fixture-harness issue, not a browser launch or CaseTrack result. The keyboard check was corrected to reset focus by clicking the page background, and the complete smoke suite was rerun in a second fresh temporary profile. The final run passed every required check. No security flags were weakened during the correction.

## 6. Cleanup and non-modification confirmations

- The temporary Playwright context was closed and the test-owned browser process exited. The isolated temporary profile and evidence files remain in the temporary workspace for review.
- Firebase Emulator: **UNTOUCHED**. No emulator process was started, stopped, or configured.
- ADC: **UNTOUCHED**. No credential contents or metadata were inspected, and no ADC file or environment setting was changed.
- Production services: **UNTOUCHED**. No production URL or Firebase endpoint was accessed.
- Existing browser sessions/processes: **UNTOUCHED**.
- Dependencies/runtime: **UNCHANGED**. No package install, browser download, or runtime download was performed.
- Git history: **UNCHANGED**. No commit, push, or merge was performed.
- Repository source and Firebase configuration: **UNCHANGED**.
- Existing staged, unstaged, and untracked changes were preserved. The only new repository file is this report.

## 7. Limitations and classification

**Local Playwright capability: READY.** Browser launch, static rendering, DOM inspection, interaction, viewport changes, theme rendering, screenshot capture, keyboard checks, and clean shutdown passed.

**Authenticated CaseTrack verification: NOT ESTABLISHED.** The fixture is synthetic and does not prove the behavior of CaseTrack pages, authentication, permissions, backend services, or any UI/UX acceptance criteria. Firebase emulator and production testing were outside the approved scope.

## 8. Recommended next step

Request separate approval for a distinct authenticated CaseTrack verification phase that specifies permitted local services and synthetic test accounts. Keep emulator and ADC work out of scope unless separately authorized. Use this isolated Playwright setup for the approved browser portion; do not treat this smoke test as closure evidence for UX issues.
