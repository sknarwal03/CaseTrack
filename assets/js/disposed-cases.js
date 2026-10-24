import { db } from '@config/firebase-config.js';
import { loadCaseRecords } from './fir-case-model.js';
import { normalizeTrialStage } from './trial-stages.js';
import { openCaseDetailsModal } from './cases.js';

const monthInput = document.getElementById('disposedMonth');
const monthPickerButton = document.getElementById('openDisposedMonthPicker');
const monthPicker = document.getElementById('disposedMonthPicker');
const tableBody = document.getElementById('disposedCasesBody');
const countLabel = document.getElementById('disposedCount');
const printButton = document.getElementById('printDisposedRegister');
const yearLabel = document.getElementById('disposedYear');
const yearPicker = document.getElementById('disposedYearPicker');
const selectedMonthCount = document.getElementById('selectedMonthCount');
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
    if (selectedMonthCount) selectedMonthCount.textContent = countLabel.textContent;
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
    trigger?.setAttribute('aria-expanded', 'false');
}

function openPicker(picker, trigger) {
    const shouldOpen = !picker?.classList.contains('is-open');
    closePicker(monthPicker, monthPickerButton);
    closePicker(yearPicker, yearLabel);
    if (!shouldOpen || !picker) return;
    picker.classList.add('is-open');
    picker.setAttribute('aria-hidden', 'false');
    trigger?.setAttribute('aria-expanded', 'true');
}

function syncRegisterMonthYear() {
    const [year, month] = monthInput.value.split('-').map(Number);
    if (yearLabel && year) yearLabel.textContent = String(year);
    if (monthPickerButton && year && month) {
        monthPickerButton.textContent = new Date(year, month - 1, 1)
            .toLocaleDateString('en-IN', { month: 'long' });
        monthPickerButton.setAttribute('aria-label', `Select month, currently ${monthPickerButton.textContent} ${year}`);
    }
    monthPicker?.querySelectorAll('button[data-month]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.month) === month));
    });
    yearPicker?.querySelectorAll('button[data-year]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.year) === year));
    });
}

monthPickerButton?.addEventListener('click', () => openPicker(monthPicker, monthPickerButton));
yearLabel?.addEventListener('click', () => openPicker(yearPicker, yearLabel));

monthPicker?.addEventListener('click', event => {
    const button = event.target.closest('button[data-month]');
    if (!button) return;
    const [year] = monthInput.value.split('-').map(Number);
    monthInput.value = `${year}-${String(Number(button.dataset.month) + 1).padStart(2, '0')}`;
    syncRegisterMonthYear();
    closePicker(monthPicker, monthPickerButton);
    render(disposedCases);
});

yearPicker?.addEventListener('click', event => {
    const button = event.target.closest('button[data-year]');
    if (!button) return;
    const [, month] = monthInput.value.split('-');
    monthInput.value = `${button.dataset.year}-${month}`;
    syncRegisterMonthYear();
    closePicker(yearPicker, yearLabel);
    render(disposedCases);
});

document.addEventListener('click', event => {
    if (!event.target.closest('.month-picker')) closePicker(monthPicker, monthPickerButton);
    if (!event.target.closest('.register-year-control')) closePicker(yearPicker, yearLabel);
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (monthPicker?.classList.contains('is-open')) {
        closePicker(monthPicker, monthPickerButton);
        monthPickerButton?.focus();
    }
    if (yearPicker?.classList.contains('is-open')) {
        closePicker(yearPicker, yearLabel);
        yearLabel?.focus();
    }
});

async function init() {
    monthInput.value = localDateKey(new Date());
    for (let month = 0; month < 12; month += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.month = String(month);
        button.textContent = new Date(2024, month, 1).toLocaleString('en-US', { month: 'short' });
        button.setAttribute('aria-pressed', 'false');
        monthPicker.append(button);
    }
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.year = String(year);
        button.textContent = String(year);
        button.setAttribute('aria-pressed', 'false');
        yearPicker.append(button);
    }
    syncRegisterMonthYear();
    try {
        disposedCases = disposedRecords(await loadCaseRecords(db));
        render(disposedCases);
    } catch (error) {
        console.error('Could not load disposed cases:', error);
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Disposed cases load nahi ho sake. Access check karke page reload karein.</td></tr>';
        countLabel.textContent = 'Could not load';
        if (selectedMonthCount) selectedMonthCount.textContent = 'Could not load';
    }
}

printButton?.addEventListener('click', () => window.print());

init();
