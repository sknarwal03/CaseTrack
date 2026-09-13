import { db } from "../../firebase/firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';
const themeSwitch = document.querySelector('#themeSwitch');

const notificationsToggle = document.querySelector('#notificationsToggle');
const autoSaveToggle = document.querySelector('#autoSaveToggle');
const defaultCaseStatus = document.querySelector('#defaultCaseStatus');
const defaultCourtType = document.querySelector('#defaultCourtType');
const defaultCaseStage = document.querySelector('#defaultCaseStage');
const saveSettingsBtn = document.querySelector('#saveSettingsBtn');

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);

    if (themeToggle) {
        themeToggle.textContent = isLight ? '☾' : '☼';
        themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }

    if (themeSwitch) {
        themeSwitch.checked = isLight;
    }
};

applyTheme(savedTheme);

themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});

themeSwitch?.addEventListener('change', () => {
    const nextTheme = themeSwitch.checked ? 'light' : 'dark';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
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
            if (defaultCaseStatus && data.defaultCaseStatus) defaultCaseStatus.value = data.defaultCaseStatus;
            if (defaultCourtType && data.defaultCourtType) defaultCourtType.value = data.defaultCourtType;
            if (defaultCaseStage && data.defaultCaseStage) defaultCaseStage.value = data.defaultCaseStage;
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
            defaultCaseStatus: defaultCaseStatus ? defaultCaseStatus.value : 'UI',
            defaultCourtType: defaultCourtType ? defaultCourtType.value : 'SC',
            defaultCaseStage: defaultCaseStage ? defaultCaseStage.value : 'App',
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
