# CaseTrack — Phase 2B Audit Environment Status

**Current status: Incomplete.** Admin Panel authenticated data verification is now complete. The valid Password Setup form remains blocked because its two backend handlers are absent from the current Functions exports.

## Final verification result — 12 November 2026

| Check | Executed result |
|---|---|
| System Node | `v24.22.0`, preserved |
| Temporary Node | Official portable `v22.23.5`; checksum verified; no global install or PATH change |
| Existing emulator configuration | `firebase.admin-panel.local.json`, unchanged |
| Project and rules | `demo-casetrack-role-prototype`, existing `firestore.admin-panel.rules`, unchanged |
| Auth / Firestore / Functions | `127.0.0.1:9198` / `127.0.0.1:8187` / `127.0.0.1:5003` |
| Functions discovery | Initial 10-second discovery timeout; subsequent startup loaded all eight exports under Node 22. Final repeat with process-local `FUNCTIONS_DISCOVERY_TIMEOUT=60` succeeded. |
| Admin endpoints | `getMyAccess`, `listUserRoles`, `policeStations`: unauthenticated HTTP 401, authenticated browser HTTP 200 |
| Admin Panel | Actual Login form + role checks; two synthetic user-role rows and one station rendered; seven sizes × two themes verified |
| Password Setup | Registry helper confirmed active synthetic token. Validator and completion endpoint HTTP 404; valid form remained hidden. |
| New evidence | 35 new PNGs; 266 total including all previous captures |
| New issues | UX-016 transparent Manage dialog; UX-017 light-theme table text contrast. UX-001–UX-015 preserved. |

The full investigation, exact errors, endpoint table, interaction checks, and remaining approval boundary are in [PHASE-2B-FINAL-VERIFICATION.md](PHASE-2B-FINAL-VERIFICATION.md). Machine evidence: [browser](screenshots/phase2b-final-verification.json), [endpoints/styles](screenshots/phase2b-final-supplement.json), [final startup repeat](screenshots/phase2b-final-restart.json), and [runtime excerpts](screenshots/phase2b-final-runtime.txt).

## Authentication and safe data use

The existing Vite `role-admin-local` alias connected to demo emulators. The browser used `http://127.0.0.1:5174/CaseTrack/`; existing environment variables selected ports 9198/8187/5003. Chrome 156.0.8078.80 and existing Playwright 1.58.2 were used. Remote Firebase hosts were guarded, and no remote Firebase browser request was observed. No production project request was issued by audit scripts.

Two synthetic Auth accounts with generated passwords and `@example.test` addresses were seeded for this final pass: active Admin and active station-assigned Operator. Firestore contained their roles, one synthetic station, the Admin governance document, and a hashed one-time setup token. Fixture setup used Admin SDK emulator access; UI reads used existing authentication, endpoints, and rules. No session or role was injected into the browser. Credentials and token were kept only in a temporary manifest and are excluded from retained evidence.

The earlier Operator audit remains valid as a separate run: four synthetic FIR masters, five linked proceedings, PO/disposed cases, hearings, judges, and investigating officers supported 12 authenticated Operator routes across seven sizes and both themes. Those earlier case fixtures were not required or recreated for this Admin/setup-only pass.

## Remaining blocker and approval requirement

The source referenced by the existing emulator config exports eight functions. `validateOperatorSetupCode` and `completeOperatorPasswordSetup` are absent; the frontend still calls them. An active local setup token cannot reveal the form without its genuine server validator. Browser preflight returns 404 without a CORS header, producing `net::ERR_FAILED` and the unavailable-link message.

Completing this state requires a separately approved backend source repair or an approved existing implementation that provides both handlers. Current authorization prohibits application source changes. No handler, mock response, auth bypass, CORS relaxation, or rule change was introduced. Phase 2B must remain incomplete until a valid link renders and the form is verified at the target sizes.

## Checks still unverified

- Valid Password Setup layout and interaction/submission states, including one-time consumption.
- Role mutations, successful credential reset/provisioning, and pagination beyond two users.
- Full screen-reader, keyboard, zoom, touch, and automated accessibility coverage. This pass performed only targeted label, dialog keyboard, and table contrast checks.
- Earlier outstanding Edit Case and other create/update/delete workflows, production build, and deployment.

## Cleanup

Synthetic Auth and Firestore data were explicitly cleared through fixed demo emulator DELETE endpoints; both returned HTTP 200. Browser contexts, Vite, and all emulators were stopped. After the final startup-only repeat, no listener remained on 5174, 9198, 8187, 5003, 4400, 4500, or 9150. Temporary runtime copies, credentials, scripts, downloaded archives, and generated debug logs were removed after evidence preservation. Hash checks confirmed all seven existing modified source files were preserved; audit text contained no generated password or setup token. System Node remains v24.22.0. See [cleanup evidence](screenshots/phase2b-final-cleanup.json).
