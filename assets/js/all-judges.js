import { db } from '@config/firebase-config.js';
import {
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    writeBatch
} from 'firebase/firestore';

const judgesCollection = collection(db, 'judges');
const judgesList = document.getElementById('judgesList');
const judgesStatus = document.getElementById('judgesStatus');
const judgeDialog = document.getElementById('judgeDialog');
const judgeForm = document.getElementById('judgeForm');
const judgePrefix = document.getElementById('judgeNamePrefix');
const customPrefixField = document.getElementById('customPrefixField');
const customPrefixInput = judgeForm.elements.namedItem('customPrefix');
const fullJudgeName = document.getElementById('fullJudgeName');
const saveJudgeButton = document.getElementById('saveJudgeButton');
const deleteJudgeButton = document.getElementById('judgeDeleteActions');
const judgeFormStatus = document.getElementById('judgeFormStatus');
let judges = [];
let editingJudge = null;
let designationMigrationRunning = false;

async function migrateJudgeDesignations(snapshot) {
    if (designationMigrationRunning) return;
    const legacyDocs = snapshot.docs.filter(judgeDocument => {
        const data = judgeDocument.data();
        return (!data.designation && (data.judicialDesignation || data.courtType))
            || (data.designation && (data.judicialDesignation || data.courtType));
    });
    if (!legacyDocs.length) return;

    designationMigrationRunning = true;
    try {
        for (let start = 0; start < legacyDocs.length; start += 450) {
            const batch = writeBatch(db);
            legacyDocs.slice(start, start + 450).forEach(judgeDocument => {
                const data = judgeDocument.data();
                batch.update(judgeDocument.ref, {
                    ...(!data.designation && (data.judicialDesignation || data.courtType)
                        ? { designation: data.judicialDesignation || data.courtType }
                        : {}),
                    judicialDesignation: deleteField(),
                    courtType: deleteField()
                });
            });
            await batch.commit();
        }
    } catch (error) {
        console.error('Could not migrate judge designation fields:', error);
    } finally {
        designationMigrationRunning = false;
    }
}

document.getElementById('closeJudgesPage')?.addEventListener('click', () => {
    const hasSameOriginPreviousPage = window.history.length > 1 && document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
    if (hasSameOriginPreviousPage) {
        window.history.back();
        return;
    }
    window.location.href = 'register-diary.html';
});

function resolvedPrefix(data) {
    return data.namePrefix === 'Other'
        ? String(data.customPrefix || '').trim()
        : String(data.namePrefix || '').trim();
}

function formatJudge(data) {
    const prefix = resolvedPrefix(data);
    const name = String(data.judgeName || '').trim();
    const court = [String(data.courtNumber || '').trim(), String(data.designation || data.judicialDesignation || data.courtType || '').trim()]
        .filter(Boolean)
        .join(' ');
    const judge = [prefix, name].filter(Boolean).join(' ');
    return [court, judge].filter(Boolean).join(' -- ');
}

function normalized(value) {
    return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function updateDisplayName() {
    const data = {
        courtNumber: judgeForm.elements.namedItem('courtNumber').value,
        designation: judgeForm.elements.namedItem('designation').value,
        namePrefix: judgePrefix.value,
        customPrefix: customPrefixInput.value,
        judgeName: judgeForm.elements.namedItem('judgeName').value
    };
    fullJudgeName.value = formatJudge(data);
}

function updatePrefixField() {
    const isOther = judgePrefix.value === 'Other';
    customPrefixField.hidden = !isOther;
    customPrefixInput.required = isOther;
    if (!isOther) customPrefixInput.value = '';
    updateDisplayName();
}

function setStatus(message, isError = false) {
    judgesStatus.textContent = message;
    judgesStatus.classList.toggle('is-error', isError);
}

function openForm(judge = null) {
    judgeForm.reset();
    delete judgeForm.dataset.editId;
    editingJudge = judge;
    deleteJudgeButton.hidden = !judge;
    judgePrefix.value = '';
    customPrefixField.hidden = true;
    customPrefixInput.required = false;
    judgeFormStatus.textContent = '';
    judgeFormStatus.classList.remove('is-error');
    document.getElementById('judgeDialogTitle').textContent = judge ? 'Edit Judge' : 'Add Judge';
    saveJudgeButton.textContent = judge ? 'Save Changes' : 'Save Judge';
    if (judge) {
        judgeForm.dataset.editId = judge.id;
        judgeForm.elements.namedItem('courtNumber').value = judge.courtNumber || '';
        judgeForm.elements.namedItem('designation').value = judge.designation || judge.judicialDesignation || judge.courtType || '';
        judgePrefix.value = judge.namePrefix || '';
        customPrefixInput.value = judge.customPrefix || '';
        judgeForm.elements.namedItem('judgeName').value = judge.judgeName || '';
        judgeForm.elements.namedItem('nickName').value = judge.nickName || '';
    }
    updatePrefixField();
    updateDisplayName();
    judgeDialog.showModal();
    judgeForm.elements.namedItem('courtNumber').focus();
}

function renderJudges() {
    judgesList.replaceChildren();
    if (!judges.length) {
        const empty = document.createElement('div');
        empty.className = 'judge-empty-state';
        const heading = document.createElement('h2');
        heading.textContent = 'No judges added yet';
        const message = document.createElement('p');
        message.textContent = 'Add your first judge';
        empty.append(heading, message);
        judgesList.append(empty);
        return;
    }

    judges.forEach(judge => {
        const row = document.createElement('article');
        row.className = 'judge-row';
        const content = document.createElement('div');
        content.className = 'judge-row-content';
        const display = document.createElement('div');
        display.className = 'judge-row-display';
        display.textContent = formatJudge(judge);
        display.title = 'Click to edit';
        display.setAttribute('role', 'button');
        display.setAttribute('tabindex', '0');
        display.setAttribute('aria-label', `Edit ${formatJudge(judge)}`);
        display.addEventListener('click', () => openForm(judge));
        display.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openForm(judge);
            }
        });
        content.append(display);
        row.append(content);
        judgesList.append(row);
    });
}

