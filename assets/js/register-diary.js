// Register Diary cases are loaded from the shared Firestore case collection.
import { db } from '@config/firebase-config.js';
import { collection, deleteField, getDocs, runTransaction } from 'firebase/firestore';
import { caseRecordRef, loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';
import { latestChargeDate } from './charge-date.js';
import { normalizeTrialStage, populateTrialStageSelect, setTrialStageSelectValue } from './trial-stages.js';

const requestedDiaryDate = new URLSearchParams(window.location.search).get('date');
const requestedDiaryParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(requestedDiaryDate || '');
const requestedDiaryCaseId = new URLSearchParams(window.location.search).get('case');
let requestedDiaryCaseFocused = false;
let currentDate = requestedDiaryParts
    ? new Date(Number(requestedDiaryParts[1]), Number(requestedDiaryParts[2]) - 1, Number(requestedDiaryParts[3]), 12)
    : new Date();
currentDate.setHours(12, 0, 0, 0);
let touchStartX = 0, touchStartY = 0;
let cases = [];
let judgeAssignments = [];
let casesLoadError = null;
let casesLoaded = false;
const FILE_STATUS_STORAGE_KEY = 'register-diary-file-statuses';
let fileStatusByCaseId = {};
let dateDialogCase = null;
let editingDateRecordId = null;
const pendingFirClicks = new Map();

const $ = id => document.getElementById(id);
populateTrialStageSelect($('diaryDateForm')?.elements.namedItem('trialStage'));
let extraNotesDbPromise;

document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.diary-extra-photo-gallery:not([hidden])').forEach(gallery => {
        const attachButton = gallery.parentElement?.querySelector('.diary-extra-attach');
        if (!gallery.contains(event.target) && !attachButton?.contains(event.target)) gallery.hidden = true;
    });
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        document.querySelectorAll('.diary-extra-photo-gallery:not([hidden])')
            .forEach(gallery => { gallery.hidden = true; });
    }
});

