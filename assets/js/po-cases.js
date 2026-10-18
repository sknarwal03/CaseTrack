import { db } from '@config/firebase-config.js';
import { loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';

const filterButtons = [...document.querySelectorAll('.po-filter')];
const tableBody = document.querySelector('#poCasesTableBody');
let poRows = [];

function setCount(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
}

function renderRows() {
    if (!tableBody) return;
    tableBody.replaceChildren();
    if (!poRows.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = 'No proclaimed-offender court proceedings found.';
        row.append(cell);
        tableBody.append(row);
        return;
    }
    poRows.forEach(({ caseItem, accused, status }) => {
        const row = document.createElement('tr');
        row.className = 'po-row';
        row.dataset.status = status;
        const values = [
            `FIR ${[caseItem.firNo, caseItem.firYear].filter(Boolean).join('/') || '—'} · ${accused.name || 'Accused'}`,
            [caseItem.ioRank, caseItem.ioName].filter(Boolean).join(' '),
            caseItem.policeStation || '—',
            caseItem.nextDate || '—',
            accused.priority || 'Normal',
            String(caseItem.status || 'Unknown')
        ];
        values.forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        });
        const actionCell = document.createElement('td');
        const open = document.createElement('a');
        open.className = 'icon-btn';
        open.textContent = '↗';
        open.setAttribute('aria-label', 'Open proceeding');
        open.href = `cases.html?case=${encodeURIComponent(caseItem.id)}&collection=${encodeURIComponent(caseItem._collectionName || 'cases')}`;
        actionCell.append(open);
        row.append(actionCell);
        tableBody.append(row);
    });
}

filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        filterButtons.forEach(item => item.classList.toggle('active', item === button));
        const filter = button.dataset.filter;
        tableBody?.querySelectorAll('.po-row').forEach(row => {
            row.style.display = filter === 'all' || row.dataset.status === filter ? '' : 'none';
        });
    });
});

async function loadPoCases() {
    try {
        const records = await loadCaseRecords(db);
        const proceedings = records.filter(isCourtProceeding);
        poRows = proceedings.flatMap(caseItem => (Array.isArray(caseItem.accused) ? caseItem.accused : [])
            .filter(accused => accused.poStatus === true)
            .map(accused => {
                const caseStatus = String(caseItem.status || '').toLowerCase();
                const status = caseStatus === 'committed' ? 'review'
                    : caseStatus === 'ui' ? 'pending'
                        : caseStatus === 'disposed' ? 'closed' : 'active';
                return { caseItem, accused, status };
            }));
        setCount('#totalPoCases', poRows.length);
        setCount('#pendingPoCases', poRows.filter(item => item.status === 'pending' || item.status === 'review').length);
        setCount('#hearingDuePoCases', poRows.filter(item => item.caseItem.nextDate).length);
        setCount('#closedPoCases', poRows.filter(item => item.status === 'closed').length);
        renderRows();
    } catch (error) {
        console.error('Could not load PO proceedings:', error);
        if (tableBody) {
            tableBody.replaceChildren();
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 7;
            cell.textContent = 'Could not load PO proceedings. Check access and retry.';
            row.append(cell);
            tableBody.append(row);
        }
        ['#totalPoCases', '#pendingPoCases', '#hearingDuePoCases', '#closedPoCases'].forEach(selector => setCount(selector, '—'));
    }
}

loadPoCases();
window.addEventListener('caseAdded', loadPoCases);
