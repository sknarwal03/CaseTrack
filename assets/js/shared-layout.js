import '../../components/add-case/add-case.js';
import { setupDropdown } from './shared-utils.js';
import { db } from '@config/firebase-config.js';
import { collection, getDocs } from 'firebase/firestore';
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
        <a class="nav-item" data-page="cases"      href="cases.html"><span>▧</span>All Cases</a>
        <a class="nav-item" data-page="po-cases"   href="po-cases.html"><span>⚑</span>PO Cases</a>
        <a class="nav-item" data-page="calendar"   href="calendar.html"><span>▣</span>Calendar</a>
        <a class="nav-item" data-page="register-diary" href="register-diary.html"><span>✎</span>Register Diary</a>
        <a class="nav-item" data-page="report"     href="report.html"><span>▥</span>Report</a>
        <a class="nav-item" data-page="settings"   href="settings.html"><span>⚙</span>Settings</a>
    </nav>
    <div class="side-quote"><b>⚖</b>"Justice delayed<br>is not justice denied,<br>when it is tracked."</div>
</aside>
`;

/* =========================================================
   TOPBAR HTML
========================================================= */
const TOPBAR_HTML = /* html */ `
<header class="topbar" id="appTopbar">
    <button class="menu" aria-label="Toggle sidebar">☰</button>
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
                aria-label="Notifications">♧</button>
            <div class="notification-panel" id="notificationPanel" aria-live="polite">
                <div class="notification-header">
                    <strong>Notifications</strong><span>3 new</span>
                </div>
                <div class="notification-item unread">
                    <b>Hearing reminder</b>
                    <small>FIR-150 hearing scheduled for today at 09:00 AM.</small>
                </div>
                <div class="notification-item unread">
                    <b>Case update</b>
                    <small>PO case status was changed to In Review.</small>
                </div>
                <div class="notification-item">
                    <b>Document uploaded</b>
                    <small>Evidence bundle added for FIR-188/2026.</small>
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
}

function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);

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
    if (!menuBtn || !sidebar) return;

    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        sidebar.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
        if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
            sidebar.classList.remove("open");
        }
    });

    const navItems = sidebar.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            sidebar.classList.remove("open");
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar.classList.contains("open")) {
            sidebar.classList.remove("open");
        }
    });
}

/* =========================================================
   NOTIFICATION PANEL
========================================================= */
function initNotifications() {
    const toggle = document.getElementById("notificationToggle");
    const panel  = document.getElementById("notificationPanel");
    if (!toggle || !panel) return;

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
        const { onAuthStateChanged } = await import("firebase/auth");

        const updateUI = (name, email) => {
            const initials = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
            
            const avatar = document.getElementById("userAvatar");
            const displayName = document.getElementById("userDisplayName");
            const role = document.getElementById("userRole");
            const pdAvatar = document.querySelector(".pd-avatar");
            const pdName = document.querySelector(".pd-name");
            const pdEmail = document.querySelector(".pd-email");

            if (avatar) avatar.textContent = initials;
            if (displayName) displayName.textContent = name;
            if (role) role.textContent = "Administrator";
            if (pdAvatar) pdAvatar.textContent = initials;
            if (pdName) pdName.textContent = name;
            if (pdEmail && email) pdEmail.textContent = email;
        };

        const savedName = localStorage.getItem("caseTrackUserName");
        if (savedName) updateUI(savedName, "");

        onAuthStateChanged(auth, user => {
            if (!user) {
                window.location.href = "login.html";
                return;
            }
            const name = user.displayName || "User";
            localStorage.setItem("caseTrackUserName", name);
            updateUI(name, user.email || "");
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
            loadPromise = getDocs(collection(db, 'cases')).then(snapshot => {
                cachedCases = snapshot.docs.map(caseDoc => ({ id: caseDoc.id, ...caseDoc.data() }));
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
                    window.location.href = match.href || `cases.html?case=${encodeURIComponent(caseItem.id)}`;
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