function openExtraNotesDb() {
    if (!extraNotesDbPromise) {
        extraNotesDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('caseTrackDiaryNotes', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('photos');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return extraNotesDbPromise;
}

async function getExtraNotePhotos(key) {
    const database = await openExtraNotesDb();
    return new Promise((resolve, reject) => {
        const request = database.transaction('photos', 'readonly').objectStore('photos').get(key);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function saveExtraNotePhotos(key, photos) {
    const database = await openExtraNotesDb();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('photos', 'readwrite');
        transaction.objectStore('photos').put(photos, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

async function clearExtraNotePhotos(keyPrefix) {
    const database = await openExtraNotesDb();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.getAllKeys();
        request.onsuccess = () => request.result
            .filter(key => String(key).startsWith(keyPrefix))
            .forEach(key => store.delete(key));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

function loadFileStatuses() {
    try {
        const saved = localStorage.getItem(FILE_STATUS_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Saved register diary file statuses have an invalid format.');
        }
        fileStatusByCaseId = parsed;
    } catch (error) {
        console.error('Could not load register diary file statuses:', error);
    }
}

function getFileStatus(caseId, diaryDate = keyDate(currentDate)) {
    const saved = fileStatusByCaseId[caseId];
    const dateState = saved?.dateStates?.[diaryDate];
    const dateRecords = Array.isArray(saved?.dateRecords)
        ? saved.dateRecords.filter(record =>
            record && typeof record.id === 'string'
            && typeof record.date === 'string'
            && ['previous', 'next'].includes(record.kind)
        )
        : [];
    const latestNextRecord = dateRecords.reduce((latestIndex, record, index) =>
        record.kind === 'next' ? index : latestIndex, -1);
    return {
        xState: ['none', 'slash', 'fullX'].includes(dateState?.xState) ? dateState.xState : 'none',
        disc: dateState?.disc === true,
        returned: dateState?.returned === true,
        dateRecords: dateRecords.filter((record, index) =>
            record.kind !== 'next' || index === latestNextRecord
        )
    };
}

function updateFileStatus(caseId, changes, diaryDate = keyDate(currentDate)) {
    const previous = fileStatusByCaseId[caseId];
    const current = getFileStatus(caseId, diaryDate);
    const { xState, disc, returned, dateRecords } = changes;
    const updated = { ...getFileStatus(caseId, diaryDate) };
    const updatedCase = { ...previous };

    if (dateRecords !== undefined) updated.dateRecords = dateRecords;
    if (xState !== undefined) updated.xState = xState;
    if (disc !== undefined) updated.disc = disc;
    if (returned !== undefined) updated.returned = returned;

    if (dateRecords !== undefined) updatedCase.dateRecords = dateRecords;
    if (xState !== undefined || disc !== undefined || returned !== undefined) {
        const dateStates = { ...(previous?.dateStates || {}) };
        dateStates[diaryDate] = {
            xState: xState ?? current.xState,
            disc: disc ?? current.disc,
            returned: returned ?? current.returned
        };
        updatedCase.dateStates = dateStates;
    }

    fileStatusByCaseId[caseId] = updatedCase;
    try {
        localStorage.setItem(FILE_STATUS_STORAGE_KEY, JSON.stringify(fileStatusByCaseId));
        return updated;
    } catch (error) {
        if (previous) fileStatusByCaseId[caseId] = previous;
        else delete fileStatusByCaseId[caseId];
        console.error('Could not save register diary file status:', error);
        const status = $('diaryDialogStatus');
        if (status) status.textContent = 'Could not save this change in this browser.';
        return null;
    }
}

async function persistHearingDateRecords(caseId, dateRecords) {
    try {
        const today = keyDate(new Date());
        const nextRecord = dateRecords
            .filter(record => record && caseDateKey(record.date) > today)
            .sort((a, b) => caseDateKey(a.date).localeCompare(caseDateKey(b.date)))[0];
        const nextDate = nextRecord ? formatDiaryDate(nextRecord.date) : '';
        const trialStage = String(nextRecord?.trialStage || '').trim();
        const caseItem = cases.find(item => item.id === caseId);
        const reference = caseRecordRef(db, caseItem || { id: caseId });
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists()) throw new Error('This case no longer exists.');
            transaction.update(reference, {
                hearingDateRecord: dateRecords,
                nextDate,
                trialStage,
                chargeDate: latestChargeDate(dateRecords),
                registerDiaryDaterecords: deleteField(),
                registerDiaryDateRecords: deleteField()
            });
        });
        if (caseItem) {
            caseItem.hearingDateRecord = dateRecords;
            caseItem.nextDate = nextDate;
            caseItem.trialStage = trialStage;
            delete caseItem.registerDiaryDaterecords;
            delete caseItem.registerDiaryDateRecords;
        }
        return true;
    } catch (error) {
        console.error('Could not save hearing dates to Firestore:', error);
        return false;
    }
}

function reconcileCaseDateRecords(caseItem) {
    const today = keyDate(new Date());
    const firestoreRecords = Array.isArray(caseItem.hearingDateRecord)
        ? caseItem.hearingDateRecord
        : Array.isArray(caseItem.registerDiaryDaterecords)
            ? caseItem.registerDiaryDaterecords
            : Array.isArray(caseItem.registerDiaryDateRecords)
                ? caseItem.registerDiaryDateRecords
                : null;
    if (firestoreRecords && JSON.stringify(firestoreRecords) !== JSON.stringify(getFileStatus(caseItem.id).dateRecords)) {
        updateFileStatus(caseItem.id, { dateRecords: firestoreRecords });
    }
    const state = getFileStatus(caseItem.id);
    const originalNextDate = caseDateKey(caseItem.nextDate);
    const records = state.dateRecords.map(record =>
        record.kind === 'next' && record.date <= today
            ? { ...record, kind: 'previous' }
            : record
    );

    if (originalNextDate && originalNextDate <= today
        && !records.some(record => record.date === originalNextDate)) {
        records.push({
            id: `case-next-${originalNextDate}`,
            kind: 'previous',
            date: originalNextDate,
            trialStage: String(caseItem.trialStage || caseItem.status || '').trim()
        });
    }

    const uniqueDates = new Map();
    records.forEach(record => {
        if (!uniqueDates.has(record.date)) uniqueDates.set(record.date, record);
    });
    const reconciledRecords = [...uniqueDates.values()]
        .filter(record => record.kind !== 'next' || record.date > today);
    if (JSON.stringify(reconciledRecords) !== JSON.stringify(state.dateRecords)) {
        updateFileStatus(caseItem.id, { dateRecords: reconciledRecords });
    }
    const storedRecords = getFileStatus(caseItem.id).dateRecords;
    const needsFirestoreSync = JSON.stringify(storedRecords) !== JSON.stringify(caseItem.hearingDateRecord || [])
        || Object.prototype.hasOwnProperty.call(caseItem, 'registerDiaryDaterecords')
        || Object.prototype.hasOwnProperty.call(caseItem, 'registerDiaryDateRecords');
    if (needsFirestoreSync && (firestoreRecords || storedRecords.length > 0)) {
        void persistHearingDateRecords(caseItem.id, storedRecords);
    }
}

function reconcileAllCaseDates() {
    cases.forEach(reconcileCaseDateRecords);
}

function scheduleDailyRollover() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    window.setTimeout(() => {
        reconcileAllCaseDates();
        renderNotes();
        scheduleDailyRollover();
    }, nextMidnight.getTime() - now.getTime());
}

function formatDiaryDate(dateKey) {
    const parsed = caseDateKey(dateKey);
    if (!parsed) return dateKey;
    const [year, month, day] = parsed.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-GB');
}

function getLinkedNextDate(caseItem, diaryDate) {
    const dateRecords = getFileStatus(caseItem.id).dateRecords;
    const candidates = dateRecords
        .filter(record => record.date > diaryDate)
        .map(record => ({
            date: record.date,
            trialStage: String(record.trialStage || '').trim()
        }));
    const legacyNextDate = caseDateKey(caseItem.nextDate);
    const hasManagedNextDate = dateRecords.some(record => record.kind === 'next');
    if (legacyNextDate > diaryDate && !hasManagedNextDate
        && !dateRecords.some(record => record.date === legacyNextDate)) {
        candidates.push({
            date: legacyNextDate,
            trialStage: String(caseItem.trialStage || caseItem.status || '').trim()
        });
    }
    return candidates.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function publishHearingDateNotifications() {
    const today = keyDate(new Date());
    const excludedStatuses = new Set(['ucr', 'untrace', 'untraced', 'cancellation', 'disposed', 'committed', 'ui', 'under investigation']);
    const notifications = cases
        .filter(caseItem => isCourtProceeding(caseItem) && !caseItem.successorCaseId
            && !excludedStatuses.has(String(caseItem.status || '').trim().toLowerCase()))
        .filter(caseItem => !getLinkedNextDate(caseItem, today))
        .map(caseItem => {
            const firNumber = [caseItem.firNo, caseItem.firYear]
                .filter(value => value !== null && value !== undefined && String(value).trim())
                .join('/');
            return {
                caseId: caseItem.id,
                caseCollection: caseItem._collectionName || 'cases',
                title: 'Next date update needed',
                message: `FIR ${firNumber || 'number not assigned'} has no upcoming hearing date. Update the next date.`
            };
        });
    window.dispatchEvent(new CustomEvent('caseTrackNotificationsUpdated', {
        detail: { notifications }
    }));
}

let caseDetailsModulePromise;
function openCaseDetailsDialog(caseItem) {
    if (!caseDetailsModulePromise) caseDetailsModulePromise = import('./cases.js');
    caseDetailsModulePromise
        .then(caseModule => caseModule.openCaseDetailsModal(caseItem))
        .catch(error => console.error('Could not open full case details:', error));
}

function openDateDialog(caseItem) {
    dateDialogCase = caseItem;
    const firNumber = [caseItem.firNo, caseItem.firYear ? String(caseItem.firYear).slice(-2) : '']
        .filter(Boolean).join('/');
    $('diaryDialogFir').textContent = `FIR ${firNumber || 'number not assigned'}`;
    $('diaryDialogTitle').textContent = 'FIR date management';
    $('diaryDialogStatus').textContent = '';
    resetDateEditor();
    renderSavedDates();
    $('diaryDateDialog').showModal();
}

function focusRequestedDiaryCase() {
    if (!requestedDiaryCaseId || requestedDiaryCaseFocused) return;
    const caseItem = cases.find(item => item.id === requestedDiaryCaseId);
    if (!caseItem) return;
    requestedDiaryCaseFocused = true;
    const diaryItem = document.querySelector(`.diary-file-item[data-case-id="${CSS.escape(caseItem.id)}"]`);
    if (diaryItem) {
        diaryItem.classList.add('is-notification-target');
        diaryItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        openDateDialog(caseItem);
    }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('case');
    window.history.replaceState({}, '', currentUrl);
}

function resetDateEditor() {
    editingDateRecordId = null;
    $('diaryDateForm').reset();
    $('diaryDateSubmit').textContent = 'Add Date';
    $('diaryDateCancelEdit').hidden = true;
}

function editDateRecord(record) {
    const form = $('diaryDateForm');
    editingDateRecordId = record.id;
    form.elements.namedItem('date').value = record.date;
    setTrialStageSelectValue(form.elements.namedItem('trialStage'), record.trialStage);
    $('diaryDateSubmit').textContent = 'Update Date';
    $('diaryDateCancelEdit').hidden = false;
    $('diaryDialogStatus').textContent = '';
    form.elements.namedItem('date').focus();
}

function renderSavedDates() {
    const list = $('diarySavedDateList');
    list.replaceChildren();
    if (!dateDialogCase) return;
    const records = [...getFileStatus(dateDialogCase.id).dateRecords]
        .sort((a, b) => a.date.localeCompare(b.date));
    if (records.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'diary-saved-dates-empty';
        empty.textContent = 'No previous or next dates added.';
        list.appendChild(empty);
        return;
    }

    records.forEach(record => {
        const row = document.createElement('div');
        row.className = 'diary-saved-date';
        const openDate = document.createElement('button');
        openDate.type = 'button';
        openDate.className = 'diary-saved-date-link';
        const displayStage = normalizeTrialStage(record.trialStage);
        openDate.textContent = `${formatDiaryDate(record.date)}${displayStage ? ` — ${displayStage}` : ''}`;
        openDate.setAttribute('aria-label', `Open diary for ${formatDiaryDate(record.date)}`);
        openDate.addEventListener('click', () => {
            const [year, month, day] = record.date.split('-').map(Number);
            currentDate = new Date(year, month - 1, day, 12);
            $('diaryDateDialog').close();
            render();
        });
        const dateStatus = getFileStatus(dateDialogCase.id, record.date);
        const statusIndicators = document.createElement('span');
        statusIndicators.className = 'diary-saved-date-status';
        statusIndicators.setAttribute('aria-label', `File status: ${dateStatus.disc ? 'dot marked' : 'no dot'}, ${dateStatus.xState === 'none' ? 'no line' : dateStatus.xState === 'slash' ? 'single line' : 'full cross'}, ${dateStatus.returned ? 'returned to cupboard' : 'not returned to cupboard'}`);
        statusIndicators.title = statusIndicators.getAttribute('aria-label');
        const xIndicator = document.createElement('span');
        xIndicator.className = `diary-file-status diary-x-status is-${dateStatus.xState}`;
        xIndicator.setAttribute('aria-hidden', 'true');
        xIndicator.innerHTML = '<span class="diary-x-stroke diary-x-stroke-forward"></span><span class="diary-x-stroke diary-x-stroke-back"></span>';
        const dotIndicator = document.createElement('span');
        dotIndicator.className = `diary-file-status diary-disc-status${dateStatus.disc ? ' is-active' : ''}`;
        dotIndicator.textContent = '•';
        dotIndicator.setAttribute('aria-hidden', 'true');
        const returnedIndicator = document.createElement('span');
        returnedIndicator.className = `diary-return-status${dateStatus.returned ? ' is-active' : ''}`;
        returnedIndicator.textContent = '✓';
        returnedIndicator.setAttribute('aria-hidden', 'true');
        statusIndicators.append(xIndicator, dotIndicator, returnedIndicator);
        const actions = document.createElement('div');
        actions.className = 'diary-saved-date-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'diary-date-edit';
        edit.textContent = 'Edit';
        edit.setAttribute('aria-label', `Edit date ${formatDiaryDate(record.date)}`);
        edit.addEventListener('click', () => editDateRecord(record));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'diary-date-delete';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', `Delete date ${formatDiaryDate(record.date)}`);
        remove.addEventListener('click', async () => {
            if (editingDateRecordId === record.id) resetDateEditor();
            const caseId = dateDialogCase.id;
            const dateRecords = getFileStatus(caseId).dateRecords
                    .filter(item => item.id !== record.id)
            const updated = updateFileStatus(caseId, { dateRecords });
            if (updated) {
                const synced = await persistHearingDateRecords(caseId, dateRecords);
                $('diaryDialogStatus').textContent = synced
                    ? ''
                    : 'Date was removed locally but could not be synced to Firestore.';
                renderSavedDates();
                renderNotes();
            }
        });
        actions.append(edit, remove);
        row.append(statusIndicators, openDate, actions);
        list.appendChild(row);
    });
}

async function submitDiaryDate(event) {
    event.preventDefault();
    if (!dateDialogCase) return;
    const form = event.currentTarget;
    const dateInput = form.elements.namedItem('date');
    const date = dateInput.value;
    const today = keyDate(new Date());
    if (!dateInput.reportValidity()) return;
    if (date === today) {
        $('diaryDialogStatus').textContent = 'Choose a date before or after today.';
        return;
    }

    const kind = date < today ? 'previous' : 'next';
    const current = getFileStatus(dateDialogCase.id);
    const record = {
        id: editingDateRecordId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        date,
        trialStage: form.elements.namedItem('trialStage').value.trim()
    };
    const matchingPrevious = kind === 'previous'
        ? current.dateRecords.find(item => item.date === date && item.id !== editingDateRecordId)
        : null;
    const savedRecord = matchingPrevious
        ? { ...matchingPrevious, trialStage: record.trialStage }
        : record;
    const remainingRecords = current.dateRecords.filter(item => {
        if (item.id === editingDateRecordId || item.id === matchingPrevious?.id) return false;
        return kind !== 'next' || item.kind !== 'next';
    });
    const updated = updateFileStatus(dateDialogCase.id, { dateRecords: [...remainingRecords, savedRecord] });
    if (!updated) return;
    const savedRecords = [...remainingRecords, savedRecord];
    const synced = await persistHearingDateRecords(dateDialogCase.id, savedRecords);
    $('diaryDialogStatus').textContent = synced
        ? kind === 'previous' ? 'Previous date saved.' : 'Next date saved.'
        : 'Date was saved locally but could not be synced to Firestore.';
    resetDateEditor();
    renderSavedDates();
    renderNotes();
}

loadFileStatuses();

function keyDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function caseDateKey(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const dateValue = value.trim();
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (isoDate) {
        const [, year, month, day] = isoDate;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return date.getFullYear() === Number(year)
            && date.getMonth() === Number(month) - 1
            && date.getDate() === Number(day) ? dateValue : '';
    }

    const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue);
    if (!localDate) return '';
    const [, day, month, year] = localDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year)
        || date.getMonth() !== Number(month) - 1
        || date.getDate() !== Number(day)) return '';
    return keyDate(date);
}

function displayJudgeName(value) {
    const courtName = String(value || '').trim();
    const jmicMatch = /^(\d+)\s*JMIC\s*[-—–:]?\s*(.*)$/i.exec(courtName);
    if (!jmicMatch) return courtName || 'Judge not assigned';

    const [, number, rawName] = jmicMatch;
    const judgeName = rawName.replace(/^(?:Ms|Mrs|Mr|Dr)\.?\s+/i, '').trim().split(/\s+/)[0];
    return judgeName ? `${judgeName} ${number}` : `${number} JMIC`;
}

function normalizeJudgeLookup(value) {
    return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function nicknameForCase(caseItem) {
    const courtName = String(caseItem.courtName || '').trim();
    const normalizedCourtName = normalizeJudgeLookup(courtName);
    let assignment = judgeAssignments.find(judge => judge.id === caseItem.judgeId)
        || judgeAssignments.find(judge => normalizeJudgeLookup(judge.fullJudgeName) === normalizedCourtName);
    if (!assignment) {
        const courtLabel = courtName.split(/\s+--\s+/)[0];
        const courtNumber = String(caseItem.courtNumber || /\d+/.exec(courtLabel)?.[0] || '');
        const courtType = String(caseItem.courtType || courtLabel.replace(/\d+/g, '').trim());
        const sameNumber = judgeAssignments.filter(judge =>
            String(judge.courtNumber || '').trim() === courtNumber
        );
        assignment = sameNumber.find(judge =>
            normalizeJudgeLookup(judge.designation || judge.judicialDesignation || judge.courtType) === normalizeJudgeLookup(courtType)
        ) || (sameNumber.length === 1 ? sameNumber[0] : null);
    }
    return String(assignment?.nickName || '').trim();
}

function designationForCase(caseItem) {
    const assignment = judgeAssignments.find(judge => judge.id === caseItem.judgeId);
    return String(assignment?.designation || assignment?.judicialDesignation || assignment?.courtType
        || caseItem.judgeDesignation || caseItem.judgeCourtType || '').trim().toUpperCase();
}

function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
}

function shiftDay(n) {
    currentDate.setDate(currentDate.getDate() + n);
    render();
}

function goToToday() {
    currentDate = new Date();
    currentDate.setHours(12, 0, 0, 0);
    render();
}

function selectMonth(month) {
    const year = currentDate.getFullYear();
    const day = Math.min(currentDate.getDate(), new Date(year, month + 1, 0).getDate());
    currentDate = new Date(year, month, day, 12);
    closeMonthPicker();
    render();
}

function selectYear(year) {
    const month = currentDate.getMonth();
    const day = Math.min(currentDate.getDate(), new Date(year, month + 1, 0).getDate());
    currentDate = new Date(year, month, day, 12);
    closeYearPicker();
    render();
}

function openMonthPicker() {
    const picker = $('diaryMonthPicker');
    picker.classList.add('is-open');
    picker.setAttribute('aria-hidden', 'false');
    $('diaryMonth').setAttribute('aria-expanded', 'true');
}

function closeMonthPicker() {
    const picker = $('diaryMonthPicker');
    picker.classList.remove('is-open');
    picker.setAttribute('aria-hidden', 'true');
    $('diaryMonth').setAttribute('aria-expanded', 'false');
}

function openYearPicker() {
    const picker = $('diaryYearPicker');
    picker.classList.add('is-open');
    picker.setAttribute('aria-hidden', 'false');
    $('diaryYearBox').setAttribute('aria-expanded', 'true');
}

function closeYearPicker() {
    const picker = $('diaryYearPicker');
    picker.classList.remove('is-open');
    picker.setAttribute('aria-hidden', 'true');
    $('diaryYearBox').setAttribute('aria-expanded', 'false');
}

function render() {
    $('diaryDateNum').textContent  = currentDate.getDate();
    $('diaryMonth').textContent    = currentDate.toLocaleString('en-US', {month:'long'});
    $('diaryMonthPicker').querySelectorAll('button[data-month]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.month) === currentDate.getMonth()));
    });
    $('diaryYearPicker').querySelectorAll('button[data-year]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.year) === currentDate.getFullYear()));
    });
    $('diaryWeekday').textContent  = currentDate.toLocaleString('en-US', {weekday:'long'});
    $('diaryYearBox').textContent  = currentDate.getFullYear();
    renderCalendars();
    renderNotes();
    // scroll just the diary page area back to top
    const page = document.querySelector('.main');
    if (page) page.scrollTo({top: 0, behavior: 'smooth'});
}

