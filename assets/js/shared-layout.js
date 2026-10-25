import '../../components/add-case/add-case.js';
import './notification-date-dialog.js';
import { setupDropdown } from './shared-utils.js';
import { db } from '@config/firebase-config.js';
import { doc, getDocFromServer } from 'firebase/firestore';
import { isActiveAdmin } from './admin-access.js';
import { loadCaseRecords, usesStationScopedAccess } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';
/**
 * shared-layout.js
 * Injects shared sidebar + topbar into every app page.
 * Include this as <script type="module"> BEFORE page-specific scripts.
 *
 * Usage in HTML:
 *   Set data-page="dashboard" (or cases, calendar, etc.) on <body>
 *   to auto-highlight the correct nav item.
 */

/* =========================================================
   SIDEBAR HTML
========================================================= */
const SIDEBAR_HTML = /* html */ `
<aside class="sidebar" id="appSidebar">
    <a class="brand" href="dashboard.html" aria-label="Go to Dashboard">
        <div class="brand-mark">⚖</div>
        <div><strong>CaseTrack</strong><small>Case Management System</small></div>
    </a>
    <nav id="sidebarNav">
        <a class="nav-item" data-page="disposed-cases" href="disposed-cases.html"><span>✓</span>Disposed Cases</a>
        <a class="nav-item" data-page="cases"      href="cases.html"><span>▧</span>All Cases</a>
        <a class="nav-item" data-page="po-cases"   href="po-cases.html"><span>⚑</span>PO Cases</a>
        <a class="nav-item" data-page="fir-register" href="fir-register.html"><span>▤</span>FIR Register</a>
        <a class="nav-item" data-page="calendar"   href="calendar.html"><span>▣</span>Calendar</a>
        <a class="nav-item" data-page="register-diary" href="register-diary.html"><span>✎</span>Register Diary</a>
        <a class="nav-item" data-page="report"     href="report.html"><span>▥</span>Report</a>
        <a class="nav-item" data-page="settings"   href="settings.html"><span>⚙</span>Settings</a>
        <a class="nav-item" data-page="admin-panel" href="admin-panel.html" id="adminPanelNav" hidden><span>♙</span>Admin Panel</a>
    </nav>
    <div class="side-quote"><b>⚖</b>"Justice delayed<br>is not justice denied,<br>when it is tracked."</div>
</aside>
`;

/* =========================================================
   TOPBAR HTML
========================================================= */
const TOPBAR_HTML = /* html */ `
<header class="topbar" id="appTopbar">
    <button class="menu" type="button" aria-label="Open navigation" aria-controls="appSidebar" aria-expanded="false">☰</button>
    <a class="mobile-brand" href="dashboard.html" aria-label="CaseTrack Dashboard">
        <span class="brand-mark" aria-hidden="true">⚖</span>
        <span>CaseTrack</span>
    </a>
    <div class="global-search-wrap">
    <label class="search" for="globalSearch">
        <span>⌕</span>
        <input type="search" id="globalSearch" placeholder="Search FIR, complainant, court, officer…" autocomplete="off">
    </label>
    <div class="global-search-results" id="globalSearchResults" role="listbox" hidden></div>
    </div>
    <div class="profile">
        <button class="round-btn" id="themeToggle" type="button"
            aria-label="Switch to light theme" aria-pressed="false">☼</button>
        <div class="notification-wrap">
            <button class="round-btn notification" id="notificationToggle" type="button"
                aria-label="Notifications" data-count="0">♧</button>
            <div class="notification-panel" id="notificationPanel" aria-live="polite">
                <div class="notification-header">
                    <strong>Notifications</strong><span id="notificationCount">0</span>
                </div>
                <div class="notification-items" id="notificationItems">
                    <div class="notification-item"><small>No notifications.</small></div>
                </div>
            </div>
        </div>
        <div class="avatar" id="userAvatar"></div>
        <div class="profile-name" id="userProfileName">
            <strong id="userDisplayName"></strong>
            <small id="userRole"></small>
        </div>
    </div>
</header>
`;

