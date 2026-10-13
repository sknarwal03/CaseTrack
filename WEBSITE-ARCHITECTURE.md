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
        CasesData[("cases")]
        JudgesData[("judges")]
        IOData[("investigatingOfficers")]
        PrefsData[("settings / preferences")]
        Firestore --- CasesData
        Firestore --- JudgesData
        Firestore --- IOData
        Firestore --- PrefsData
    end

    Dashboard --> CasesData
    CasesPage["All Cases"] --> CasesData
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
    Add --> Cases[("Firestore: cases")]

    Cases --> Dashboard["Dashboard<br/>overview and upcoming work"]
    Cases --> CaseList["All Cases<br/>search and case details"]
    Cases --> Calendar["Calendar<br/>hearing dates"]
    Cases --> Report["Reports<br/>case summaries"]
    Cases --> Diary["Register Diary"]

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

CaseTrack is a static, multi-page Vite website. Page modules access Firebase directly; this project has no separate application server. GitHub Actions builds and deploys the contents of `dist/`. PO Cases currently filters the rows provided by its page in the browser.