function renderCalendars() {
    $('diaryCurrentTitle').textContent = currentDate.toLocaleString('en-US',{month:'long'}).toUpperCase() + ' ' + currentDate.getFullYear();
    monthGrid('diaryCurrentGrid', new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
}

function monthGrid(id, monthDate) {
    const el = $(id); el.innerHTML = '';
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m+1, 0);
    const start = (first.getDay() + 6) % 7;    // Mon-first
    for (let i = 0; i < start; i++) {
        const b = document.createElement('button');
        b.className = 'empty'; b.disabled = true;
        el.appendChild(b);
    }
    for (let d = 1; d <= last.getDate(); d++) {
        const b = document.createElement('button');
        b.textContent = d;
        const target = new Date(y, m, d); target.setHours(12, 0, 0, 0);
        if (sameDate(target, currentDate)) b.classList.add('selected');
        b.title = 'Open ' + target.toLocaleDateString('en-US',{dateStyle:'full'});
        b.addEventListener('click', () => { currentDate = target; render(); });
        el.appendChild(b);
    }
}

function sessionAssignment(caseItem) {
    const courtName = String(caseItem.courtName || '').trim();
    const [courtLabel = '', ...judgeParts] = courtName.split(/\s+--\s+/);
    const rawJudgeName = judgeParts.join(' -- ').trim()
        || (/\b(?:session|court)\b/i.test(courtLabel) ? '' : displayJudgeName(courtName));
    const judgeName = nicknameForCase(caseItem)
        || rawJudgeName.replace(/^(?:Ms|Mrs|Mr|Dr)\.?\s+/i, '').trim();
    const courtNumber = String(caseItem.courtNumber || '')
        || /\d+/.exec(courtLabel)?.[0]
        || '';
    return { courtNumber, judgeName };
}