/* =========================================================
   INJECT LAYOUT
========================================================= */
function injectLayout() {
    const layout = document.querySelector(".layout");
    if (!layout) return;

    // Only inject if sidebar/topbar are NOT already in the HTML
    if (!document.getElementById("appSidebar")) {
        layout.insertAdjacentHTML("afterbegin", SIDEBAR_HTML);
    }

    const main = layout.querySelector(".main");
    if (main && !document.getElementById("appTopbar")) {
        main.insertAdjacentHTML("afterbegin", TOPBAR_HTML);
    }

    if (!document.getElementById("mobileNavBackdrop")) {
        document.body.insertAdjacentHTML(
            "beforeend",
            '<button class="mobile-nav-backdrop" id="mobileNavBackdrop" type="button" aria-label="Close navigation" hidden></button>'
        );
    }
}

/* =========================================================
   MARK ACTIVE NAV ITEM
========================================================= */
function markActiveNav() {
    const page = document.body.dataset.page || "";
    document.querySelectorAll("#sidebarNav .nav-item").forEach(link => {
        link.classList.toggle("active", link.dataset.page === page);
    });
}

/* =========================================================
   THEME
========================================================= */
function initTheme() {
    const saved = localStorage.getItem("caseTrackTheme") || "dark";
    applyTheme(saved);

    document.getElementById("themeToggle")?.addEventListener("click", () => {
        const next = document.body.classList.contains("light-theme") ? "dark" : "light";
        localStorage.setItem("caseTrackTheme", next);
        applyTheme(next);
    });

    document.getElementById("themeSwitch")?.addEventListener("change", event => {
        const next = event.currentTarget.checked ? "light" : "dark";
        localStorage.setItem("caseTrackTheme", next);
        applyTheme(next);
    });
}

function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);

    const settingsSwitch = document.getElementById("themeSwitch");
    if (settingsSwitch) settingsSwitch.checked = isLight;

    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.textContent = isLight ? "☀" : "☼";
        btn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
        btn.setAttribute("aria-pressed", String(isLight));
    }
}

/* =========================================================
   SIDEBAR MOBILE TOGGLE
========================================================= */
function initSidebarToggle() {
    const menuBtn = document.querySelector(".menu");
    const sidebar = document.getElementById("appSidebar");
    const backdrop = document.getElementById("mobileNavBackdrop");
    if (!menuBtn || !sidebar || !backdrop) return;

    const mobileViewport = window.matchMedia("(max-width: 780px)");
    let previousBodyOverflow = "";
    const setOpen = open => {
        const isOpen = open && mobileViewport.matches;
        sidebar.classList.toggle("open", isOpen);
        menuBtn.setAttribute("aria-expanded", String(isOpen));
        menuBtn.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
        sidebar.setAttribute("aria-hidden", String(mobileViewport.matches && !isOpen));
        sidebar.inert = mobileViewport.matches && !isOpen;
        backdrop.hidden = !isOpen;
        document.body.classList.toggle("mobile-nav-open", isOpen);
        if (isOpen) {
            previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = previousBodyOverflow;
        }
    };

    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(!sidebar.classList.contains("open"));
    });
    backdrop.addEventListener("click", () => setOpen(false));

    const navItems = sidebar.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar.classList.contains("open")) {
            setOpen(false);
            menuBtn.focus();
        }
    });

    mobileViewport.addEventListener("change", () => setOpen(false));
    setOpen(false);
}