function isDuplicate(candidate, excludingId = '') {
    const normalizedName = normalized(candidate.judgeName);
    return judges.some(judge =>
        judge.id !== excludingId &&
        normalized(judge.courtNumber) === normalized(candidate.courtNumber) &&
        normalized(judge.designation || judge.judicialDesignation || judge.courtType) === normalized(candidate.designation) &&
        normalized(judge.judgeName) === normalizedName
    );
}

async function removeJudge(judge) {
    if (!window.confirm(`Delete ${formatJudge(judge)} from the judges register? Existing cases will keep their saved judge and court details.`)) return;
    deleteJudgeButton.disabled = true;
    try {
        await deleteDoc(doc(db, 'judges', judge.id));
        judgeDialog.close();
        setStatus('Judge deleted.');
    } catch (error) {
        console.error('Error deleting judge:', error);
        judgeFormStatus.textContent = 'Could not delete this judge. Check your connection and permissions, then try again.';
        judgeFormStatus.classList.add('is-error');
    } finally {
        deleteJudgeButton.disabled = false;
    }
}

judgeForm.addEventListener('input', updateDisplayName);
judgeForm.elements.namedItem('designation').addEventListener('change', updateDisplayName);
judgePrefix.addEventListener('change', updatePrefixField);
document.getElementById('addJudgeButton').addEventListener('click', () => openForm());
deleteJudgeButton.addEventListener('click', () => {
    if (editingJudge) removeJudge(editingJudge);
});
document.getElementById('closeJudgeDialog').addEventListener('click', () => judgeDialog.close());
document.getElementById('cancelJudgeButton').addEventListener('click', () => judgeDialog.close());
judgeDialog.addEventListener('click', event => {
    if (event.target === judgeDialog) judgeDialog.close();
});

judgeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!judgeForm.reportValidity()) return;
    const data = {
        courtNumber: String(judgeForm.elements.namedItem('courtNumber').value).trim(),
        designation: String(judgeForm.elements.namedItem('designation').value).trim(),
        namePrefix: judgePrefix.value,
        customPrefix: judgePrefix.value === 'Other' ? String(customPrefixInput.value).trim() : '',
        judgeName: String(judgeForm.elements.namedItem('judgeName').value).trim(),
        nickName: String(judgeForm.elements.namedItem('nickName').value).trim()
    };
    if (!data.courtNumber || !data.designation || !data.namePrefix || !data.judgeName ||
        (data.namePrefix === 'Other' && !data.customPrefix)) return;

    const editingId = judgeForm.dataset.editId || '';
    if (isDuplicate(data, editingId) &&
        !window.confirm('A judge with this court number, judicial designation, and name already exists. Save this duplicate assignment anyway?')) return;

    saveJudgeButton.disabled = true;
    judgeFormStatus.textContent = '';
    try {
        const now = serverTimestamp();
        if (editingId) {
            await updateDoc(doc(db, 'judges', editingId), {
                ...data,
                judicialDesignation: deleteField(),
                courtType: deleteField(),
                fullJudgeName: formatJudge(data),
                updatedAt: now
            });
        } else {
            await addDoc(judgesCollection, {
                ...data,
                fullJudgeName: formatJudge(data),
                createdAt: now,
                updatedAt: now
            });
        }
        judgeDialog.close();
        setStatus(editingId ? 'Judge updated.' : 'Judge added.');
    } catch (error) {
        console.error('Error saving judge:', error);
        judgeFormStatus.textContent = 'Could not save this judge. Check your connection and permissions, then try again.';
        judgeFormStatus.classList.add('is-error');
    } finally {
        saveJudgeButton.disabled = false;
    }
});

setStatus('Loading judges…');
onSnapshot(judgesCollection, snapshot => {
    migrateJudgeDesignations(snapshot);
    judges = snapshot.docs.map(judgeDoc => ({ id: judgeDoc.id, ...judgeDoc.data() }))
        .sort((left, right) =>
            String(left.courtNumber || '').localeCompare(String(right.courtNumber || ''), undefined, { numeric: true }) ||
            String(left.designation || left.judicialDesignation || left.courtType || '').localeCompare(String(right.designation || right.judicialDesignation || right.courtType || '')) ||
            String(left.judgeName || '').localeCompare(String(right.judgeName || ''))
        );
    renderJudges();
        setStatus('');
}, error => {
    console.error('Error loading judges:', error);
    judges = [];
    const errorState = document.createElement('div');
    errorState.className = 'judge-empty-state';
    errorState.setAttribute('role', 'alert');
    const heading = document.createElement('h2');
    heading.textContent = 'Judges could not be loaded';
    const message = document.createElement('p');
    message.textContent = 'Check your connection and permissions, then refresh the register.';
    errorState.append(heading, message);
    judgesList.replaceChildren(errorState);
    setStatus('Could not load judges. Check your connection and permissions, then try again.', true);
});
