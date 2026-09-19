import { auth } from "@config/firebase-config.js";
import { signOut, onAuthStateChanged } from "firebase/auth";

/* =========================================================
   PROFILE DROPDOWN – shared across all pages
========================================================= */

function initProfileDropdown() {
    // Find the avatar and profile-name elements
    const avatar = document.querySelector(".avatar");
    const profileName = document.querySelector(".profile-name");
    const profileSection = document.querySelector(".profile");

    if (!profileSection) return;

    // Wrap avatar + profile-name in a clickable trigger
    const trigger = document.createElement("div");
    trigger.className = "profile-trigger";
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Profile menu");

    // Move avatar and profile-name into trigger
    if (avatar) trigger.appendChild(avatar);
    if (profileName) trigger.appendChild(profileName);
    profileSection.appendChild(trigger);

    // Build dropdown menu
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
        <button class="profile-dropdown-item" role="menuitem" id="pd-settings">
            <span class="pd-icon">⚙</span> Settings
        </button>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item logout" role="menuitem" id="pd-logout">
            <span class="pd-icon">⎋</span> Logout
        </button>
    `;
    profileSection.appendChild(dropdown);

    // Populate user info from Firebase Auth
    onAuthStateChanged(auth, (user) => {
        const name = avatar?.textContent?.trim() || "SN";
        const pdAvatar = dropdown.querySelector(".pd-avatar");
        const pdName = dropdown.querySelector(".pd-name");
        const pdEmail = dropdown.querySelector(".pd-email");

        if (pdAvatar) pdAvatar.textContent = name;

        if (user) {
            if (pdName) pdName.textContent = user.displayName || profileName?.querySelector("strong")?.textContent || "User";
            if (pdEmail) pdEmail.textContent = user.email || "";
        } else {
            // Not logged in — redirect to login
            window.location.href = "../pages/login.html";
        }
    });

    // Toggle open/close
    const toggleDropdown = (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle("open");
        trigger.setAttribute("aria-expanded", isOpen);
    };

    trigger.addEventListener("click", toggleDropdown);
    trigger.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") toggleDropdown(e);
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
        if (!profileSection.contains(e.target)) {
            dropdown.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        }
    });

    // Settings link
    document.getElementById("pd-settings")?.addEventListener("click", () => {
        window.location.href = "../pages/settings.html";
    });

    // Logout
    document.getElementById("pd-logout")?.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "../pages/login.html";
        } catch (err) {
            console.error("Logout failed:", err);
        }
    });
}

// Run after DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfileDropdown);
} else {
    initProfileDropdown();
}

