# CaseTrack Website Architecture

The diagrams below split the website architecture into smaller views so each one is easier to read.

## 1. Pages and UI components

```mermaid
flowchart LR
    Visitor([Visitor]) --> Landing["Landing page<br/>index.html"]
    Landing --> Login["Login page"]
    Login --> Dashboard["Dashboard"]

    subgraph AppPages["CaseTrack app pages"]
        Dashboard
        Cases["All Cases"]
        POCases["PO Cases"]
        Calendar["Calendar"]
        Diary["Register Diary"]
        Reports["Reports"]
        Settings["Settings"]
        Judges["All Judges"]
        Officers["Manage IO"]
    end

    subgraph SharedUI["Shared app UI"]
        Shared["Shared layout<br/>navigation · profile · theme"]
        Search["Global case search"]
        Notifications["Hearing notifications"]
        AddCase["Add Case component"]
        DateDialog["Hearing-date dialog"]
    end

    Dashboard --> Shared
    Cases --> Shared
    POCases --> Shared
    Calendar --> Shared
    Diary --> Shared
    Reports --> Shared
    Settings --> Shared
    Judges --> Shared
    Officers --> Shared

    Shared --> Search
    Shared --> Notifications
    Shared --> AddCase
    Shared --> DateDialog
    Settings --> Judges
    Settings --> Officers
    Diary --> Judges
```

## 2. JavaScript modules and imports

```mermaid
flowchart LR
    subgraph PageModules["Page entry modules"]
        Login["login.js"]
        Dashboard["dashboard.js"]
        Cases["cases.js"]
        Calendar["calendar.js"]
        Diary["register-diary.js"]
        Reports["report.js"]
        Settings["settings.js"]
        Judges["all-judges.js"]
        Officers["manage-io.js"]
    end

    subgraph SharedModules["Shared modules and components"]
        Layout["shared-layout.js"]
        AddCase["add-case.js"]
        DateDialog["notification-date-dialog.js"]
        Utils["shared-utils.js"]
        TrialStages["trial-stages.js"]
        ChargeDate["charge-date.js"]
        IODialog["io-dialog.js"]
    end

    Config["firebase-config.js"]
    FirebaseSDK["Firebase Auth and Firestore SDK"]

    Login --> Config
    Login --> FirebaseSDK
    Dashboard --> Config
    Dashboard --> Utils
    Dashboard --> TrialStages
    Cases --> Config
    Cases --> Utils
    Cases --> TrialStages
    Calendar --> Config
    Diary --> Config
    Diary --> TrialStages
    Diary --> ChargeDate
    Reports --> Config
    Settings --> Config
    Judges --> Config
    Officers --> Config
    Officers --> IODialog

    Layout --> AddCase
    Layout --> DateDialog
    Layout --> Utils
    Layout --> Config
    DateDialog --> Config
    DateDialog --> TrialStages
    DateDialog --> ChargeDate
    IODialog --> Config
```

## 3. Firebase Authentication and Firestore

```mermaid
flowchart LR
    User([User]) --> Login["Login page"]
    Login -->|Email and password| Auth["Firebase Authentication"]
    Auth -->|Credentials accepted| Dashboard["Dashboard"]
    Auth -->|Credentials rejected| Login
    Auth -->|Signed-out app session| Login
    Profile["Shared profile menu"] -->|Logout| Auth

    subgraph Firebase["Firebase project: CaseTrack"]
        Auth
        Firestore[("Cloud Firestore")]
        FIRMasters[("firMasters")]
        LinkedCases[("linkedCases")]
        CasesData[("cases")]
        JudgesData[("judges")]
        IOData[("investigatingOfficers")]
        PrefsData[("settings / preferences")]
        Firestore --- CasesData
        Firestore --- FIRMasters
        Firestore --- LinkedCases
        Firestore --- JudgesData
        Firestore --- IOData
        Firestore --- PrefsData
    end

    Dashboard --> CasesData
    Dashboard --> FIRMasters
    Dashboard --> LinkedCases
    CasesPage["All Cases"] --> CasesData
    CasesPage --> FIRMasters
    CasesPage --> LinkedCases
    Calendar["Calendar"] --> CasesData
    Diary["Register Diary"] --> CasesData
    Diary --> JudgesData
    Reports["Reports"] --> CasesData
    Settings["Settings"] --> PrefsData
    JudgesPage["All Judges"] --> JudgesData
    Officers["Manage IO"] --> IOData
    Officers --> CasesData
    Shared["Shared layout"] --> CasesData

    AuthEmulator["Auth Emulator<br/>127.0.0.1:9099"]
    StoreEmulator["Firestore Emulator<br/>127.0.0.1:8080"]
    AuthEmulator -. "test-only configuration" .-> Auth
    StoreEmulator -. "test-only configuration" .-> Firestore
```

