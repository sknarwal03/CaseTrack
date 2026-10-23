import { db } from '@config/firebase-config.js';
import { loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';

const filterButtons = [...document.querySelectorAll('.po-filter')];
const tableBody = document.querySelector('#poCasesTableBody');
const count = document.querySelector('#poCaseCount');
let poRows = [];
let activeFilter = 'all';

function caseFilterStatus(caseItem = {}) {
    const status = String(caseItem.status || caseItem.caseStatus || '').trim().toLowerCase();
    if (status === 'disposed') return 'closed';
    if (status === 'committed') return 'review';
    if (['ui', 'under investigation'].includes(status)) return 'pending';
    return 'active';
}

function appendCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value || '—';
    row.append(cell);
    return cell;
}

function renderRows() {
    if (!tableBody) return;
    tableBody.replaceChildren();
    const visibleRows = poRows.filter(item => activeFilter === 'all' || item.filterStatus === activeFilter);
    if (count) count.textContent = `${visibleRows.length} ${visibleRows.length === 1 ? 'record' : 'records'}`;

    if (!visibleRows.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 8;
        cell.className = 'table-empty';
        cell.textContent = poRows.length ? 'No PO cases match this filter.' : 'No proclaimed offender cases found.';
        row.append(cell);
        tableBody.append(row);
        return;
    }

    visibleRows.forEach(({ caseItem, accused, filterStatus }) => {
        const row = document.createElement('tr');
        const firCell = appendCell(row, caseItem.fileNo || [caseItem.firNo, caseItem.firYear].filter(Boolean).join('/'));
        const firLink = document.createElement('a');
        firLink.className = 'po-case-link';
        firLink.textContent = caseItem.fileNo || [caseItem.firNo, caseItem.firYear].filter(Boolean).join('/') || 'Open case';
        firLink.href = `cases.html?case=${encodeURIComponent(caseItem.id)}&collection=${encodeURIComponent(caseItem._collectionName || 'cases')}`;
        firCell.replaceChildren(firLink);

        appendCell(row, caseItem.firDate);
        appendCell(row, caseItem.underSection);
        appendCell(row, accused.name || 'Accused');
        appendCell(row, caseItem.courtName || caseItem.courtNumber);
        appendCell(row, caseItem.nextDate);
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `po-case-status ${filterStatus}`;
        badge.textContent = String(caseItem.status || caseItem.caseStatus || 'Unknown');
        statusCell.append(badge);
        row.append(statusCell);

        const actionCell = document.createElement('td');
        const open = document.createElement('a');
        open.className = 'icon-btn';
        open.textContent = '↗';
        open.setAttribute('aria-label', 'Open case details');
        open.href = firLink.href;
        actionCell.append(open);
        row.append(actionCell);
        tableBody.append(row);
    });
}

filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        activeFilter = button.dataset.filter || 'all';
        filterButtons.forEach(item => {
            const selected = item === button;
            item.classList.toggle('active', selected);
            item.setAttribute('aria-pressed', String(selected));
        });
        renderRows();
    });
});

async function loadPoCases() {
    try {
        const records = await loadCaseRecords(db);
        poRows = records.filter(isCourtProceeding).flatMap(caseItem =>
            (Array.isArray(caseItem.accused) ? caseItem.accused : [])
                .filter(accused => accused.poStatus === true)
                .map(accused => ({ caseItem, accused, filterStatus: caseFilterStatus(caseItem) }))
        );
        renderRows();
    } catch (error) {
        console.error('Could not load PO cases:', error);
        if (count) count.textContent = 'Unable to load records';
        if (tableBody) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.className = 'table-empty';
            cell.textContent = 'Could not load PO cases. Check access and retry.';
            row.append(cell);
            tableBody.replaceChildren(row);
        }
    }
}

loadPoCases();
window.addEventListener('caseAdded', loadPoCases);