/* =========================================================
   NOTIFICATION PANEL
========================================================= */
function initNotifications() {
    const toggle = document.getElementById("notificationToggle");
    const panel  = document.getElementById("notificationPanel");
    if (!toggle || !panel) return;
    const items = document.getElementById("notificationItems");
    const count = document.getElementById("notificationCount");
    const casesById = new Map();

    window.addEventListener("caseTrackNotificationsUpdated", event => {
        if (!items) return;
        const notifications = Array.isArray(event.detail?.notifications)
            ? event.detail.notifications
            : [];
        items.replaceChildren();
        toggle.dataset.count = String(notifications.length);
        toggle.setAttribute("aria-label", `Notifications${notifications.length ? `, ${notifications.length} cases need a next date` : ""}`);
        if (count) count.textContent = `${notifications.length} need attention`;
        if (notifications.length === 0) {
            const empty = document.createElement("div");
            empty.className = "notification-item";
            const message = document.createElement("small");
            message.textContent = "No notifications.";
            empty.append(message);
            items.append(empty);
            return;
        }

        notifications.forEach(notification => {
            const item = document.createElement(notification.caseId ? "button" : "div");
            item.className = "notification-item unread";
            if (notification.caseId) {
                item.type = "button";
                item.addEventListener("click", async () => {
                    const caseCollection = notification.caseCollection || 'cases';
                    const caseKey = `${caseCollection}:${notification.caseId}`;
                    let caseItem = casesById.get(caseKey);
                    if (!caseItem) {
                        try {
                            const snapshot = await getDoc(doc(db, caseCollection, notification.caseId));
                            if (!snapshot.exists()) throw new Error("The case no longer exists.");
                            caseItem = { id: snapshot.id, _collectionName: caseCollection, ...snapshot.data() };
                            casesById.set(caseKey, caseItem);
                        } catch (error) {
                            console.error(`Could not load case ${notification.caseId} from its hearing reminder:`, error);
                            return;
                        }
                    }
                    if (typeof window.openNotificationDateDialog !== "function") {
                        console.error("The date update dialog is unavailable for this hearing reminder.");
                        return;
                    }
                    void window.openNotificationDateDialog(caseItem);
                    panel.classList.remove("show");
                });
            }
            const title = document.createElement("b");
            title.textContent = notification.title || "Next date update needed";
            const message = document.createElement("small");
            message.textContent = notification.message || "";
            item.append(title, message);
            items.append(item);
        });
    });

    const parseDiaryDate = value => {
        if (typeof value !== "string" || !value.trim()) return "";
        const dateValue = value.trim();
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
        const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue);
        if (!iso && !local) return "";
        const [, first, second, third] = iso || local;
        const [year, month, day] = iso
            ? [Number(first), Number(second), Number(third)]
            : [Number(third), Number(second), Number(first)];
        const parsed = new Date(year, month - 1, day);
        if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return "";
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    const refreshHearingNotifications = async () => {
        try {
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            const records = await loadCaseRecords(db);
            casesById.clear();
            records.forEach(caseItem => casesById.set(`${caseItem._collectionName || 'cases'}:${caseItem.id}`, caseItem));
            let localStatuses = {};
            try {
                const savedStatuses = JSON.parse(localStorage.getItem("register-diary-file-statuses") || "{}");
                if (savedStatuses && typeof savedStatuses === "object" && !Array.isArray(savedStatuses)) {
                    localStatuses = savedStatuses;
                }
            } catch (error) {
                console.error("Could not read Register Diary hearing dates for notifications:", error);
            }

            const excludedStatuses = new Set(["ucr", "untrace", "untraced", "cancellation", "disposed", "ui", "under investigation"]);
            const notifications = records
                .filter(caseItem => isCourtProceeding(caseItem)
                    && !caseItem.successorCaseId
                    && !excludedStatuses.has(String(caseItem.status || "").trim().toLowerCase()))
                .filter(caseItem => {
                    const records = Array.isArray(caseItem.hearingDateRecord)
                        ? caseItem.hearingDateRecord
                        : Array.isArray(caseItem.registerDiaryDaterecords)
                            ? caseItem.registerDiaryDaterecords
                            : Array.isArray(caseItem.registerDiaryDateRecords)
                                ? caseItem.registerDiaryDateRecords
                                : localStatuses[caseItem.id]?.dateRecords || [];
                    const validRecords = records
                        .map(record => ({ ...record, date: parseDiaryDate(record?.date) }))
                        .filter(record => record.date);
                    const hasUpcomingRecord = validRecords.some(record => record.date > todayKey);
                    if (hasUpcomingRecord) return false;
                    const hasManagedNextRecord = validRecords.some(record => record.kind === "next");
                    const hasUpcomingLegacyDate = !hasManagedNextRecord
                        && parseDiaryDate(caseItem.nextDate) > todayKey;
                    if (hasUpcomingLegacyDate) return false;
                    const nearestRecord = validRecords
                        .sort((left, right) => Math.abs(new Date(`${left.date}T12:00:00`).getTime() - today.getTime())
                            - Math.abs(new Date(`${right.date}T12:00:00`).getTime() - today.getTime()))[0];
                    caseItem.notificationDiaryDate = nearestRecord?.date || parseDiaryDate(caseItem.nextDate) || todayKey;
                    return true;
                })
                .map(caseItem => {
                    const firNumber = [caseItem.firNo, caseItem.firYear]
                        .filter(value => value !== null && value !== undefined && String(value).trim())
                        .join("/");
                    return {
                        caseId: caseItem.id,
                        caseCollection: caseItem._collectionName || 'cases',
                        diaryDate: caseItem.notificationDiaryDate,
                        title: "Next date update needed",
                        message: `FIR ${firNumber || "number not assigned"} has no upcoming hearing date. Update the next date.`
                    };
                });
            window.dispatchEvent(new CustomEvent("caseTrackNotificationsUpdated", {
                detail: { notifications }
            }));
        } catch (error) {
            console.error("Could not load cases for hearing-date notifications:", error);
        }
    };
    void refreshHearingNotifications();
    window.addEventListener("caseAdded", refreshHearingNotifications);

    toggle.addEventListener("click", e => {
        e.stopPropagation();
        panel.classList.toggle("show");
    });
    document.addEventListener("click", e => {
        if (!panel.contains(e.target) && e.target !== toggle) {
            panel.classList.remove("show");
        }
    });
}