function createDiaryFileItem({ caseItem, trialStage }, diaryDate, isSessionCase = false) {
    const item = document.createElement('div');
    item.className = 'diary-file-item';
    const firNumber = [caseItem.firNo, caseItem.firYear ? String(caseItem.firYear).slice(-2) : '']
        .filter(Boolean).join('/');
    const status = getFileStatus(caseItem.id, diaryDate);
    item.dataset.caseId = caseItem.id;

    const xStatus = document.createElement('button');
    xStatus.type = 'button';
    xStatus.className = `diary-file-status diary-x-status is-${status.xState}`;
    xStatus.setAttribute('aria-label', status.xState === 'none'
        ? 'File status normal. Click to mark file placed in court.'
        : status.xState === 'slash'
            ? 'File marked as placed in court. Click to mark file picked up from court.'
            : 'File marked as picked up from court. Click to clear file status.');
    xStatus.setAttribute('aria-pressed', String(status.xState !== 'none'));
    xStatus.title = xStatus.getAttribute('aria-label');
    xStatus.innerHTML = '<span class="diary-x-stroke diary-x-stroke-forward"></span><span class="diary-x-stroke diary-x-stroke-back"></span>';
    xStatus.addEventListener('click', () => {
        const nextState = { none: 'slash', slash: 'fullX', fullX: 'none' }[getFileStatus(caseItem.id, diaryDate).xState];
        if (updateFileStatus(caseItem.id, { xState: nextState }, diaryDate)) renderNotes();
    });

    const discStatus = document.createElement('button');
    discStatus.type = 'button';
    discStatus.className = `diary-file-status diary-disc-status${status.disc ? ' is-active' : ''}`;
    discStatus.textContent = '•';
    discStatus.setAttribute('aria-pressed', String(status.disc));
    discStatus.setAttribute('aria-label', status.disc
        ? 'File found. Click to hide the indicator.'
        : 'File not yet found. Click to show the indicator.');
    discStatus.title = discStatus.getAttribute('aria-label');
    discStatus.addEventListener('click', () => {
        if (updateFileStatus(caseItem.id, { disc: !getFileStatus(caseItem.id, diaryDate).disc }, diaryDate)) renderNotes();
    });

    const returnedStatus = document.createElement('button');
    returnedStatus.type = 'button';
    returnedStatus.className = `diary-file-status diary-return-status${status.returned ? ' is-active' : ''}`;
    returnedStatus.textContent = '✓';
    returnedStatus.setAttribute('aria-pressed', String(status.returned));
    returnedStatus.setAttribute('aria-label', status.returned
        ? 'File returned to cupboard. Click to clear the mark.'
        : 'File not returned to cupboard. Click to mark it returned.');
    returnedStatus.title = returnedStatus.getAttribute('aria-label');
    returnedStatus.addEventListener('click', () => {
        if (updateFileStatus(caseItem.id, { returned: !getFileStatus(caseItem.id, diaryDate).returned }, diaryDate)) renderNotes();
    });

    const firButton = document.createElement('button');
    firButton.type = 'button';
    firButton.className = 'diary-fir-number';
    firButton.textContent = firNumber ? `FIR ${firNumber}` : 'Case number not assigned';
    firButton.setAttribute('aria-label', `${firButton.textContent}. Single click for date management; double click to view FIR details.`);
    firButton.addEventListener('click', () => {
        const pending = pendingFirClicks.get(caseItem.id);
        if (pending) {
            clearTimeout(pending);
            pendingFirClicks.delete(caseItem.id);
            return;
        }
        const timeout = window.setTimeout(() => {
            pendingFirClicks.delete(caseItem.id);
            openDateDialog(caseItem);
        }, 500);
        pendingFirClicks.set(caseItem.id, timeout);
    });
    firButton.addEventListener('dblclick', event => {
        event.preventDefault();
        const pending = pendingFirClicks.get(caseItem.id);
        if (pending) clearTimeout(pending);
        pendingFirClicks.delete(caseItem.id);
        openCaseDetailsDialog(caseItem);
    });

    const stage = document.createElement('span');
    stage.className = 'diary-file-stage';
    const displayStage = normalizeTrialStage(trialStage);
    stage.textContent = displayStage ? ` ${displayStage}` : '';
    const linkedDate = getLinkedNextDate(caseItem, diaryDate);
    const linkedDateStage = document.createElement('span');
    linkedDateStage.className = 'diary-file-linked-date';
    linkedDateStage.textContent = linkedDate
        ? ` - ${formatDiaryDate(linkedDate.date)}${linkedDate.trialStage ? ` ${normalizeTrialStage(linkedDate.trialStage)}` : ''}`
        : '';
    const statusGroup = document.createElement('span');
    statusGroup.className = 'diary-file-status-group';
    statusGroup.append(xStatus, discStatus, returnedStatus);
    item.append(statusGroup, firButton, stage, linkedDateStage);
    if (isSessionCase) {
        const detail = document.createElement('span');
        detail.className = 'diary-file-detail';
        detail.contentEditable = 'true';
        detail.spellcheck = false;
        detail.setAttribute('role', 'textbox');
        detail.setAttribute('aria-label', `Additional details for ${firButton.textContent} on ${formatDiaryDate(diaryDate)}`);
        const detailKey = `diary-file-detail-${caseItem.id}-${diaryDate}`;
        detail.dataset.key = detailKey;
        detail.textContent = localStorage.getItem(detailKey) || '';
        detail.addEventListener('input', () => localStorage.setItem(detailKey, detail.textContent));
        detail.addEventListener('keydown', event => {
            if (event.key === 'Enter') event.preventDefault();
        });
        item.appendChild(detail);
    }
    if (isSessionCase) {
        const assignment = sessionAssignment(caseItem);
        if (assignment.courtNumber || assignment.judgeName) {
            const judgeAssignment = document.createElement('span');
            judgeAssignment.className = 'diary-session-assignment';
            if (assignment.judgeName) {
                const judge = document.createElement('span');
                judge.className = 'diary-session-judge-name';
                judge.textContent = assignment.judgeName;
                judgeAssignment.appendChild(judge);
            }
            if (assignment.courtNumber) {
                const courtNumber = document.createElement('span');
                courtNumber.className = 'diary-session-court-number';
                courtNumber.textContent = assignment.courtNumber;
                courtNumber.setAttribute('aria-label', `Court ${assignment.courtNumber}`);
                judgeAssignment.appendChild(courtNumber);
            }
            item.prepend(judgeAssignment);
        }
    }
    const description = `${firButton.textContent}${stage.textContent}${linkedDateStage.textContent}`;
    item.title = caseItem.complainantName
        ? `${description} — ${caseItem.complainantName}`
        : description;
    return item;
}

