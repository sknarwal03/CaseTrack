# Add/Edit Case Field Registry

**Authority:** Canonical field inventory for the audited implementation. Field paths below reflect observed source mapping, not a proposal to rename the schema. Repeated groups use `[]` in the form and arrays in Firestore.

| Field / form control | Type / default | Owner and Firestore path | Rules / visibility | Consumers and compatibility |
|---|---|---|---|---|
| FIR number `firno` | number input; empty | FIR Master `firMasters.firNo` | Required; identity component | Add/Edit, FIR index/register, dashboard/report, case views; legacy `firNo` |
| FIR date `firdate` | date text; empty | Master `firDate` | Required; year is derived from date | All FIR readers; legacy `firDate` |
| FIR year `firyear` | number/read-only; derived from FIR date | Master `firYear` | Required in current UI; derived | Identity/readers; legacy `firYear` |
| File No `fileNo` | text/read-only; generated/displayed | Master `fileNo`; also written to linked and legacy payloads | Derived from FIR number/year in UI | Register/dashboard/detail readers; legacy copy |
| FIR status `fir_Status` | read-only text; Under Investigation | Master `firStatus`; status code persisted by engine | Derived from linked record set | FIR summaries/register/dashboard/reports; aliases `status`, legacy `fir_Status` |
| Under Section `undersection` | text; empty | Master `underSection` | Required; saved suggestions | All FIR readers; legacy alias key preserved |
| Crime Head `crimehead` | searchable text; empty | Master `crimeHead` | Required in form; master-list persistence side effect | FIR readers; `crimeHeads` lookup collection |
| Police Station `policestation`, hidden ID `policeStationId` | text plus stable ID; assigned station | Master `policeStation`, `policeStationId` | Required; station assignment/access constrained | Identity and scoped reads; old display-only station compatibility |
| Incident date/place, beat | text/date; empty | Master `incidentDate`, `incidentPlace`, `beatDetails` | Optional | FIR Register and other case readers; legacy aliases same names |
| Complainant name/father/mobile/address | text/tel/textarea; empty | Master `complainantName`, `complainantFatherName`, `complainantMobile`, `complainantAddress` | Optional; mobile input has pattern/length constraint | FIR Register and details; legacy aliases same names |
| Court type `courttype` | select; blank | Proceeding `courtType` | Required for court record; not UCR | Register, dashboard, reports; values Lower Court, Session Court, JJB, High Court in current markup |
| Proceeding status `casestatus` | select/derived from hearing stage | Proceeding `status`; computed from latest hearing stage/transfer | Required; disabled while no active record context | Cases, dashboard, register, PO, reports; aliases `caseStatus` used by readers |
| Registration prefix/number/year/date | text/number/date | Proceeding `regPrefix`, `regNo`, `regYear`, `regDate` | Conditional court record; optional in save validation | Register/details; historical names documented in field reference |
| Court/judge selector | selector plus hidden snapshots | Proceeding `courtName`, `courtNumber`, `judgeCourtType`, `judgeName`, `judgeId`, `judgeDisplayName` | Conditional court record; judge master lookup | FIR Register, details; `judges` collection |
| Challan/charge date | date inputs/hearing-derived | Proceeding `challanDate`, `chargeDate` | Court record; `chargeDate` derived from hearing history | Case details/reports; older date aliases may be read |
| IO selection | select plus hidden snapshot | Proceeding `ioId`, `ioRank`, `ioName`, `ioBeltno`, `iomobileNo` | Court/UCR conditional; `investigatingOfficers` lookup | IO dialog/manage IO/register/details; legacy aliases `beltNo`, `mobileNo` normalized |
| Next date/trial stage/hearings | date, select, readonly marker, repeatable history | Proceeding `nextDate`, `trialStage`, `hearingDateRecord[]` (record IDs retained) | Conditional proceeding; add/edit/delete hearing controls | Register Diary, cases, dashboard, reports; legacy `nextdate`, `trial_stage` hydration |
| Accused rows | repeatable text/tel/checkbox/date/select | Proceeding `accused[]`: name, fatherName, mobile, arrested, arrestDate, custodyStatus, bailDate, poStatus, poDate, address | Optional; custody/arrest dependent UI | PO Cases, register/details; aliases normalized in `proceeding-fields.mjs` |
| Witness rows/totals | repeatable name/status/checkbox/date; totals readonly | Proceeding `witnesses[]`; total/examined/left are display-only | Optional; examined date conditional | Case details/register; older witness layouts normalized |
| UCR number/year | number + year; empty | UCR proceeding `ucrNumber` | Required for UCR; four-digit year; one UCR guard | FIR Register, status engine; legacy UCR records retained |
| UCR report type/disposal date | select/date | UCR proceeding `report_type`, `ucr_dod` | Required for UCR | FIR status derives Untraced/Cancelled from report type; old `ucrType` supported by status fallback |
| Transfer links | not direct user-entered canonical controls | Proceeding `predecessorCaseId`, `successorCaseId` | Set by commitment/transfer operations | Status and dashboard/register filtering; relationship IDs must remain stable |
| Decision/judgement/disposal reason | no current form control/save mapping found | **Unresolved / not in current Add/Edit payload** | Do not infer ownership or add schema without approval | Some readers accept historical `decisionDate`, `judgement`, disposal and reason aliases; see CT-ISSUE-001 |

## Registry maintenance

For each future field, record control and serialization, owner, exact existing Firestore path, constraints/default, conditional rules, consumers, legacy aliases, and test coverage. Confirm exact source mapping before extending this table. `ADD-CASE-DATA-MAPPING.md` describes document-level shape and write behavior.
