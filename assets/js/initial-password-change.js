import { auth } from "@config/firebase-config.js";
import { getIdToken, onAuthStateChanged, signOut } from "firebase/auth";
import { functionsEndpoint } from "./firebase-functions.js";

const form = document.getElementById("passwordChangeForm");
const message = document.getElementById("passwordChangeMessage");
const submitButton = document.getElementById("passwordChangeButton");
let activeUser = null;
let generation = 0;
let ready = false;

function isCurrent(user, requestGeneration) {
    return generation === requestGeneration && activeUser?.uid === user.uid
        && auth.currentUser?.uid === user.uid;
}

onAuthStateChanged(auth, async user => {
    generation += 1;
    const requestGeneration = generation;
    activeUser = user;
    ready = false;
    form.hidden = true;
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    message.textContent = "Verifying your account…";
    try {
        const token = await getIdToken(user);
        const response = await fetch(functionsEndpoint("getMyAccess"), {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!isCurrent(user, requestGeneration)) return;
        const access = response.ok ? await response.json() : null;
        if (!['admin', 'operator'].includes(access?.role) || access.mustChangePassword !== true) {
            window.location.replace(access?.role === "admin" ? "admin-panel.html" : "dashboard.html");
            return;
        }
        ready = true;
        form.hidden = false;
        message.textContent = "Set a new password with at least 12 characters. This is required before opening case data.";
    } catch {
        if (!isCurrent(user, requestGeneration)) return;
        message.textContent = "We could not verify your account. Sign in again or contact an Admin.";
    }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    const user = activeUser;
    const requestGeneration = generation;
    if (!ready || !user || !isCurrent(user, requestGeneration)) return;

    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    if (Array.from(password).length < 12 || Array.from(password).length > 128) {
        message.textContent = "Choose a password between 12 and 128 characters.";
        return;
    }
    if (password !== confirmation) {
        message.textContent = "The passwords do not match.";
        return;
    }

    submitButton.disabled = true;
    message.textContent = "Changing your password…";
    try {
        const token = await getIdToken(user);
        const response = await fetch(functionsEndpoint("completeOperatorFirstPasswordChange"), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ password })
        });
        if (!isCurrent(user, requestGeneration)) return;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "The password could not be changed.");
        await signOut(auth);
        window.location.replace("login.html?reason=password-changed");
    } catch (error) {
        if (!isCurrent(user, requestGeneration)) return;
        message.textContent = error?.message || "The password could not be changed. Try again or contact an Admin.";
        submitButton.disabled = false;
    }
});
