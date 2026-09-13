const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';
const modal = document.querySelector('#caseModal');
const detailsModal = document.querySelector('#caseDetailsModal');
const form = document.querySelector('#caseForm');
const openCaseButtons = [
    document.querySelector('#openCaseModal'),
    document.querySelector('#addCaseButton')
].filter(Boolean);
const closeModalButton = document.querySelector('#closeModal');
const cancelModalButton = document.querySelector('#cancelModal');
const closeDetailModalButton = document.querySelector('[data-close-detail-modal]');
let editCaseIndex = null;

const getCases = () => {
    try {
        const saved = JSON.parse(localStorage.getItem('caseFiles') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
};

const getRegistrationDateValue = caseItem => caseItem?.registrationDate || caseItem?.putInCourtDate || '';

const getPcCaseRange = range => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const ranges = {
        thisMonth: {
            label: 'This Month',
            start: new Date(currentYear, currentMonth, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        lastMonth: {
            label: 'Last Month',
            start: new Date(currentYear, currentMonth - 1, 1),
            end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
        },
        last6Months: {
            label: 'Last 6 Months',
            start: new Date(currentYear, currentMonth - 5, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        thisYear: {
            label: 'This Year',
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 31, 23, 59, 59, 999)
        }
    };

    return ranges[range] || ranges.thisMonth;
};

const isWithinRange = (dateValue, range) => {
    if (!dateValue || !range || range === 'all') return true;
    const date = new Date(dateValue + 'T00:00:00');
    const bounds = getPcCaseRange(range);
    return date >= bounds.start && date <= bounds.end;
};

const getCaseStatusBucket = status => {
    const s = String(status || '').trim();
    if (s === 'Disposed') return 'closed';
    if (s === 'Cancellation') return 'warning';
    if (['UI', 'UT', 'Untrace'].includes(s)) return 'pending';
    return 'active';
};

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    if (themeToggle) {
        themeToggle.textContent = isLight ? '☾' : '☼';
        themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }
};

const syncFirYearFromDate = () => {
    if (!form) return;
    const firDateField = form.elements.namedItem('firDate');
    const firYearField = form.elements.namedItem('firYear');
    if (!firDateField || !firYearField) return;

    const setYearFromDate = () => {
        const dateValue = String(firDateField.value || '').trim();
        if (!dateValue) {
            firYearField.value = '';
            return;
        }
        const year = new Date(dateValue + 'T00:00:00').getFullYear();
        firYearField.value = Number.isFinite(year) ? String(year) : '';
    };

    firDateField.addEventListener('change', setYearFromDate);
    setYearFromDate();
};

const getWitnessEntries = value => String(value || '')
    .split(/\r?\n/)
    .map(line => String(line || '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

const syncWitnessCounter = () => {
    if (!form) return;
    const witnessNamesField = form.elements.namedItem('witnessNames');
    const totalWitnessField = form.elements.namedItem('totalWitness');
    if (!witnessNamesField || !totalWitnessField) return;

    totalWitnessField.value = String(getWitnessEntries(witnessNamesField.value).length);
    totalWitnessField.dispatchEvent(new Event('input', { bubbles: true }));
};

const syncListCounter = (fieldName, defaultValue = '1. ') => {
    if (!form) return;
    const field = form.elements.namedItem(fieldName);
    const badge = document.querySelector(`[data-counter-for="${fieldName}"]`);
    if (!field || !badge) return;

    const update = () => {
        const count = getWitnessEntries(field.value).length;
        badge.textContent = String(count);
    };

    field.addEventListener('focus', () => {
        if (!String(field.value || '').trim()) {
            field.value = defaultValue;
        }
        update();
    });

    field.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const currentValue = String(field.value || '');
            const nextNumber = getWitnessEntries(currentValue).length + 1;
            const nextValue = `${currentValue}${currentValue && !currentValue.endsWith('\n') ? '\n' : ''}${nextNumber}. `;
            field.value = nextValue;
            const end = field.value.length;
            field.setSelectionRange?.(end, end);
            update();
            if (fieldName === 'witnessNames') {
                syncWitnessCounter();
                syncWitnessBalance();
            }
            return;
        }

        if ((event.key === 'Backspace' || event.key === 'Delete') && String(field.value || '') === defaultValue) {
            field.value = '';
            update();
            if (fieldName === 'witnessNames') {
                syncWitnessCounter();
                syncWitnessBalance();
            }
        }
    });

    field.addEventListener('input', () => {
        update();
        if (fieldName === 'witnessNames') {
            syncWitnessCounter();
            syncWitnessBalance();
        }
    });

    update();
};

const syncWitnessBalance = () => {
    if (!form) return;
    const totalWitnessField = form.elements.namedItem('totalWitness');
    const witnessExaminedField = form.elements.namedItem('witnessExamined');
    const witnessLeftField = form.elements.namedItem('witnessLeft');
    if (!totalWitnessField || !witnessExaminedField || !witnessLeftField) return;

    const totalWitness = Number.parseInt(String(totalWitnessField.value || '').trim(), 10);
    const witnessExamined = Number.parseInt(String(witnessExaminedField.value || '').trim(), 10);
    const safeTotal = Number.isFinite(totalWitness) ? totalWitness : 0;
    const safeExamined = Number.isFinite(witnessExamined) ? witnessExamined : 0;
    witnessLeftField.value = String(Math.max(safeTotal - safeExamined, 0));
};

const openModal = (caseItem = null, index = null) => {
    if (!modal || !form) return;
    editCaseIndex = index;
    form.reset();
    const title = document.querySelector('#modalTitle');
    if (title) {
        title.textContent = index === null ? 'Add New Case' : 'Edit Case';
    }

    if (caseItem) {
        Object.entries(caseItem).forEach(([key, value]) => {
            const field = form.elements.namedItem(key);
            if (field) {
                field.value = value || '';
            }
        });
    }

    const firDateField = form.elements.namedItem('firDate');
    const firYearField = form.elements.namedItem('firYear');
    if (firDateField && firYearField) {
        const dateValue = String(firDateField.value || '').trim();
        firYearField.value = dateValue ? String(new Date(dateValue + 'T00:00:00').getFullYear()) : '';
    }

    syncWitnessCounter();
    syncWitnessBalance();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    if (!modal || !form) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    form.reset();
    editCaseIndex = null;
};

if (form) {
    syncListCounter('witnessNames');
    syncListCounter('accused');

    const totalWitnessField = form.elements.namedItem('totalWitness');
    const witnessExaminedField = form.elements.namedItem('witnessExamined');
    totalWitnessField?.addEventListener('input', syncWitnessBalance);
    witnessExaminedField?.addEventListener('input', syncWitnessBalance);

    form.addEventListener('reset', () => {
        setTimeout(() => {
            const accusedField = form.elements.namedItem('accused');
            if (accusedField && !String(accusedField.value || '').trim()) {
                accusedField.value = '1. ';
                accusedField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const witnessNamesField = form.elements.namedItem('witnessNames');
            if (witnessNamesField && !String(witnessNamesField.value || '').trim()) {
                witnessNamesField.value = '1. ';
                witnessNamesField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            syncWitnessBalance();
        }, 0);
    });
}

const closeDetailModal = () => {
    if (!detailsModal) return;
    detailsModal.classList.remove('show');
    detailsModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
};

const openDetailModal = caseItem => {
    if (!detailsModal) return;

    const firLabel = document.querySelector('#detailFIRLabel');
    const badge = document.querySelector('#detailStatusBadge');
    const detailFields = document.querySelector('#caseDetailFields');
    if (!firLabel || !badge || !detailFields) return;

    const dates = [
        ['Date of FIR', caseItem.firDate],
        ['Registration Date', getRegistrationDateValue(caseItem)],
        ['Date of Charge', caseItem.dateOfCharge],
        ['Date of Decision', caseItem.dateOfDecision],
        ['Chargesheet Date', caseItem.chargesheetDate],
        ['Incident Date', caseItem.incidentDate]
    ].filter(([, value]) => value);

    const timelineValue = [
        caseItem.nextDate ? new Date(caseItem.nextDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        caseItem.caseStage || ''
    ].filter(Boolean).join(' - ');

    const generalFields = [
        ['Under Section', caseItem.underSection],
        ['Police Station', caseItem.policeStation],
        ['Court Type', caseItem.courtType],
        ['In the court of', caseItem.courtNumber],
        ['Investigating Officer', caseItem.nameOfIO],
        ['IO Rank', caseItem.ioRank],
        ['Complainant Name', caseItem.complainantName],
        ['Contact Number', caseItem.complainantContact],
        ['Incident Place', caseItem.incidentPlace],
        ['Accused', caseItem.accused],
        ['Witnesses', caseItem.witnessNames || (caseItem.totalWitness ? `${caseItem.totalWitness} total` : '')],
        ['Complainant Address', caseItem.complainantAddress]
    ].filter(([, value]) => value && value !== 'null');

    firLabel.textContent = `${caseItem.firNo || '—'}/${caseItem.firYear || '—'}`;
    badge.textContent = caseItem.caseStatus || '—';
    badge.style.color = caseItem.caseStatus === 'Disposed' ? '#69f2c3' : caseItem.caseStatus === 'Cancellation' ? '#ff9ca9' : '#c8a8ff';
    badge.style.borderColor = caseItem.caseStatus === 'Disposed' ? 'rgba(25, 212, 155, 0.35)' : caseItem.caseStatus === 'Cancellation' ? 'rgba(255, 88, 109, 0.3)' : 'rgba(143, 94, 255, 0.3)';
    badge.style.background = caseItem.caseStatus === 'Disposed' ? 'rgba(25, 212, 155, 0.12)' : caseItem.caseStatus === 'Cancellation' ? 'rgba(255, 88, 109, 0.12)' : 'rgba(143, 94, 255, 0.14)';

    const allFields = [...dates, ...generalFields];
    if (timelineValue) {
        allFields.unshift(['Next Hearing & Stage', timelineValue]);
    }

    detailFields.innerHTML = allFields.length
        ? allFields.map(([label, value]) => `
            <div class="detail-item">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `).join('')
        : '<div class="detail-item"><span>No data</span><strong>No details available for this case.</strong></div>';

    detailsModal.classList.add('show');
    detailsModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

const filterByStatus = (filter, rows) => {
    rows.forEach(row => {
        const matches = filter === 'all' || row.dataset.status === filter;
        row.style.display = matches ? '' : 'none';
    });
};

let currentSort = {
    key: 'firNo',
    direction: 'asc'
};

const normalizeFirNumber = value => {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    if (!digits) return 0;
    const numeric = Number(digits);
    if (!Number.isFinite(numeric)) return 0;
    return numeric;
};

const getSortValue = (caseItem, key) => {
    switch (key) {
        case 'firNo':
            return normalizeFirNumber(caseItem.firNo);
        case 'firDate':
            return caseItem.firDate ? new Date(caseItem.firDate + 'T00:00:00').getTime() : 0;
        case 'underSection':
            return String(caseItem.underSection || '').toLowerCase();
        case 'courtNumber':
            return String(caseItem.courtNumber || caseItem.courtType || '').toLowerCase();
        case 'nextDate':
            return caseItem.nextDate ? new Date(caseItem.nextDate + 'T00:00:00').getTime() : 0;
        case 'caseStage':
            return String(caseItem.caseStage || '').toLowerCase();
        default:
            return '';
    }
};

const sortCases = (cases, key, direction) => {
    const sorted = [...cases];
    sorted.sort((a, b) => {
        const left = getSortValue(a, key);
        const right = getSortValue(b, key);

        if (typeof left === 'string' && typeof right === 'string') {
            const result = left.localeCompare(right);
            return direction === 'asc' ? result : -result;
        }

        const result = left > right ? 1 : left < right ? -1 : 0;
        return direction === 'asc' ? result : -result;
    });

    return sorted;
};

const updateSortIndicators = () => {
    document.querySelectorAll('.cases-table .sortable').forEach(header => {
        const key = header.dataset.sort;
        const isActive = key === currentSort.key;
        const symbol = !isActive ? '' : currentSort.direction === 'asc' ? ' ↑' : ' ↓';
        header.dataset.direction = isActive ? currentSort.direction : 'none';
        header.textContent = header.textContent.replace(/\s[↑↓]$/, '');
        header.textContent += symbol;
    });
};

const renderCaseTable = () => {
    const tbody = document.querySelector('#casesTableBody');
    if (!tbody) return;

    const params = new URLSearchParams(window.location.search);
    const range = params.get('range') || 'all';
    let cases = getCases().filter(caseItem => isWithinRange(getRegistrationDateValue(caseItem), range));
    cases = sortCases(cases, currentSort.key, currentSort.direction);

    tbody.innerHTML = cases.length ? cases.map((caseItem, index) => {
        const statusBucket = getCaseStatusBucket(caseItem.caseStatus);
        const caseId = `${caseItem.firNo || '—'}/${caseItem.firYear || '—'}`;
        const firDate = caseItem.firDate ? new Date(caseItem.firDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const nextDate = caseItem.nextDate ? new Date(caseItem.nextDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        return `
            <tr class="case-row-data" data-status="${statusBucket}" data-index="${index}">
                <td>
                    <span class="case-id">${caseId}</span>
                </td>
                <td>${firDate}</td>
                <td>${caseItem.underSection || '—'}</td>
                <td>${caseItem.courtNumber || caseItem.courtType || '—'}</td>
                <td>${nextDate}</td>
                <td>${caseItem.caseStage || '—'}</td>
                <td class="case-actions">
                    <button class="icon-btn" type="button" aria-label="View case">↗</button>
                    <button class="icon-btn edit-case-btn" type="button" data-index="${index}" aria-label="Edit case">✎</button>
                </td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="7" class="table-empty">No cases found for the selected range.</td></tr>';

    const rows = tbody.querySelectorAll('.case-row-data');
    rows.forEach(row => {
        row.addEventListener('click', event => {
            if (event.target.closest('.icon-btn')) return;
            const index = Number(row.dataset.index);
            const selected = getCases()[index];
            if (selected) openDetailModal(selected);
        });
    });

    document.querySelectorAll('.edit-case-btn').forEach(button => {
        button.addEventListener('click', () => {
            const index = Number(button.dataset.index);
            const selected = getCases()[index];
            if (selected) openModal(selected, index);
        });
    });

    document.querySelectorAll('.icon-btn:not(.edit-case-btn)').forEach(button => {
        button.addEventListener('click', () => {
            const row = button.closest('.case-row-data');
            const index = Number(row?.dataset.index);
            const selected = getCases()[index];
            if (selected) openDetailModal(selected);
        });
    });

    const activeFilter = document.querySelector('.case-filter.active');
    filterByStatus(activeFilter ? activeFilter.dataset.filter : 'all', rows);
};

applyTheme(savedTheme);
syncFirYearFromDate();

themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});

openCaseButtons.forEach(button => {
    button.addEventListener('click', () => openModal());
});

closeModalButton?.addEventListener('click', closeModal);
cancelModalButton?.addEventListener('click', closeModal);
closeDetailModalButton?.addEventListener('click', closeDetailModal);

if (modal) {
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
}

if (detailsModal) {
    detailsModal.addEventListener('click', e => {
        if (e.target === detailsModal) closeDetailModal();
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (modal && modal.classList.contains('show')) closeModal();
        else if (detailsModal && detailsModal.classList.contains('show')) closeDetailModal();
    }
});

form?.addEventListener('submit', e => {
    e.preventDefault();
    const item = Object.fromEntries(new FormData(form));
    const cases = getCases();

    if (editCaseIndex === null) {
        cases.push(item);
    } else {
        cases[editCaseIndex] = item;
    }

    localStorage.setItem('caseFiles', JSON.stringify(cases));
    closeModal();
    renderCaseTable();
});

document.querySelector('#caseSearch')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const rows = document.querySelectorAll('.case-row-data');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = !q || text.includes(q) ? '' : 'none';
    });
});

document.querySelectorAll('.case-filter').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.case-filter').forEach(btn => btn.classList.toggle('active', btn === button));
        const filter = button.dataset.filter;
        const rows = document.querySelectorAll('.case-row-data');
        filterByStatus(filter, rows);
    });
});

document.querySelectorAll('.cases-table .sortable').forEach(header => {
    header.addEventListener('click', () => {
        const nextKey = header.dataset.sort;
        if (!nextKey) return;

        if (currentSort.key === nextKey) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.key = nextKey;
            currentSort.direction = 'asc';
        }

        updateSortIndicators();
        renderCaseTable();
    });
});

updateSortIndicators();
renderCaseTable();
