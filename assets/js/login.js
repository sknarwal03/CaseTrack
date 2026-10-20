import { auth } from "@config/firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { LOCAL_ROLE_ADMIN_PROJECT_ID } from "./local-role-admin-endpoints.js";
import { functionsEndpoint } from "./firebase-functions.js";
import { getIdToken } from "firebase/auth";
const STATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

document.body.classList.toggle("light-theme", localStorage.getItem("caseTrackTheme") === "light");

const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const forgotLink = document.querySelector(".forgot-link");
const redirectReason = new URLSearchParams(window.location.search).get("reason");
if (redirectReason === "access-denied") {
    loginError.textContent = "This account does not have an active Admin or assigned Operator role.";
} else if (redirectReason === "verification-failed") {
    loginError.textContent = "Access could not be verified. Please sign in again when the local service is available.";
}

loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.querySelector("#email").value;
    const password = document.querySelector("#password").value;
    const submitBtn = document.querySelector(".login-btn");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Authenticating...";
    }

    loginError.textContent = "";
    let roleVerificationPending = false;
    try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        roleVerificationPending = true;
        const token = await getIdToken(credential.user);
        const accessResponse = await fetch(functionsEndpoint("getMyAccess"), {
            headers: { Authorization: `Bearer ${token}` }
        });
        const access = accessResponse.ok ? await accessResponse.json() : null;
        if (access?.role === "admin") {
            roleVerificationPending = false;
            window.location.href = "admin-panel.html";
            return;
        }
        if (access?.role === "operator" && typeof access.policeStationId === "string"
            && STATION_ID_PATTERN.test(access.policeStationId)) {
            roleVerificationPending = false;
            window.location.href = "dashboard.html";
            return;
        }

        await signOut(auth);
        roleVerificationPending = false;
        loginError.textContent = "This account does not have an active Admin or assigned Operator role.";
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In";
        }
    } catch (error) {
        console.error("Login or role verification failed:", error?.code || "unknown");
        
        let errorMessage = "Authentication failed. Please check your credentials.";
        if (roleVerificationPending) {
            try {
                await signOut(auth);
            } catch (signOutError) {
                console.error("Could not clear the session after role verification failed:", signOutError?.code || "unknown");
            }
            errorMessage = "Your identity was verified, but access could not be confirmed. Please try again.";
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = "Invalid email or password.";
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = "This account is disabled. Contact an administrator.";
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = "Too many failed attempts. Try again later.";
        }
        
        loginError.textContent = errorMessage;
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In";
        }
    }
});

forgotLink?.addEventListener("click", async event => {
    event.preventDefault();
    const email = document.querySelector("#email").value.trim().toLowerCase();
    if (!email) {
        loginError.textContent = "Enter your email address first, then select Forgot password.";
        return;
    }
    forgotLink.setAttribute("aria-disabled", "true");
    loginError.textContent = "Requesting password recovery…";
    try {
        const response = await fetch(functionsEndpoint("requestPasswordRecovery"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        if (!response.ok) throw new Error("recovery-unavailable");
        loginError.textContent = "If this email belongs to an active Operator, a password setup email will be sent.";
    } catch {
        loginError.textContent = "Password recovery is temporarily unavailable. Try again later.";
    } finally {
        forgotLink.removeAttribute("aria-disabled");
    }
});
