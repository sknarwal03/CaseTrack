import { db } from '@config/firebase-config.js';
import { deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { latestChargeDate } from './charge-date.js';
import { caseRecordRef } from './fir-case-model.js';
import { normalizeTrialStage, populateTrialStageSelect, setTrialStageSelectValue, TRIAL_STAGES } from './trial-stages.js';
import '../css/notification-date-dialog.css';

const STORAGE_KEY = 'register-diary-file-statuses';
const DIALOG_ID = 'notificationDateDialog';

document.body.insertAdjacentHTML('beforeend', `
    <dialog class="notification-date-dialog" id="${DIALOG_ID}" aria-labelledby="notificationDateTitle">
        <header class="notification-date-header">
            <h2 id="notificationDateTitle">FIR date management</h2>
            <button type="button" class="notification-date-close" aria-label="Close">×</button>
        </header>
        <p class="notification-date-fir"></p>
        <form class="notification-date-form">
            <label>Date
                <input type="date" name="date" required>
            </label>
            <label>Trial Stage
                <select name="trialStage" aria-label="Trial Stage">
                    <option value="" selected>Select Trial Stage</option>
                    ${TRIAL_STAGES.map(stage => `<option value="${stage}">${stage}</option>`).join('')}
                </select>
            </label>
            <div class="notification-date-form-actions">
                <button type="submit">Add Date</button>
                <button type="button" class="notification-date-cancel-edit" hidden>Cancel edit</button>
            </div>
        </form>
        <section class="notification-date-saved" aria-labelledby="notificationDateSavedTitle">
            <h3 id="notificationDateSavedTitle">Saved dates</h3>
            <div class="notification-date-list"></div>
        </section>
        <p class="notification-date-status" role="status" aria-live="polite"></p>
    </dialog>
`);

const dialog = document.getElementById(DIALOG_ID);
const form = dialog.querySelector('form');
populateTrialStageSelect(form.elements.namedItem('trialStage'));
const list = dialog.querySelector('.notification-date-list');
const status = dialog.querySelector('.notification-date-status');
const submitButton = form.querySelector('[type="submit"]');
const cancelEditButton = dialog.querySelector('.notification-date-cancel-edit');
let activeCase = null;
let records = [];
let editingRecordId = null;
let editingBaseline = null;
let dateStates = {};
let loading = false;

function todayKey() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function assertUnchangedRecord(currentRecords, recordId, baseline) {
    const latest = currentRecords.find(record => record.id === recordId);
    if (!latest || !baseline
        || latest.kind !== baseline.kind
        || latest.date !== baseline.date
        || latest.trialStage !== baseline.trialStage) {
        throw new Error('This hearing record changed elsewhere. Reload the dialog and try again.');
    }
}

function parseDate(value) {
    const trimmed = String(value || '').trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        || trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    const [year, month, day] = trimmed.includes('-')
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : [Number(match[3]), Number(match[2]), Number(match[1])];
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
}

function normalizeRecords(source) {
    if (!Array.isArray(source)) return [];
    return source
        .filter(record => record && typeof record.id === 'string'
            && ['previous', 'next'].includes(record.kind)
            && parseDate(record.date))
        .map(record => ({
            id: record.id,
            kind: parseDate(record.date) > todayKey() ? 'next' : 'previous',
            date: parseDate(record.date),
            trialStage: String(record.trialStage || '').trim()
        }));
}

function readLocalStatuses() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const data = saved ? JSON.parse(saved) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Saved Register Diary records have an invalid format.');
    }
    return data;
}

function getSourceRecords(caseItem, localCase) {
    const firestoreRecords = Array.isArray(caseItem.hearingDateRecord)
        ? caseItem.hearingDateRecord
        : Array.isArray(caseItem.registerDiaryDaterecords)
            ? caseItem.registerDiaryDaterecords
            : Array.isArray(caseItem.registerDiaryDateRecords)
                ? caseItem.registerDiaryDateRecords
                : localCase?.dateRecords;
    const saved = normalizeRecords(firestoreRecords);
    const legacyDate = parseDate(caseItem.nextDate);
    if (legacyDate && !saved.some(record => record.date === legacyDate)
        && !saved.some(record => record.kind === 'next')) {
        saved.push({
            id: `case-next-${legacyDate}`,
            kind: legacyDate > todayKey() ? 'next' : 'previous',
            date: legacyDate,
            trialStage: String(caseItem.trialStage || '').trim()
        });
    }
    return reconcileRecords(saved);
}