/* =========================================================
   POPULATE USER INFO FROM FIREBASE AUTH
========================================================= */
async function initUserInfo() {
    try {
        const { auth } = await import("@config/firebase-config.js");
        const { onAuthStateChanged, signOut } = await import("firebase/auth");

        const updateUI = (name, email, roleName) => {
            const initials = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
            
            const avatar = document.getElementById("userAvatar");
            const displayName = document.getElementById("userDisplayName");
            const role = document.getElementById("userRole");
            const pdAvatar = document.querySelector(".pd-avatar");
            const pdName = document.querySelector(".pd-name");
            const pdEmail = document.querySelector(".pd-email");
            const dashboardWelcome = document.getElementById("dashboardWelcome");

            if (avatar) avatar.textContent = initials;
            if (displayName) displayName.textContent = name;
            if (role) role.textContent = roleName;
            if (pdAvatar) pdAvatar.textContent = initials;
            if (pdName) pdName.textContent = name;
            if (pdEmail && email) pdEmail.textContent = email;
            if (dashboardWelcome) dashboardWelcome.textContent = `Welcome Back, ${name}!`;
        };

        onAuthStateChanged(auth, async user => {
            const adminPanelNav = document.getElementById("adminPanelNav");
            if (adminPanelNav) adminPanelNav.hidden = true;
            if (!user) {
                window.location.href = "login.html";
                return;
            }
            const name = user.displayName || "User";
            if (usesStationScopedAccess(db)) {
                try {
                    const roleSnapshot = await getDocFromServer(doc(db, "userRoles", user.uid));
                    const roleRecord = roleSnapshot.exists() ? roleSnapshot.data() : null;
                    const validOperator = roleRecord?.role === "operator"
                        && typeof roleRecord.policeStationId === "string"
                        && /^[A-Za-z0-9_-]{1,128}$/.test(roleRecord.policeStationId);
                    if (roleRecord?.status !== "active"
                        || (roleRecord.role !== "admin" && !validOperator)) {
                        try {
                            await signOut(auth);
                        } catch (error) {
                            console.error("Could not clear an unauthorized session:", error?.code || "unknown");
                        }
                        window.location.replace("login.html?reason=access-denied");
                        return;
                    }
                    if (roleRecord.mustChangePassword === true) {
                        window.location.replace("password-change.html");
                        return;
                    }
                    if (auth.currentUser?.uid !== user.uid) return;
                    updateUI(name, user.email || "", roleRecord.role === "admin" ? "Administrator" : "Operator");
                    if (adminPanelNav) adminPanelNav.hidden = roleRecord.role !== "admin";
                } catch (error) {
                    console.error("Could not verify role access:", error?.code || "unknown");
                    try {
                        await signOut(auth);
                    } catch (signOutError) {
                        console.error("Could not clear the session after role verification failed:", signOutError?.code || "unknown");
                    }
                    window.location.replace("login.html?reason=verification-failed");
                }
                return;
            }
            updateUI(name, user.email || "", "User");
            if (adminPanelNav) {
                try {
                    const authorized = await isActiveAdmin(user);
                    if (auth.currentUser?.uid === user.uid) {
                        adminPanelNav.hidden = !authorized;
                        if (authorized) updateUI(name, user.email || "", "Administrator");
                    }
                } catch (error) {
                    console.error("Could not verify Admin Panel navigation access:", error);
                }
            }
        });
    } catch (e) {
        console.warn("Firebase auth not available:", e);
    }
}

