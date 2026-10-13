# CaseTrack Website Architecture

```mermaid
flowchart LR
    Visitor([Visitor]) --> Landing["Landing page<br/>index.html"]
    Landing --> Login["Login page"]
    Login -->|Email and password| Auth["Firebase Authentication"]
    Auth -->|Valid credentials| Dashboard["Dashboard"]
    Auth -->|Invalid credentials| Login

    subgraph WebApp["CaseTrack web app"]
        direction TB
        Dashboard
        Cases["All Cases"]
        POCases["PO Cases<br/>client-side table filters"]
        Calendar["Calendar"]
        Diary["Register Diary"]
        Reports["Reports"]
        Settings["Settings"]
        Judges["All Judges"]
        Officers["Manage IO"]

        Shared["Shared layout<br/>navigation · profile · theme<br/>search · notifications"]
        AddCase["Add Case component"]
        DateDialog["Hearing-date dialog"]
        Helpers["Shared utilities<br/>trial stages · charge dates · IO dialog"]

        Dashboard --> Shared
        Cases --> Shared
        POCases --> Shared
        Calendar --> Shared
        Diary --> Shared
        Reports --> Shared
        Settings --> Shared
        Judges --> Shared
        Officers --> Shared

        Shared --> AddCase
        Shared --> DateDialog
        Shared --> Helpers
        Diary --> Helpers
        Cases --> Helpers

        Shared -. "auth state: signed out" .-> Login
    end

    subgraph Firebase["Firebase project: CaseTrack"]
        FireAuth["Firebase Authentication"]
        Firestore[("Cloud Firestore")]
        CasesData[("cases collection")]
        JudgesData[("judges collection")]
        IOData[("investigatingOfficers collection")]
        PrefsData[("settings / preferences")]

        Firestore --- CasesData
        Firestore --- JudgesData
        Firestore --- IOData
        Firestore --- PrefsData
        FireAuth --> Auth
    end

    Dashboard --> CasesData
    Cases --> CasesData
    Calendar --> CasesData
    Diary --> CasesData
    Diary --> JudgesData
    Reports --> CasesData
    Settings --> PrefsData
    Judges --> JudgesData
    Officers --> IOData
    Officers --> CasesData
    AddCase --> CasesData
    DateDialog --> CasesData
    Shared --> CasesData

    subgraph BrowserData["Data kept in the user's browser"]
        LocalStorage["localStorage<br/>theme and diary notes/status"]
        IndexedDB[("IndexedDB<br/>Register Diary photos")]
    end
    Shared --> LocalStorage
    Diary --> LocalStorage
    Diary --> IndexedDB

    subgraph Delivery["Build and deployment"]
        Source["Vite multi-page source"]
        Build["npm run build"]
        Dist["dist/ static files"]
        Pages["GitHub Pages"]
        Source --> Build --> Dist --> Pages
    end

    subgraph TestServices["Regression-test services"]
        EmulatorAuth["Firebase Auth Emulator<br/>127.0.0.1:9099"]
        EmulatorStore["Firestore Emulator<br/>127.0.0.1:8080"]
    end
    EmulatorAuth -. "test-only config" .-> FireAuth
    EmulatorStore -. "test-only config" .-> Firestore
```

The app is a static, multi-page Vite website. Page-specific JavaScript talks directly to Firebase; there is no separate application server in this project. The PO Cases page currently filters its page-provided rows in the browser.