function reconcileRecords(source) {
    const uniqueByDate = new Map();
    source.forEach(record => {
        if (!uniqueByDate.has(record.date)) uniqueByDate.set(record.date, {
            ...record,
            kind: record.date > todayKey() ? 'next' : 'previous'
        });
    });
    const result = [...uniqueByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const nextRecord = result.find(record => record.kind === 'next');
    return result.filter(record => record.kind !== 'next' || record.id === nextRecord?.id);
}

function resetEditor() {
    editingRecordId = null;
    editingBaseline = null;
    form.reset();
    submitButton.textContent = 'Add Date';
    cancelEditButton.hidden = true;
}

function setBusy(value) {
    loading = value;
    form.querySelectorAll('input, select, button').forEach(control => {
        control.disabled = value;
    });
    dialog.querySelector('.notification-date-close').disabled = value;
    list.querySelectorAll('button').forEach(button => {
        button.disabled = value;
    });
}

function renderRecords() {
    list.replaceChildren();
    if (loading) {
        const loadingMessage = document.createElement('p');
        loadingMessage.className = 'notification-date-empty';
        loadingMessage.textContent = 'Loading hearing records…';
        list.append(loadingMessage);
        return;
    }
    if (records.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'notification-date-empty';
        empty.textContent = 'No previous or next dates added.';
        list.append(empty);
        return;
    }

    records.forEach(record => {
        const row = document.createElement('div');
        row.className = 'notification-date-row';
        const openDate = document.createElement('button');
        openDate.type = 'button';
        openDate.className = 'notification-date-link';
        const displayStage = normalizeTrialStage(record.trialStage);
        openDate.textContent = `${formatDate(record.date)}${displayStage ? ` — ${displayStage}` : ''}`;
        openDate.setAttribute('aria-label', `Open diary for ${formatDate(record.date)}`);
        openDate.addEventListener('click', () => {
            const diaryUrl = new URL('register-diary.html', window.location.href);
            diaryUrl.searchParams.set('case', activeCase.id);
            diaryUrl.searchParams.set('date', record.date);
            window.location.assign(diaryUrl);
        });
        const recordStatus = dateStates[record.date] || {};
        const statusIndicators = document.createElement('span');
        statusIndicators.className = 'notification-date-record-status';
        statusIndicators.setAttribute('aria-label', `File status: ${recordStatus.disc ? 'dot marked' : 'no dot'}, ${recordStatus.xState === 'slash' ? 'single line' : recordStatus.xState === 'fullX' ? 'full cross' : 'no line'}, ${recordStatus.returned ? 'returned to cupboard' : 'not returned to cupboard'}`);
        statusIndicators.title = statusIndicators.getAttribute('aria-label');
        const xIndicator = document.createElement('span');
        xIndicator.className = `diary-file-status diary-x-status is-${['slash', 'fullX'].includes(recordStatus.xState) ? recordStatus.xState : 'none'}`;
        xIndicator.setAttribute('aria-hidden', 'true');
        xIndicator.innerHTML = '<span class="diary-x-stroke diary-x-stroke-forward"></span><span class="diary-x-stroke diary-x-stroke-back"></span>';
        const dotIndicator = document.createElement('span');
        dotIndicator.className = `diary-file-status diary-disc-status${recordStatus.disc === true ? ' is-active' : ''}`;
        dotIndicator.textContent = '•';
        dotIndicator.setAttribute('aria-hidden', 'true');
        const returnedIndicator = document.createElement('span');
        returnedIndicator.className = `diary-return-status${recordStatus.returned === true ? ' is-active' : ''}`;
        returnedIndicator.textContent = '✓';
        returnedIndicator.setAttribute('aria-hidden', 'true');
        statusIndicators.append(xIndicator, dotIndicator, returnedIndicator);
        const actions = document.createElement('div');
        actions.className = 'notification-date-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'notification-date-edit';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => {
            editingRecordId = record.id;
            editingBaseline = { ...record };
            form.elements.namedItem('date').value = record.date;
            setTrialStageSelectValue(form.elements.namedItem('trialStage'), record.trialStage);
            submitButton.textContent = 'Update Date';
            cancelEditButton.hidden = false;
            status.textContent = '';
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'notification-date-delete';
        remove.textContent = 'Delete';
        remove.addEventListener('click', async () => {
            await saveMutation({
                type: 'delete',
                recordId: record.id,
                baseline: { ...record }
            });
        });
        actions.append(edit, remove);
        row.append(statusIndicators, openDate, actions);
        list.append(row);
    });
}

function recordsForTransaction(caseData, localCase) {
    const source = Array.isArray(caseData.hearingDateRecord)
        ? caseData.hearingDateRecord
        : Array.isArray(caseData.registerDiaryDaterecords)
            ? caseData.registerDiaryDaterecords
            : Array.isArray(caseData.registerDiaryDateRecords)
                ? caseData.registerDiaryDateRecords
                : localCase?.dateRecords;
    let transactionRecords = normalizeRecords(source);
    const legacyDate = parseDate(caseData.nextDate);
    if (legacyDate && !transactionRecords.some(record => record.date === legacyDate)
        && !transactionRecords.some(record => record.kind === 'next')) {
        transactionRecords.push({
            id: `case-next-${legacyDate}`,
            kind: legacyDate > todayKey() ? 'next' : 'previous',
            date: legacyDate,
            trialStage: String(caseData.trialStage || '').trim()
        });
    }
    return reconcileRecords(transactionRecords);
}

function applyMutation(source, mutation) {
    let next = [...source];
    if (mutation.type === 'delete') {
        assertUnchangedRecord(next, mutation.recordId, mutation.baseline);
        return next.filter(record => record.id !== mutation.recordId);
    }

    if (mutation.type === 'edit') assertUnchangedRecord(next, mutation.recordId, mutation.baseline);
    const kind = mutation.date > todayKey() ? 'next' : 'previous';
    const duplicatePrevious = kind === 'previous'
        ? next.find(record => record.date === mutation.date && record.id !== mutation.recordId)
        : null;
    const savedRecord = duplicatePrevious
        ? { ...duplicatePrevious, trialStage: mutation.trialStage }
        : {
            id: mutation.recordId || `hearing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind,
            date: mutation.date,
            trialStage: mutation.trialStage
        };
    next = next.filter(record => {
        if (record.id === mutation.recordId || record.id === duplicatePrevious?.id) return false;
        return kind !== 'next' || record.kind !== 'next';
    });
    next.push(savedRecord);
    return reconcileRecords(next);
}

function serializeLocalCase(caseId, dateRecords) {
    const allCases = readLocalStatuses();
    const previous = allCases[caseId] && typeof allCases[caseId] === 'object'
        ? allCases[caseId]
        : {};
    allCases[caseId] = { ...previous, dateRecords };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allCases));
}

async function saveMutation(mutation) {
    if (!activeCase || loading) return;
    status.textContent = '';
    setBusy(true);
    try {
        const reference = caseRecordRef(db, activeCase);
        const localStatuses = readLocalStatuses();
        const localCase = localStatuses[activeCase.id];
        const committedRecords = await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists()) throw new Error('This case no longer exists.');
            const caseData = snapshot.data();
            const updatedRecords = applyMutation(recordsForTransaction(caseData, localCase), mutation);
            const upcoming = updatedRecords.find(record => record.kind === 'next');
            transaction.update(reference, {
                hearingDateRecord: updatedRecords,
                nextDate: upcoming ? formatDate(upcoming.date) : '',
                trialStage: upcoming?.trialStage || '',
                chargeDate: latestChargeDate(updatedRecords),
                registerDiaryDaterecords: deleteField(),
                registerDiaryDateRecords: deleteField()
            });
            return updatedRecords;
        });
        records = committedRecords;
        activeCase.hearingDateRecord = committedRecords;
        const next = committedRecords.find(record => record.kind === 'next');
        activeCase.nextDate = next ? formatDate(next.date) : '';
        activeCase.trialStage = next?.trialStage || '';
        try {
            serializeLocalCase(activeCase.id, committedRecords);
        } catch (error) {
            console.error('Hearing records saved, but Register Diary local data could not be updated:', error);
            window.alert('The hearing record was saved, but the Register Diary browser copy could not be updated.');
        }
        renderRecords();
        window.dispatchEvent(new CustomEvent('caseAdded'));
        dialog.close();
    } catch (error) {
        console.error('Could not save notification hearing record:', error);
        status.textContent = error instanceof Error && error.message
            ? error.message
            : 'Could not save hearing date. Please try again.';
    } finally {
        setBusy(false);
    }
}

async function openNotificationDateDialog(caseItem) {
    if (!caseItem?.id) {
        console.error('Cannot open date management without a case ID.');
        return;
    }
    activeCase = caseItem;
    records = [];
    dateStates = {};
    status.textContent = '';
    const firYear = caseItem.firYear ? String(caseItem.firYear).slice(-2) : '';
    dialog.querySelector('.notification-date-fir').textContent = `FIR ${[caseItem.firNo, firYear].filter(Boolean).join('/') || 'number not assigned'}`;
    resetEditor();
    setBusy(true);
    renderRecords();
    if (!dialog.open) dialog.showModal();
    try {
        const snapshot = await getDoc(caseRecordRef(db, caseItem));
        if (!snapshot.exists()) throw new Error('This case no longer exists.');
        activeCase = { id: snapshot.id, ...snapshot.data(), _collectionName: caseItem._collectionName || 'cases' };
        const localStatuses = readLocalStatuses();
        const localCase = localStatuses[activeCase.id];
        dateStates = localCase?.dateStates || {};
        records = getSourceRecords(activeCase, localCase);
    } catch (error) {
        console.error('Could not load notification hearing records:', error);
        status.textContent = 'Could not load saved hearing records. Please close and try again.';
        records = [];
    } finally {
        setBusy(false);
        renderRecords();
    }
}

dialog.querySelector('.notification-date-close').addEventListener('click', () => dialog.close());
cancelEditButton.addEventListener('click', resetEditor);
dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
});
form.addEventListener('submit', async event => {
    event.preventDefault();
    const dateInput = form.elements.namedItem('date');
    const date = parseDate(dateInput.value);
    if (!dateInput.reportValidity() || !date) return;
    if (date === todayKey()) {
        status.textContent = 'Choose a date other than today.';
        return;
    }
    await saveMutation({
        type: editingRecordId ? 'edit' : 'add',
        recordId: editingRecordId,
        baseline: editingBaseline,
        date,
        trialStage: String(form.elements.namedItem('trialStage').value || '').trim()
    });
    if (!dialog.open) resetEditor();
});

window.openNotificationDateDialog = openNotificationDateDialog;