## 4. Data flow and case-management workflow

```mermaid
flowchart LR
    User([Signed-in user]) --> Add["Add or update a case"]
    Add --> FIRMasters[("Firestore: firMasters")]
    Add --> LinkedCases[("Firestore: linkedCases")]
    Add -. "legacy edits retain original IDs" .-> Cases[("Firestore: cases")]

    FIRMasters --> Adapter["fir-case-model.js<br/>legacy compatibility adapter"]
    LinkedCases --> Adapter
    Cases --> Adapter
    Adapter --> Dashboard["Dashboard<br/>unique FIR and proceeding counts"]
    Adapter --> CaseList["All Cases<br/>search and case details"]
    Adapter --> Calendar["Calendar<br/>hearing dates"]
    Adapter --> Report["Reports<br/>FIR and proceeding summaries"]
    Adapter --> Diary["Register Diary"]

    Judges[("Firestore: judges")] --> Diary
    Diary -->|Save hearing-date changes| Cases
    Diary -->|Save notes and file status| LocalStorage[("Browser localStorage")]
    Diary -->|Save diary photos| IndexedDB[("Browser IndexedDB")]

    CaseList -->|Open a case or diary date| Diary
    Dashboard -->|Select case| CaseList
    Dashboard -->|Review reminder| Notifications["Shared hearing notifications"]
    Cases --> Notifications
    Notifications -->|Open case/date| CaseList
    Notifications -->|Update next date| DateDialog["Hearing-date dialog"]
    DateDialog -->|Commit date update| Cases
```

## 5. Build and deployment

```mermaid
flowchart LR
    Source["Vite multi-page source"] --> Build["npm run build"]
    Build --> Dist["dist/ static files"]
    Dist --> Artifact["GitHub Pages artifact"]
    Artifact --> Pages["GitHub Pages deployment"]
```

CaseTrack is a static, multi-page Vite website. Page modules access Firebase directly; this project has no separate application server. GitHub Actions builds and deploys the contents of `dist/`. The PO Cases page filters proclaimed-offender accused entries from court proceedings.

## 6. FIR Master and proceeding data model

- `firMasters/{firMasterId}` stores one verified FIR identity and FIR-level fields. New master IDs are Firestore document IDs and remain stable.
- `linkedCases/{proceedingId}` stores new court proceedings and UCR reports. Each new record has one `firId` and `firMasterId` pointing to its FIR Master. Lower Court commitments create a separate Sessions Court record and predecessor/successor IDs; the source record remains in place.
- `cases/{legacyId}` remains readable and editable for compatibility. Existing document IDs, hearing histories, and other references are retained. A user can explicitly verify and link an exact FIR number/year/police-station legacy group; that action adds relationship fields and preserves the prior `firId` in `legacyFirId`.
- `assets/js/fir-case-model.js` combines master-only FIRs, linked records, and legacy cases for page readers. It keeps collection names with records so edits and hearing-date writes reach the original document. Failed collection reads surface as errors instead of being treated as an empty result.
- `assets/js/fir-status.mjs` normalizes FIR status labels and calculates FIR status separately from proceeding status. Active proceedings yield `UT`; all applicable proceedings disposed yields `Disposed`; a committed predecessor is excluded only when its successor relationship exists. With no court proceeding, UCR details or the saved FIR status are retained, otherwise the status is `UI`.

No bulk migration is part of the application flow. A verified migration of older records should be a separately reviewed and reversible operation. This repository contains emulator test rules but no production Firestore rules file; production access to `firMasters` and `linkedCases` must be verified before deployment.