function appendRuledLines(container, entries, minimumLines, diaryDate, isSessionCase = false, editableEmptyPrefix = '') {
    entries.forEach(entry => container.appendChild(createDiaryFileItem(entry, diaryDate, isSessionCase)));
    const lineCount = Math.max(minimumLines, entries.length);
    for (let index = entries.length; index < lineCount; index += 1) {
        const blankLine = document.createElement('div');
        blankLine.className = 'diary-file-item diary-file-item-empty';
        if (editableEmptyPrefix) {
            blankLine.classList.add('diary-lower-editable-empty');
            blankLine.contentEditable = 'true';
            blankLine.spellcheck = false;
            blankLine.setAttribute('role', 'textbox');
            blankLine.setAttribute('aria-label', `Empty Lower Court row ${index + 1}`);
            const noteKey = `${editableEmptyPrefix}${index}`;
            blankLine.dataset.key = noteKey;
            blankLine.textContent = localStorage.getItem(noteKey) || '';
            blankLine.addEventListener('input', () => localStorage.setItem(noteKey, blankLine.textContent));
            blankLine.addEventListener('keydown', event => {
                if (event.key === 'Enter') event.preventDefault();
            });
        } else {
            blankLine.setAttribute('aria-hidden', 'true');
        }
        container.appendChild(blankLine);
    }
}

