import '../../components/add-case/add-case.js';
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
        <a class="nav-item" data-page="dashboard"  href="dashboard.html"><span>⌂</span>Dashboard</a>
        <a class="nav-item" data-page="cases"      href="cases.html"><span>▧</span>All Cases</a>
        <a class="nav-item" data-page="po-cases"   href="po-cases.html"><span>⚑</span>PO Cases</a>
        <a class="nav-item" data-page="star-cases" href="#"><span>★</span>Star Cases</a>
        <a class="nav-item" data-page="calendar"   href="calendar.html"><span>▣</span>Calendar</a>
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
    <label class="search">
        <span>⌕</span>
        <input type="search" id="globalSearch" placeholder="Search FIR, complainant, court, officer…">
    </label>
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
    document.querySelector(".menu")?.addEventListener("click", () => {
        document.getElementById("appSidebar")?.classList.toggle("open");
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
        <button class="profile-dropdown-item" id="pd-settings"><span class="pd-icon">⚙</span> Settings</button>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item logout" id="pd-logout"><span class="pd-icon">⎋</span> Logout</button>
    `;
    profile.appendChild(dropdown);

    // Toggle
    const toggle = e => {
        e.stopPropagation();
        const open = dropdown.classList.toggle("open");
        trigger.setAttribute("aria-expanded", open);
    };
    trigger.addEventListener("click", toggle);
    trigger.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") toggle(e); });

    document.addEventListener("click", e => {
        if (!profile.contains(e.target)) {
            dropdown.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        }
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
function boot() {
    injectLayout();
    markActiveNav();
    initTheme();
    initSidebarToggle();
    initNotifications();
    initProfileDropdown();
    initUserInfo();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}

