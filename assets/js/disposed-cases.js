import { db } from '@config/firebase-config.js';
import { loadCaseRecords } from './fir-case-model.js';
import { normalizeTrialStage } from './trial-stages.js';
import { openCaseDetailsModal } from './cases.js';

const monthInput = document.getElementById('disposedMonth');
const monthPickerButton = document.getElementById('disposedMonthTrigger');
const yearPickerButton = document.getElementById('disposedYearTrigger');
const monthPicker = document.getElementById('disposedMonthPicker');
const tableBody = document.getElementById('disposedCasesBody');
const countLabel = document.getElementById('selectedMonthCount');
const printButton = document.getElementById('printDisposedRegister');
let disposedCases = [];
const localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dateToParts = value => {
    if (!value) return null;
    const text = String(value).trim();
    let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    let day, month, year;
    if (match) [, day, month, year] = match;
    else {
        match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
        if (!match) return null;
        [, year, month, day] = match;
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
    return { date, key: `${year}-${String(month).padStart(2, '0')}`, timestamp: date.getTime() };
};

function disposedRecords(records) {
    const local = (() => {
        try { return JSON.parse(localStorage.getItem('register-diary-file-statuses') || '{}'); }
        catch { return {}; }
    })();
    return records.flatMap(caseItem => {
        const firestoreHearings = Array.isArray(caseItem.hearingDateRecord) ? caseItem.hearingDateRecord : [];
        const hearings = firestoreHearings.length ? firestoreHearings : local?.[caseItem.id]?.dateRecords || [];
        return hearings.filter(hearing => normalizeTrialStage(hearing?.trialStage).toLowerCase() === 'disposed')
            .map(hearing => ({ caseItem, hearing, parsed: dateToParts(hearing.date) }))
            .filter(item => item.parsed);
    });
}

function judgeNameAndDesignation(caseItem = {}) {
    const courtName = String(caseItem.courtName || '').trim();
    const parts = courtName.split(/\s+(?:--|[—–-])\s+/);
    const knownDesignation = /\b(ACJM|ACJ|ASJ|CJM|DJ|JMIC|JMFC)\b/i;
    const designation = String(caseItem.judgeCourtType || caseItem.judicialDesignation || caseItem.designation || caseItem.courtType ||
        (parts[0].match(knownDesignation) || [])[1] || '').trim();
    const name = String(caseItem.judgeName || caseItem.judicialName || (parts.length > 1 ? parts[parts.length - 1] : '')).trim();
    return [name, designation].filter(Boolean).join(' ');
}

function proceedingDuration(startValue, endValue) {
    const start = dateToParts(startValue)?.date;
    const end = dateToParts(endValue)?.date;
    if (!start || !end || end < start) return '';
    const days = Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
    return `${days.toLocaleString('en-IN')} days`;
}

function render(records) {
    const matches = records.filter(item => item.parsed.key === monthInput.value)
        .sort((a, b) => a.parsed.timestamp - b.parsed.timestamp);
    tableBody.replaceChildren();
    countLabel.textContent = `${matches.length} ${matches.length === 1 ? 'case' : 'cases'}`;
    if (!matches.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.className = 'empty-state';
        cell.textContent = 'Is month mein koi disposed case nahi mila.';
        row.append(cell);
        tableBody.append(row);
        return;
    }
    matches.forEach(({ caseItem, hearing }, index) => {
        const row = document.createElement('tr');
        [String(index + 1), caseItem.fileNo || '', judgeNameAndDesignation(caseItem)].forEach((value, cellIndex) => {
            const cell = document.createElement('td');
            if (cellIndex === 1) {
                const firButton = document.createElement('button');
                firButton.type = 'button';
                firButton.className = 'disposed-fir-link';
                firButton.textContent = String(value || caseItem.firNo || 'Open FIR');
                firButton.setAttribute('aria-label', `View FIR ${firButton.textContent}`);
                firButton.addEventListener('click', () => openCaseDetailsModal(caseItem));
                cell.append(firButton);
            } else {
                cell.textContent = String(value);
            }
            if (value) cell.title = String(value);
            row.append(cell);
        });
        const pcCell = document.createElement('td');
        pcCell.textContent = String(caseItem.regDate || caseItem.registrationDate || '');
        if (pcCell.textContent) pcCell.title = pcCell.textContent;
        row.append(pcCell);
        [proceedingDuration(caseItem.regDate || caseItem.registrationDate, hearing.date),
            caseItem.chargeDate || caseItem.chargedate || '', hearing.date || '', caseItem.judgement || caseItem.judgment || '',
            caseItem.reasonOfAcquittal || caseItem.acquittalReason || ''].forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = String(value);
            if (value) cell.title = String(value);
            row.append(cell);
        });
        tableBody.append(row);
    });
}

function closePicker(picker, trigger) {
    picker?.classList.remove('is-open');
    picker?.classList.remove('is-detached');
    if (picker) {
        picker.style.top = '';
        picker.style.left = '';
    }
    picker?.setAttribute('aria-hidden', 'true');
    monthPickerButton?.setAttribute('aria-expanded', 'false');
    yearPickerButton?.setAttribute('aria-expanded', 'false');
}

