import { db } from '@config/firebase-config.js';
import { getFirSummaries, loadCaseRecords } from './fir-case-model.js';

const yearSelect = document.getElementById('firIndexYear');
const searchInput = document.getElementById('firIndexSearch');
const rowsHost = document.getElementById('firIndexRows');
const resultCount = document.getElementById('firIndexResultCount');
const pageSummary = document.getElementById('firIndexPageSummary');
const pageNumber = document.getElementById('firIndexPageNumber');
const previousButton = document.getElementById('firIndexPrevious');
const nextButton = document.getElementById('firIndexNext');
const pageSize = 50;

let records = [];
let indexedFirs = [];
let visibleFirs = [];
let currentPage = 0;

const text = value => String(value ?? '').trim();
const firYearOf = fir => text(fir.firYear || fir.year || fir.firDate?.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]);
const firNumber = fir => text(fir.firNo || fir.fileNo || 'Unnumbered FIR');
const displayFir = fir => `${firNumber(fir)}${firYearOf(fir) ? `/${firYearOf(fir)}` : ''}`;

function identityKey(record) {
    if (record.recordType === 'fir_master' || record._collectionName === 'firMasters') return `master:${record.id}`;
    const masterId = record.firMasterId || (record._collectionName === 'linkedCases' ? record.firId : '');
    if (masterId) return `master:${masterId}`;
    const firNo = text(record.firNo).toLocaleLowerCase();
    const year = text(record.firYear);
    const station = text(record.policeStation).toLocaleLowerCase();
    return firNo && year && station ? `legacy:${firNo}|${year}|${station}` : `record:${record._collectionName || 'cases'}:${record.id}`;
}

function node(tag, className = '', value = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value ?? '');
    return element;
}

function recordUrl(fir) {
    const url = new URL('fir-register.html', window.location.href);
    url.searchParams.set('year', firYearOf(fir));
    url.searchParams.set('fir', fir._registerKey);
    return `${url.pathname}${url.search}`;
}

function searchMatch(fir, query) {
    if (!query) return true;
    const related = records.filter(record => identityKey(record) === fir._registerKey);
    const values = [
        firNumber(fir), firYearOf(fir), fir.fileNo, fir.firDate, fir.policeStation,
        fir.complainantName, fir.complainantFatherName, fir.complainantMobile,
        fir.incidentPlace, fir.underSection, fir.crimeHead,
        ...related.flatMap(record => [
            record.courtName, record.judgeName, record.regNo, record.regYear,
            record.ioName, record.ucrNumber, record.status,
            ...(Array.isArray(record.accused) ? record.accused.map(person => person?.name) : [])
        ])
    ];
    return values.some(value => text(value).toLocaleLowerCase().includes(query));
}