function createExtraNoteRow(index, dateKey, extraNotePrefix, extraNotes) {
    const row = document.createElement('div');
    row.className = 'diary-extra-row';
    const line = document.createElement('div');
    line.className = 'diary-extra-line';
    line.contentEditable = 'true';
    line.spellcheck = false;
    line.setAttribute('aria-label', `Extra note line ${index + 1}`);
    const key = `${extraNotePrefix}${index}`;
    line.dataset.key = key;
    line.textContent = localStorage.getItem(key) || '';
    const attachmentInput = document.createElement('input');
    attachmentInput.type = 'file';
    attachmentInput.accept = 'image/*,.pdf,application/pdf';
    attachmentInput.multiple = true;
    attachmentInput.className = 'diary-extra-file-input';
    attachmentInput.setAttribute('aria-label', `Attach photos or PDFs to extra note line ${index + 1}`);
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment';
    cameraInput.className = 'diary-extra-file-input';
    cameraInput.setAttribute('aria-label', `Take a photo for extra note line ${index + 1}`);
    const attachmentButton = document.createElement('button');
    attachmentButton.type = 'button';
    attachmentButton.className = 'diary-extra-attach';
    attachmentButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.4 17.5a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg><span class="diary-extra-attach-count">0</span>';
    attachmentButton.title = 'View or attach photos';
    attachmentButton.setAttribute('aria-label', 'View or attach photos');
    attachmentButton.hidden = !line.textContent.trim();
    const photoGallery = document.createElement('div');
    photoGallery.className = 'diary-extra-photo-gallery';
    photoGallery.hidden = true;
    let attachedPhotos = [];
    const updatePhotoGallery = () => {
        photoGallery.replaceChildren();
        attachedPhotos.forEach((photo, photoIndex) => {
            const photoItem = document.createElement('div');
            photoItem.className = 'diary-extra-photo-item';
            const photoUrl = URL.createObjectURL(photo);
            const viewLink = document.createElement('a');
            viewLink.href = photoUrl;
            viewLink.target = '_blank';
            viewLink.rel = 'noopener';
            viewLink.title = `View photo ${photoIndex + 1}`;
            if (photo.type?.startsWith('image/')) {
                const thumbnail = document.createElement('img');
                thumbnail.src = photoUrl;
                thumbnail.alt = `Attached photo ${photoIndex + 1}`;
                viewLink.appendChild(thumbnail);
            } else {
                viewLink.classList.add('is-pdf');
                const pdfLabel = document.createElement('span');
                pdfLabel.className = 'diary-extra-pdf-label';
                pdfLabel.textContent = 'PDF';
                const pdfName = document.createElement('span');
                pdfName.className = 'diary-extra-pdf-name';
                pdfName.textContent = photo.name || `Document ${photoIndex + 1}`;
                viewLink.append(pdfLabel, pdfName);
            }
            const deletePhoto = document.createElement('button');
            deletePhoto.type = 'button';
            deletePhoto.className = 'diary-extra-photo-delete';
            deletePhoto.textContent = '×';
            deletePhoto.title = `Delete photo ${photoIndex + 1}`;
            deletePhoto.setAttribute('aria-label', `Delete photo ${photoIndex + 1}`);
            deletePhoto.addEventListener('click', async () => {
                attachedPhotos = attachedPhotos.filter((_, currentIndex) => currentIndex !== photoIndex);
                try {
                    if (attachedPhotos.length) {
                        await saveExtraNotePhotos(key, attachedPhotos);
                    } else {
                        const database = await openExtraNotesDb();
                        await new Promise((resolve, reject) => {
                            const transaction = database.transaction('photos', 'readwrite');
                            transaction.objectStore('photos').delete(key);
                            transaction.oncomplete = resolve;
                            transaction.onerror = () => reject(transaction.error);
                        });
                        localStorage.removeItem(`daily-extra-photos-${dateKey}-${index}`);
                        photoGallery.hidden = true;
                    }
                    attachmentButton.querySelector('.diary-extra-attach-count').textContent = String(attachedPhotos.length);
                    updatePhotoGallery();
                } catch (error) {
                    console.error('Could not delete diary note photo:', error);
                }
            });
            photoItem.append(viewLink, deletePhoto);
            photoGallery.appendChild(photoItem);
        });
        if (attachedPhotos.length) photoGallery.append(addPhotosButton, takePhotoButton);
    };
    line.addEventListener('input', () => {
        localStorage.setItem(key, line.textContent);
        attachmentButton.hidden = !line.textContent.trim();
        if (attachmentButton.hidden) photoGallery.hidden = true;
    });
    line.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const noteLines = [...extraNotes.querySelectorAll('.diary-extra-line')];
        const currentPosition = noteLines.indexOf(line);
        const existingNextLine = noteLines[currentPosition + 1];
        if (existingNextLine) {
            existingNextLine.focus();
            return;
        }
        if (!line.textContent.trim()) return;
        const nextIndex = Math.max(...noteLines
            .map(noteLine => Number(noteLine.dataset.key.slice(extraNotePrefix.length)))) + 1;
        const nextRow = createExtraNoteRow(nextIndex, dateKey, extraNotePrefix, extraNotes);
        row.after(nextRow);
        nextRow.querySelector('.diary-extra-line').focus();
    });

    const addPhotosButton = document.createElement('button');
    addPhotosButton.type = 'button';
    addPhotosButton.className = 'diary-extra-add-photos';
    addPhotosButton.textContent = 'Add files';
    addPhotosButton.addEventListener('click', () => attachmentInput.click());
    const takePhotoButton = document.createElement('button');
    takePhotoButton.type = 'button';
    takePhotoButton.className = 'diary-extra-add-photos';
    takePhotoButton.textContent = 'Take photo';
    takePhotoButton.addEventListener('click', () => cameraInput.click());
    attachmentButton.addEventListener('click', () => {
        if (!attachedPhotos.length) {
            attachmentInput.click();
            return;
        }
        photoGallery.hidden = !photoGallery.hidden;
    });
    const saveSelectedAttachments = async input => {
        const files = [...input.files].filter(file => file.type.startsWith('image/')
            || file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
        input.value = '';
        if (!files.length) return;
        try {
            attachedPhotos = [...attachedPhotos, ...files];
            await saveExtraNotePhotos(key, attachedPhotos);
            const lineIndex = key.slice(extraNotePrefix.length);
            localStorage.setItem(`daily-extra-photos-${dateKey}-${lineIndex}`, '1');
            attachmentButton.querySelector('.diary-extra-attach-count').textContent = String(attachedPhotos.length);
            attachmentButton.setAttribute('aria-label', `${attachedPhotos.length} attachments. View or add more`);
            attachmentButton.title = `${attachedPhotos.length} attachments. Click to view or add more`;
            photoGallery.hidden = false;
            updatePhotoGallery();
        } catch (error) {
            console.error('Could not save diary note photos:', error);
        }
    };
    attachmentInput.addEventListener('change', () => saveSelectedAttachments(attachmentInput));
    cameraInput.addEventListener('change', () => saveSelectedAttachments(cameraInput));
    photoGallery.appendChild(addPhotosButton);
    photoGallery.appendChild(takePhotoButton);
    getExtraNotePhotos(key).then(photos => {
        if (!photos.length) return;
        attachedPhotos = photos;
        attachmentButton.querySelector('.diary-extra-attach-count').textContent = String(photos.length);
        attachmentButton.setAttribute('aria-label', `${photos.length} attachments. View or add more`);
        attachmentButton.title = `${photos.length} attachments. Click to view or add more`;
        updatePhotoGallery();
    }).catch(error => console.error('Could not load diary note photos:', error));

    row.append(line, attachmentInput, cameraInput, attachmentButton, photoGallery);
    return row;
}

