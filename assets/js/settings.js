import { auth, db } from "@config/firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    updateProfile,
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

const profileEditForm = document.querySelector('#profileEditForm');
const profileDisplayNameInput = document.querySelector('#profileDisplayNameInput');
const profileEditStatus = document.querySelector('#profileEditStatus');
const saveProfileButton = document.querySelector('#saveProfileButton');
const editProfileButton = document.querySelector('#editProfileButton');
let profileUser = null;

function setProfileName(name) {
    const normalizedName = name.trim() || 'User';
    const initials = normalizedName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const profileName = document.querySelector('#settingsProfileName');
    const profileInitials = document.querySelector('#settingsProfileInitials');
    if (profileName) profileName.textContent = normalizedName;
    if (profileInitials) profileInitials.textContent = initials || 'U';

    // Keep the shared header and its profile menu current on this page.
    const headerName = document.querySelector('#userDisplayName');
    const headerAvatar = document.querySelector('#userAvatar');
    const menuName = document.querySelector('.pd-name');
    const menuAvatar = document.querySelector('.pd-avatar');
    if (headerName) headerName.textContent = normalizedName;
    if (headerAvatar) headerAvatar.textContent = initials || 'U';
    if (menuName) menuName.textContent = normalizedName;
    if (menuAvatar) menuAvatar.textContent = initials || 'U';
}

onAuthStateChanged(auth, user => {
    profileUser = user;
    if (!user) return;
    if (editProfileButton) editProfileButton.disabled = false;
    setProfileName(user.displayName || 'User');
    const email = document.querySelector('#settingsProfileEmail');
    if (email) email.textContent = user.email || 'Email unavailable';
    if (profileDisplayNameInput) profileDisplayNameInput.value = user.displayName || '';
});

editProfileButton?.addEventListener('click', () => {
    if (!profileUser || !profileEditForm) return;
    if (profileDisplayNameInput) profileDisplayNameInput.value = profileUser.displayName || '';
    if (profileEditStatus) profileEditStatus.textContent = '';
    profileEditForm.hidden = false;
    editProfileButton.hidden = true;
    profileDisplayNameInput?.focus();
});

document.querySelector('#cancelProfileEdit')?.addEventListener('click', () => {
    profileEditForm.hidden = true;
    editProfileButton.hidden = false;
    if (profileEditStatus) profileEditStatus.textContent = '';
    editProfileButton.focus();
});

profileEditForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const user = auth.currentUser;
    const displayName = profileDisplayNameInput?.value.trim() || '';
    if (!user || user.uid !== profileUser?.uid) {
        if (profileEditStatus) profileEditStatus.textContent = 'Your session is unavailable. Sign in again and retry.';
        return;
    }
    if (!displayName) {
        profileDisplayNameInput?.setCustomValidity('Enter a display name.');
        profileDisplayNameInput?.reportValidity();
        profileDisplayNameInput?.setCustomValidity('');
        return;
    }

    saveProfileButton.disabled = true;
    if (profileEditStatus) profileEditStatus.textContent = 'Saving profile…';
    try {
        await updateProfile(user, { displayName });
        setProfileName(displayName);
        profileEditForm.hidden = true;
        editProfileButton.hidden = false;
        if (profileEditStatus) profileEditStatus.textContent = 'Profile updated.';
        editProfileButton.focus();
    } catch (error) {
        console.error('Error updating profile:', error);
        if (profileEditStatus) {
            profileEditStatus.textContent = error.code === 'auth/requires-recent-login'
                ? 'Please sign in again, then retry the profile change.'
                : 'Could not update your profile. Check your sign-in and try again.';
        }
    } finally {
        saveProfileButton.disabled = false;
    }
});

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