function renderRows() {
    const start = currentPage * pageSize;
    const pageRecords = visibleFirs.slice(start, start + pageSize);
    rowsHost.replaceChildren();
    if (!visibleFirs.length) {
        const row = document.createElement('tr');
        const cell = node('td', 'fir-index-table-message', 'No FIRs match this year and search.');
        cell.colSpan = 8;
        row.append(cell);
        rowsHost.append(row);
    } else {
        pageRecords.forEach((fir, offset) => {
            const row = document.createElement('tr');
            row.append(node('td', '', String(start + offset + 1).padStart(3, '0')));

            const numberCell = document.createElement('td');
            numberCell.append(node('strong', 'fir-index-number', displayFir(fir)));
            row.append(numberCell);
            row.append(node('td', '', fir.firDate || '—'));
            row.append(node('td', '', fir.policeStation || '—'));
            row.append(node('td', '', fir.complainantName || '—'));
            row.append(node('td', '', fir.underSection || '—'));

            const status = text(fir.firStatus || fir.caseStatus || fir.status || 'Unknown');
            const statusCell = document.createElement('td');
            const statusBadge = node('span', 'fir-index-status', status);
            statusBadge.dataset.status = status.toLocaleLowerCase();
            statusCell.append(statusBadge);
            row.append(statusCell);

            const actionCell = document.createElement('td');
            const openLink = node('a', 'fir-index-open-record', 'Open FIR →');
            openLink.href = recordUrl(fir);
            openLink.setAttribute('aria-label', `Open full record for FIR ${displayFir(fir)}`);
            actionCell.append(openLink);
            row.append(actionCell);
            rowsHost.append(row);
        });
    }

    const totalPages = Math.ceil(visibleFirs.length / pageSize);
    const first = visibleFirs.length ? start + 1 : 0;
    const last = Math.min(start + pageSize, visibleFirs.length);
    resultCount.textContent = `${visibleFirs.length.toLocaleString()} FIR${visibleFirs.length === 1 ? '' : 's'} found`;
    pageSummary.textContent = `${first.toLocaleString()}–${last.toLocaleString()} of ${visibleFirs.length.toLocaleString()}`;
    pageNumber.textContent = totalPages ? `${currentPage + 1} / ${totalPages}` : '0 / 0';
    previousButton.disabled = currentPage <= 0;
    nextButton.disabled = currentPage >= totalPages - 1;
}

function applyFilters() {
    const year = text(yearSelect.value);
    const query = text(searchInput.value).toLocaleLowerCase();
    visibleFirs = indexedFirs.filter(fir => firYearOf(fir) === year && searchMatch(fir, query));
    currentPage = Math.min(currentPage, Math.max(Math.ceil(visibleFirs.length / pageSize) - 1, 0));
    renderRows();
}

function populateYears() {
    const years = [...new Set(indexedFirs.map(firYearOf).filter(year => /^\d{4}$/.test(year)))].sort((a, b) => Number(b) - Number(a));
    yearSelect.replaceChildren();
    if (!years.length) {
        yearSelect.add(new Option('No years available', ''));
        yearSelect.disabled = true;
        applyFilters();
        return;
    }
    years.forEach(year => yearSelect.add(new Option(year, year)));
    const params = new URLSearchParams(window.location.search);
    const requestedYear = params.get('year');
    const currentYear = String(new Date().getFullYear());
    yearSelect.value = years.includes(requestedYear) ? requestedYear : years.includes(currentYear) ? currentYear : years[0];
    searchInput.value = params.get('q') || '';
    yearSelect.disabled = false;
    applyFilters();
}

yearSelect.addEventListener('change', () => { currentPage = 0; applyFilters(); });
searchInput.addEventListener('input', () => { currentPage = 0; applyFilters(); });
previousButton.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderRows(); } });
nextButton.addEventListener('click', () => {
    if (currentPage < Math.ceil(visibleFirs.length / pageSize) - 1) { currentPage++; renderRows(); }
});

async function init() {
    try {
        records = await loadCaseRecords(db);
        indexedFirs = getFirSummaries(records).map(fir => ({ ...fir, _registerKey: identityKey(fir) }))
            .sort((left, right) => {
                const numberOrder = Number(firNumber(left)) - Number(firNumber(right));
                return Number.isNaN(numberOrder) || numberOrder === 0
                    ? displayFir(left).localeCompare(displayFir(right), undefined, { numeric: true })
                    : numberOrder;
            });
        populateYears();
    } catch (error) {
        console.error('Unable to load the FIR index.', error);
        yearSelect.replaceChildren(new Option('Unavailable', ''));
        yearSelect.disabled = true;
        resultCount.textContent = 'Register unavailable';
        const row = document.createElement('tr');
        const cell = node('td', 'fir-index-table-message', 'The FIR index could not be loaded. Check your access and connection, then reload this page.');
        cell.colSpan = 8;
        row.append(cell);
        rowsHost.replaceChildren(row);
        pageSummary.textContent = '—';
        pageNumber.textContent = '—';
    }
}

init();
