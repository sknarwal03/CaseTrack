import { auth, db } from "@config/firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from "firebase/auth";

/* Theme handled by shared-layout.js */

const notificationsToggle = document.querySelector('#notificationsToggle');
const autoSaveToggle = document.querySelector('#autoSaveToggle');
const saveSettingsBtn = document.querySelector('#saveSettingsBtn');
const passwordChangeModal = document.querySelector('#passwordChangeModal');
const passwordChangeForm = document.querySelector('#passwordChangeForm');
const passwordChangeStatus = document.querySelector('#passwordChangeStatus');
const submitPasswordChange = document.querySelector('#submitPasswordChange');
let previousBodyOverflow = '';

function openPasswordChange() {
    if (!passwordChangeModal) return;
    passwordChangeForm?.reset();
    if (passwordChangeStatus) passwordChangeStatus.textContent = '';
    passwordChangeModal.classList.add('show');
    passwordChangeModal.setAttribute('aria-hidden', 'false');
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.getElementById('currentPassword')?.focus();
}

function closePasswordChange() {
    if (!passwordChangeModal) return;
    passwordChangeModal.classList.remove('show');
    passwordChangeModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = previousBodyOverflow;
}

document.getElementById('openPasswordChange')?.addEventListener('click', openPasswordChange);
document.getElementById('closePasswordChange')?.addEventListener('click', closePasswordChange);
document.getElementById('cancelPasswordChange')?.addEventListener('click', closePasswordChange);
passwordChangeModal?.addEventListener('click', event => {
    if (event.target === passwordChangeModal) closePasswordChange();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && passwordChangeModal?.classList.contains('show')) closePasswordChange();
});

passwordChangeForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const user = auth.currentUser;
    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    if (!user?.email) {
        if (passwordChangeStatus) passwordChangeStatus.textContent = 'Password changes are unavailable for this sign-in method.';
        return;
    }
    if (newPassword !== confirmPassword) {
        if (passwordChangeStatus) passwordChangeStatus.textContent = 'New passwords do not match.';
        return;
    }
    submitPasswordChange.disabled = true;
    if (passwordChangeStatus) passwordChangeStatus.textContent = 'Updating password…';
    try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
        await updatePassword(user, newPassword);
        if (passwordChangeStatus) passwordChangeStatus.textContent = 'Password updated successfully.';
        passwordChangeForm.reset();
        setTimeout(closePasswordChange, 1000);
    } catch (error) {
        console.error('Error changing password:', error);
        const message = ['auth/wrong-password', 'auth/invalid-credential'].includes(error.code)
            ? 'Current password is incorrect.'
            : error.code === 'auth/weak-password'
                ? 'Choose a stronger password (at least 6 characters).'
                : error.code === 'auth/requires-recent-login'
                    ? 'Please sign in again, then retry the password change.'
                    : 'Could not update password. Check your sign-in and try again.';
        if (passwordChangeStatus) passwordChangeStatus.textContent = message;
    } finally {
        submitPasswordChange.disabled = false;
    }
});

// Firebase Preferences Logic
const PREF_DOC_REF = doc(db, 'settings', 'preferences');

async function loadPreferences() {
    try {
        const snap = await getDoc(PREF_DOC_REF);
        if (snap.exists()) {
            const data = snap.data();
            if (notificationsToggle) notificationsToggle.checked = data.notifications !== false; // default true
            if (autoSaveToggle) autoSaveToggle.checked = data.autoSave !== false;
        }
    } catch (e) {
        console.error("Error loading preferences:", e);
    }
}

async function savePreferences() {
    if (!saveSettingsBtn) return;
    
    const originalText = saveSettingsBtn.textContent;
    saveSettingsBtn.textContent = 'Saving...';
    saveSettingsBtn.disabled = true;

    try {
        await setDoc(PREF_DOC_REF, {
            notifications: notificationsToggle ? notificationsToggle.checked : true,
            autoSave: autoSaveToggle ? autoSaveToggle.checked : true,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        saveSettingsBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveSettingsBtn.textContent = originalText;
            saveSettingsBtn.disabled = false;
        }, 2000);
    } catch (e) {
        console.error("Error saving preferences:", e);
        saveSettingsBtn.textContent = 'Error';
        setTimeout(() => {
            saveSettingsBtn.textContent = originalText;
            saveSettingsBtn.disabled = false;
        }, 2000);
    }
}

saveSettingsBtn?.addEventListener('click', savePreferences);

// Initialize
loadPreferences();