function openPicker(picker, trigger, mode) {
    const alreadyOpen = picker?.classList.contains('is-open');
    const sameMode = picker?.classList.contains(mode === 'month' ? 'is-month-mode' : 'is-year-mode');
    const shouldOpen = !alreadyOpen || !sameMode;
    closePicker(monthPicker, monthPickerButton);
    yearPickerButton?.setAttribute('aria-expanded', 'false');
    if (!shouldOpen || !picker) return;
    picker.classList.toggle('is-month-mode', mode === 'month');
    picker.classList.toggle('is-year-mode', mode === 'year');
    picker.classList.add('is-open');
    picker.setAttribute('aria-hidden', 'false');
    const anchorRect = picker.parentElement.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    picker.style.left = `${triggerRect.left - anchorRect.left}px`;
    picker.style.top = `${triggerRect.bottom - anchorRect.top + 8}px`;
    trigger?.setAttribute('aria-expanded', 'true');
}

function syncRegisterMonthYear() {
    const [year, month] = monthInput.value.split('-').map(Number);
    if (monthPickerButton && year && month) monthPickerButton.textContent = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long' });
    if (yearPickerButton && year) yearPickerButton.textContent = String(year);
    monthPicker?.querySelectorAll('button[data-month]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.month) === month));
    });
    monthPicker?.querySelectorAll('button[data-year]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.year) === year)));
}

function populateYearOptions(centerYear) {
    const yearOptions = monthPicker?.querySelector('.disposed-year-options');
    if (!yearOptions) return;
    yearOptions.replaceChildren();
    for (let year = centerYear - 5; year <= centerYear + 5; year += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.year = String(year);
        button.textContent = String(year);
        button.setAttribute('aria-pressed', String(year === centerYear));
        yearOptions.append(button);
    }
}

monthPickerButton?.addEventListener('click', () => openPicker(monthPicker, monthPickerButton, 'month'));
yearPickerButton?.addEventListener('click', () => openPicker(monthPicker, yearPickerButton, 'year'));

function resetToCurrentPeriod() {
    monthInput.value = localDateKey(new Date());
    syncRegisterMonthYear();
    populateYearOptions(Number(monthInput.value.split('-')[0]));
    closePicker(monthPicker, monthPickerButton);
    render(disposedCases);
}

document.querySelector('.table-panel-heading')?.addEventListener('dblclick', resetToCurrentPeriod);

monthPicker?.addEventListener('click', event => {
    const button = event.target.closest('.disposed-month-options button[data-month]');
    if (!button) return;
    const [year] = monthInput.value.split('-').map(Number);
    monthInput.value = `${year}-${String(Number(button.dataset.month) + 1).padStart(2, '0')}`;
    syncRegisterMonthYear();
    closePicker(monthPicker, monthPickerButton);
    render(disposedCases);
});

monthPicker?.addEventListener('click', event => {
    const button = event.target.closest('.disposed-year-options button[data-year]');
    if (!button) return;
    const [, month] = monthInput.value.split('-');
    monthInput.value = `${button.dataset.year}-${month}`;
    syncRegisterMonthYear();
    populateYearOptions(Number(button.dataset.year));
    closePicker(monthPicker, yearPickerButton);
    render(disposedCases);
});

document.addEventListener('pointerdown', event => {
    const target = event.target;
    if (monthPicker?.contains(target) || monthPickerButton?.contains(target) || yearPickerButton?.contains(target)) return;
    closePicker(monthPicker, monthPickerButton);
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (monthPicker?.classList.contains('is-open')) {
        const activeTrigger = yearPickerButton?.getAttribute('aria-expanded') === 'true' ? yearPickerButton : monthPickerButton;
        closePicker(monthPicker, monthPickerButton);
        activeTrigger?.focus();
    }
});

async function init() {
    monthInput.value = localDateKey(new Date());
    const monthOptions = document.createElement('div');
    monthOptions.className = 'disposed-month-options';
    const yearOptions = document.createElement('div');
    yearOptions.className = 'disposed-year-options';
    for (let month = 0; month < 12; month += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.month = String(month);
        button.textContent = new Date(2024, month, 1).toLocaleString('en-US', { month: 'short' });
        button.setAttribute('aria-pressed', 'false');
        monthOptions.append(button);
    }
    monthPicker.append(monthOptions, yearOptions);
    syncRegisterMonthYear();
    populateYearOptions(Number(monthInput.value.split('-')[0]));
    try {
        disposedCases = disposedRecords(await loadCaseRecords(db));
        render(disposedCases);
    } catch (error) {
        console.error('Could not load disposed cases:', error);
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Disposed cases load nahi ho sake. Access check karke page reload karein.</td></tr>';
        countLabel.textContent = 'Could not load';
    }
}

printButton?.addEventListener('click', () => window.print());

init();