function renderNotes() {
    const grid = $('diaryTimeGrid'); grid.innerHTML = '';
    reconcileAllCaseDates();
    publishHearingDateNotifications();
    const dateKey = keyDate(currentDate);
    const matchingCases = [];
    cases.forEach(caseItem => {
        const state = getFileStatus(caseItem.id);
        const recordsForDate = state.dateRecords.filter(record => record.date === dateKey);
        const originalNextDate = caseDateKey(caseItem.nextDate);
        const hasManagedNextDate = state.dateRecords.some(record => record.kind === 'next');
        if (originalNextDate === dateKey && recordsForDate.length === 0 && !hasManagedNextDate) {
            matchingCases.push({ caseItem, trialStage: caseItem.trialStage || caseItem.status });
        }
        recordsForDate.forEach(record => {
            matchingCases.push({
                caseItem,
                trialStage: typeof record.trialStage === 'string'
                    ? record.trialStage
                    : caseItem.trialStage || caseItem.status
            });
        });
    });
    const sessionCases = [];
    const lowerCases = [];
    matchingCases.forEach(entry => {
        const { caseItem } = entry;
        const courtType = normalizeJudgeLookup(caseItem.courtType);
        const designation = designationForCase(caseItem);
        const isSessionCase = courtType.includes('session') || ['DJ', 'ASJ'].includes(designation);
        if (isSessionCase) {
            sessionCases.push(entry);
            return;
        }
        lowerCases.push(entry);
    });
    const isJjbCase = entry => {
        const courtType = normalizeJudgeLookup(entry.caseItem.courtType);
        const designation = designationForCase(entry.caseItem).toUpperCase();
        return courtType.includes('jjb') || designation.includes('JJB') || designation === 'ACJ';
    };
    lowerCases.sort((left, right) => {
        const jjbOrder = Number(isJjbCase(left)) - Number(isJjbCase(right));
        if (jjbOrder) return jjbOrder;
        return String(sessionAssignment(left.caseItem).courtNumber || '')
            .localeCompare(String(sessionAssignment(right.caseItem).courtNumber || ''), undefined,
                { numeric: true, sensitivity: 'base' });
    });

    const lowerCourtSection = document.createElement('section');
    lowerCourtSection.className = 'diary-lower-court';
    lowerCourtSection.setAttribute('aria-label', 'Lower Court files');
    const lowerCourtHeadingRow = document.createElement('div');
    lowerCourtHeadingRow.className = 'diary-lower-heading-row';
    const lowerCourtTitle = document.createElement('h2');
    lowerCourtTitle.className = 'diary-lower-title';
    lowerCourtTitle.textContent = 'Lower Court';
    lowerCourtHeadingRow.append(lowerCourtTitle);
    lowerCourtSection.appendChild(lowerCourtHeadingRow);

    const lowerNotePrefix = `diary-lower-note-${dateKey}-register-`;
    const oldLowerNotePrefix = `diary-lower-note-${dateKey}-`;
    const oldLowerNoteKeys = Object.keys(localStorage)
        .filter(key => key.startsWith(oldLowerNotePrefix) && !key.startsWith(lowerNotePrefix));
    let nextLowerNoteIndex = lowerCases.length;
    oldLowerNoteKeys.forEach(oldKey => {
        const note = localStorage.getItem(oldKey) || '';
        if (note.trim()) {
            while (localStorage.getItem(`${lowerNotePrefix}${nextLowerNoteIndex}`) !== null) nextLowerNoteIndex += 1;
            localStorage.setItem(`${lowerNotePrefix}${nextLowerNoteIndex}`, note);
            nextLowerNoteIndex += 1;
        }
        localStorage.removeItem(oldKey);
    });
    const lowerNoteCount = Math.max(0, ...Object.keys(localStorage)
        .filter(key => key.startsWith(lowerNotePrefix) && localStorage.getItem(key)?.trim())
        .map(key => Number(key.slice(lowerNotePrefix.length)) + 1)
        .filter(Number.isFinite));
    appendRuledLines(lowerCourtSection, lowerCases, Math.max(3, lowerCases.length, lowerNoteCount), dateKey, true, lowerNotePrefix);

    const sessionSection = document.createElement('section');
    sessionSection.className = 'diary-session-register';
    sessionSection.setAttribute('aria-label', 'Session Court files');
    const sessionTitle = document.createElement('h2');
    sessionTitle.className = 'diary-session-title';
    sessionTitle.textContent = 'Session Court';
    sessionSection.appendChild(sessionTitle);
    appendRuledLines(sessionSection, sessionCases, 3, dateKey, true);

    if (casesLoadError || !casesLoaded || matchingCases.length === 0) {
        const caseMessage = document.createElement('p');
        caseMessage.className = 'diary-case-message';
        caseMessage.textContent = casesLoadError
            ? 'Could not load cases. Check your connection and refresh the page to try again.'
            : !casesLoaded ? 'Loading cases…' : 'No cases scheduled for this date.';
        lowerCourtSection.appendChild(caseMessage);
    }

    grid.appendChild(lowerCourtSection);
    grid.appendChild(sessionSection);
    [lowerCourtSection, sessionSection].forEach(section => {
        const assignments = [...section.querySelectorAll('.diary-session-assignment')];
        const assignmentWidth = Math.max(0, ...assignments.map(assignment => assignment.getBoundingClientRect().width));
        assignments.forEach(assignment => {
            assignment.style.width = `${assignmentWidth}px`;
            assignment.style.flexBasis = `${assignmentWidth}px`;
        });
    });

    const extraNotes = document.createElement('section');
    extraNotes.className = 'diary-extra-notes';
    const extraTitle = document.createElement('h2');
    extraTitle.className = 'diary-extra-title';
    extraTitle.textContent = 'Extra Notes';
    extraNotes.appendChild(extraTitle);

    const extraNotePrefix = `daily-extra-${dateKey}-`;
    const savedNoteIndexes = Object.keys(localStorage)
        .filter(key => key.startsWith(extraNotePrefix) && localStorage.getItem(key)?.trim())
        .map(key => Number(key.slice(extraNotePrefix.length)))
        .filter(Number.isInteger);
    const savedPhotoIndexes = Object.keys(localStorage)
        .filter(key => key.startsWith(`daily-extra-photos-${dateKey}-`))
        .map(key => Number(key.slice(`daily-extra-photos-${dateKey}-`.length)))
        .filter(Number.isInteger);
    const noteLineCount = Math.max(3, ...[...savedNoteIndexes, ...savedPhotoIndexes].map(index => index + 1));

    for (let index = 0; index < noteLineCount; index++) {
        extraNotes.appendChild(createExtraNoteRow(index, dateKey, extraNotePrefix, extraNotes));
    }

    grid.appendChild(extraNotes);
}

