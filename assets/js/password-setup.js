import { functionsEndpoint } from "./firebase-functions.js";

const linkParams = new URLSearchParams(window.location.hash.slice(1));
const setupUid = linkParams.get("uid");
const setupToken = linkParams.get("token");
const message = document.getElementById("setupMessage");
const form = document.getElementById("setupForm");
const loginLink = document.getElementById("loginLink");

// A URL fragment is never sent in the HTTP request or Referer header. Remove
// it immediately so the bearer token does not remain in browser history.
history.replaceState(null, "", window.location.pathname);

async function setupRequest(endpoint, body) {
    return fetch(functionsEndpoint(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify(body)
    });
}

if (!/^[A-Za-z0-9_-]{1,128}$/.test(setupUid || "")
    || !/^[A-Za-z0-9_-]{43}$/.test(setupToken || "")) {
    message.textContent = "This password link is invalid. Request a new setup email.";
} else {
    try {
        const response = await setupRequest("validateOperatorSetupCode", {
            uid: setupUid,
            token: setupToken
        });
        const result = response.ok ? await response.json() : null;
        if (result?.valid !== true) throw new Error("invalid-setup-link");
        form.hidden = false;
        message.textContent = "Choose a password for your CaseTrack account. This link can be used once.";
    } catch (error) {
        console.warn("Password setup link verification failed.", error?.code || "unknown");
        message.textContent = "This link is expired, invalid, already used, or the account is unavailable. Request a new setup email.";
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!setupUid || !setupToken) return;
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    const passwordLength = Array.from(password).length;
    if (passwordLength < 12 || passwordLength > 128) {
        message.textContent = "Choose a password between 12 and 128 characters.";
        return;
    }
    if (password !== confirmation) {
        message.textContent = "The passwords do not match.";
        return;
    }

    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
        const response = await setupRequest("completeOperatorPasswordSetup", {
            uid: setupUid,
            token: setupToken,
            password
        });
        const result = response.ok ? await response.json() : null;
        if (result?.completed !== true) {
            throw new Error(response.status === 400 ? "invalid-setup-link" : "setup-failed");
        }
        form.reset();
        form.hidden = true;
        message.textContent = "Your password is set. You can now sign in to CaseTrack.";
        loginLink.hidden = false;
    } catch (error) {
        console.warn("Password setup failed.", error?.code || error?.message || "unknown");
        message.textContent = error?.message === "invalid-setup-link"
            ? "This link is expired, invalid, already used, or revoked. Request a new setup email."
            : "Password could not be set. Check the requirements and retry, or request a new link.";
    } finally {
        submit.disabled = false;
    }
});
