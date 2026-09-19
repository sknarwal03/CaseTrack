import { auth } from "@config/firebase-config.js";
import { signInWithEmailAndPassword } from "firebase/auth";

const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");

loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.querySelector("#email").value;
    const password = document.querySelector("#password").value;
    const submitBtn = document.querySelector(".login-btn");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Authenticating...";
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Login successful, redirect to dashboard
        window.location.href = "dashboard.html";
    } catch (error) {
        console.error("Login failed:", error);
        
        let errorMessage = "Authentication failed. Please check your credentials.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = "Invalid email or password.";
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