function clearNotes() {
    if (!confirm('Clear all notes for ' + currentDate.toLocaleDateString('en-US',{dateStyle:'long'}) + '?')) return;
    const dk = keyDate(currentDate);
    const extraNotePrefix = `daily-extra-${dk}-`;
    Object.keys(localStorage).filter(key => key.startsWith(extraNotePrefix)).forEach(key => localStorage.removeItem(key));
    const photoMarkerPrefix = `daily-extra-photos-${dk}-`;
    Object.keys(localStorage).filter(key => key.startsWith(photoMarkerPrefix)).forEach(key => localStorage.removeItem(key));
    clearExtraNotePhotos(extraNotePrefix).catch(error => console.error('Could not clear diary note photos:', error));
    renderNotes();
}

async function loadCases() {
    try {
        cases = (await loadCaseRecords(db)).filter(isCourtProceeding);
        casesLoadError = null;
    } catch (error) {
        console.error('Failed to load register diary cases from Firestore:', error);
        casesLoadError = error;
    } finally {
        casesLoaded = true;
    }
    try {
        const judgeSnapshot = await getDocs(collection(db, 'judges'));
        judgeAssignments = judgeSnapshot.docs.map(judgeDocument => ({
            id: judgeDocument.id,
            ...judgeDocument.data()
        }));
    } catch (error) {
        console.error('Failed to load judge nicknames for register diary:', error);
    }
    reconcileAllCaseDates();
    renderNotes();
    focusRequestedDiaryCase();
}

// Expose for inline onclick
window.clearDiaryNotes = clearNotes;

$('diaryDialogClose')?.addEventListener('click', () => $('diaryDateDialog').close());
$('diaryDateCancelEdit')?.addEventListener('click', resetDateEditor);
$('diaryDateDialog')?.addEventListener('click', event => {
    if (event.target === $('diaryDateDialog')) $('diaryDateDialog').close();
});
document.querySelectorAll('.diary-date-form').forEach(form => {
    form.addEventListener('submit', submitDiaryDate);
});

// Navigation arrows
$('diaryPrevDay')?.addEventListener('click', () => shiftDay(-1));
$('diaryNextDay')?.addEventListener('click', () => shiftDay(1));
$('diaryDateNum')?.addEventListener('click', goToToday);
$('diaryMonth')?.addEventListener('click', () => {
    const picker = $('diaryMonthPicker');
    if (picker.classList.contains('is-open')) closeMonthPicker();
    else openMonthPicker();
});
$('diaryMonthPicker')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-month]');
    if (button) selectMonth(Number(button.dataset.month));
});
$('diaryYearBox')?.addEventListener('click', () => {
    const picker = $('diaryYearPicker');
    if (picker.classList.contains('is-open')) closeYearPicker();
    else openYearPicker();
});
$('diaryYearPicker')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-year]');
    if (button) selectYear(Number(button.dataset.year));
});
$('diaryMonthPicker')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeMonthPicker();
        $('diaryMonth').focus();
    }
});
$('diaryYearPicker')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeYearPicker();
        $('diaryYearBox').focus();
    }
});

const monthPicker = $('diaryMonthPicker');
for (let month = 0; month < 12; month++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.month = String(month);
    button.textContent = new Date(2024, month, 1).toLocaleString('en-US', {month:'short'});
    button.setAttribute('aria-pressed', String(month === currentDate.getMonth()));
    monthPicker.appendChild(button);
}

const yearPicker = $('diaryYearPicker');
const currentYear = new Date().getFullYear();
for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.year = String(year);
    button.textContent = String(year);
    button.setAttribute('aria-pressed', String(year === currentDate.getFullYear()));
    yearPicker.appendChild(button);
}

document.addEventListener('click', event => {
    if (!event.target.closest('.diary-date-info')) closeMonthPicker();
    if (!event.target.closest('.diary-year-control')) closeYearPicker();
});

// Touch / swipe
const diaryPage = document.getElementById('diaryPage');
if (diaryPage) {
    diaryPage.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, {passive: true});
    diaryPage.addEventListener('touchend', e => {
        if (!touchStartX) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) shiftDay(dx < 0 ? 1 : -1);
        touchStartX = touchStartY = 0;
    }, {passive: true});
}

// Initial render
render();
loadCases();
scheduleDailyRollover();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        reconcileAllCaseDates();
        renderNotes();
    }
});
window.addEventListener('caseAdded', loadCases);