/* =========================================================
   PROFILE DROPDOWN
========================================================= */
function initProfileDropdown() {
    const profile = document.querySelector(".profile");
    if (!profile) return;

    const avatar      = document.getElementById("userAvatar");
    const profileName = document.getElementById("userProfileName");

    // Wrap avatar + profileName in clickable trigger
    const trigger = document.createElement("div");
    trigger.className = "profile-trigger";
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    if (avatar) trigger.appendChild(avatar);
    if (profileName) trigger.appendChild(profileName);
    profile.appendChild(trigger);

    // Build dropdown
    const dropdown = document.createElement("div");
    dropdown.className = "profile-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.innerHTML = `
        <div class="profile-dropdown-header">
            <div class="pd-avatar"></div>
            <div class="pd-info">
                <strong class="pd-name">Loading…</strong>
                <small class="pd-email"></small>
            </div>
        </div>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item mobile-only" id="pd-notifications"><span class="pd-icon">🔔</span> Notifications</button>
        <button class="profile-dropdown-item mobile-only" id="pd-theme"><span class="pd-icon">◐</span> Theme</button>
        <div class="profile-dropdown-divider mobile-only"></div>
        <button class="profile-dropdown-item" id="pd-settings"><span class="pd-icon">⚙</span> Settings</button>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item logout" id="pd-logout"><span class="pd-icon">⎋</span> Logout</button>
    `;
    profile.appendChild(dropdown);

    // Toggle
    setupDropdown(trigger, dropdown, "open");
    const syncTriggerState = () => trigger.setAttribute("aria-expanded", String(dropdown.classList.contains("open")));
    trigger.addEventListener("click", syncTriggerState);
    trigger.addEventListener("keydown", syncTriggerState);
    document.addEventListener("click", syncTriggerState);
    document.addEventListener("keydown", syncTriggerState);
    dropdown.addEventListener("click", event => {
        if (!event.target.closest("button")) return;
        dropdown.classList.remove("open");
        syncTriggerState();
    });

    // Notifications (Mobile)
    document.getElementById("pd-notifications")?.addEventListener("click", (e) => {
        // Trigger the original notification button click
        document.getElementById("notificationToggle")?.click();
    });

    // Theme (Mobile)
    document.getElementById("pd-theme")?.addEventListener("click", () => {
        // Trigger the original theme button click
        document.getElementById("themeToggle")?.click();
    });

    // Settings
    document.getElementById("pd-settings")?.addEventListener("click", () => {
        window.location.href = "settings.html";
    });

    // Logout
    document.getElementById("pd-logout")?.addEventListener("click", async () => {
        try {
            const { auth } = await import("@config/firebase-config.js");
            const { signOut } = await import("firebase/auth");
            await signOut(auth);
        } catch(_) {}
        window.location.href = "login.html";
    });
}

/* =========================================================
   BOOT
========================================================= */
function initGlobalSearch() {
    const input = document.getElementById('globalSearch');
    const resultsBox = document.getElementById('globalSearchResults');
    if (!input || !resultsBox) return;

    let cachedCases = null;
    let loadPromise = null;
    let requestId = 0;
    window.addEventListener('caseAdded', () => { cachedCases = null; });

    const closeResults = () => { resultsBox.hidden = true; };
    const collectText = value => {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) return value.map(collectText).join(' ');
        if (typeof value === 'object') return Object.values(value).map(collectText).join(' ');
        return String(value);
    };
    const loadCases = async () => {
        if (cachedCases) return cachedCases;
        if (!loadPromise) {
            loadPromise = loadCaseRecords(db).then(records => {
                cachedCases = records;
                return cachedCases;
            }).finally(() => { loadPromise = null; });
        }
        return loadPromise;
    };
    const renderResults = async () => {
        const currentRequest = ++requestId;
        const queryText = input.value.trim().toLocaleLowerCase();
        resultsBox.replaceChildren();
        if (!queryText) {
            closeResults();
            return;
        }

        const loading = document.createElement('div');
        loading.className = 'global-search-message';
        loading.textContent = 'Searching cases…';
        resultsBox.appendChild(loading);
        resultsBox.hidden = false;

        try {
            const cases = await loadCases();
            if (currentRequest !== requestId) return;
            const caseMatches = cases
                .filter(caseItem => collectText(caseItem).toLocaleLowerCase().includes(queryText))
                .map(caseItem => ({ caseItem, title: '', details: '', href: '' }));
            const isRegisterDiary = document.body.dataset.page === 'register-diary';
            const matches = isRegisterDiary ? [] : [...caseMatches];

            if (isRegisterDiary) {
                cases.forEach(caseItem => {
                    const detailPrefix = `diary-file-detail-${caseItem.id}-`;
                    Object.keys(localStorage).filter(key => key.startsWith(detailPrefix)).forEach(key => {
                        const note = localStorage.getItem(key) || '';
                        if (!note.toLocaleLowerCase().includes(queryText)) return;
                        const date = key.slice(detailPrefix.length);
                        const firNumber = [caseItem.firNo, caseItem.firYear].filter(Boolean).join('/');
                        matches.push({
                            caseItem,
                            title: `Register Diary · FIR ${firNumber || '—'}`,
                            details: `${date} · ${note.trim()}`,
                            href: `register-diary.html?date=${encodeURIComponent(date)}`
                        });
                    });
                });

                Object.keys(localStorage).forEach(key => {
                    const note = localStorage.getItem(key) || '';
                    const extraNoteMatch = /^daily-extra-(\d{4}-\d{2}-\d{2})-\d+$/.exec(key);
                    if (!extraNoteMatch || !note.trim() || !note.toLocaleLowerCase().includes(queryText)) return;
                    const [, date] = extraNoteMatch;
                    const parsedDate = new Date(`${date}T12:00:00`);
                    const dateLabel = Number.isNaN(parsedDate.getTime())
                        ? date
                        : parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    matches.push({
                        caseItem: null,
                        title: `Extra Notes · ${dateLabel}`,
                        details: note.trim(),
                        href: `register-diary.html?date=${encodeURIComponent(date)}`
                    });
                });
                matches.push(...caseMatches);
            }
            resultsBox.replaceChildren();
            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'global-search-message';
                empty.textContent = isRegisterDiary
                    ? 'No matching cases or diary notes found.'
                    : 'No matching cases found.';
                resultsBox.appendChild(empty);
                return;
            }

            matches.slice(0, 10).forEach(match => {
                const caseItem = match.caseItem;
                const result = document.createElement('button');
                result.type = 'button';
                result.className = 'global-search-result';
                result.setAttribute('role', 'option');
                const main = document.createElement('strong');
                const firNumber = caseItem
                    ? [caseItem.firNo, caseItem.firYear].filter(Boolean).join('/')
                    : '';
                main.textContent = match.title || (firNumber ? `FIR ${firNumber}` : 'Case record');
                const details = document.createElement('small');
                details.textContent = match.details || [caseItem?.complainantName, caseItem?.courtName, caseItem?.policeStation]
                    .filter(Boolean).join(' · ');
                result.append(main, details);
                result.addEventListener('click', () => {
                    const collectionQuery = caseItem?._collectionName
                        ? `&collection=${encodeURIComponent(caseItem._collectionName)}`
                        : '';
                    window.location.href = match.href || `cases.html?case=${encodeURIComponent(caseItem.id)}${collectionQuery}`;
                });
                resultsBox.appendChild(result);
            });
            if (matches.length > 10) {
                const more = document.createElement('div');
                more.className = 'global-search-message';
                more.textContent = `Showing 10 of ${matches.length} matching cases.`;
                resultsBox.appendChild(more);
            }
        } catch (error) {
            if (currentRequest !== requestId) return;
            console.error('Global case search failed:', error);
            resultsBox.replaceChildren();
            const message = document.createElement('div');
            message.className = 'global-search-message';
            message.textContent = 'Could not search cases. Please try again.';
            resultsBox.appendChild(message);
        }
    };

    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeResults();
        if (event.key === 'Enter') {
            const firstResult = resultsBox.querySelector('.global-search-result');
            if (firstResult && !resultsBox.hidden) {
                event.preventDefault();
                firstResult.click();
            }
        }
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.global-search-wrap')) closeResults();
    });
}

function boot() {
    injectLayout();
    markActiveNav();
    initTheme();
    initSidebarToggle();
    initNotifications();
    initGlobalSearch();
    initProfileDropdown();
    initUserInfo();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
