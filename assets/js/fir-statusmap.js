import { db } from '@config/firebase-config.js';
import { loadFirStatusMapContext, loadFirStatusMapRecords } from './fir-statusmap-data.js';
import { buildFirStatusMap, firRegisterUrl, nextHearingFor } from './fir-statusmap-model.mjs';

const yearSelect = document.getElementById('statusmapYear');
const yearButton = document.getElementById('statusmapYearButton');
const yearPicker = document.getElementById('statusmapYearPicker');
const grid = document.getElementById('statusmapGrid');
const message = document.getElementById('statusmapMessage');
const backLink = document.getElementById('statusmapBack');
const unnumberedPanel = document.getElementById('unnumberedPanel');
const unnumberedList = document.getElementById('unnumberedList');
const detailsDialog = document.getElementById('firDetailsDialog');

const initialParams = new URLSearchParams(window.location.search);
const requestedYear = /^\d{4}$/.test(initialParams.get('year') || '')
    ? initialParams.get('year')
    : String(new Date().getFullYear());
const requestedStation = initialParams.get('station') || '';

let accessContext = null;
let selectedStation = null;
let loadSequence = 0;

const byId = id => document.getElementById(id);
const text = value => String(value ?? '').trim();
const setText = (id, value, fallback = 'Not recorded') => {
    byId(id).textContent = text(value) || fallback;
};

function makeSelectOption(label, value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
}

function syncYearPicker(years = []) {
    yearPicker.replaceChildren();
    years.forEach(year => {
        const option = document.createElement('button');
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(year === yearSelect.value));
        option.textContent = year;
        option.addEventListener('click', () => {
            yearSelect.value = year;
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
            yearPicker.classList.remove('is-open');
            yearPicker.setAttribute('aria-hidden', 'true');
            yearButton.setAttribute('aria-expanded', 'false');
        });
        yearPicker.append(option);
    });
    yearButton.textContent = yearSelect.value || (years.length ? 'Select year' : 'No years');
    yearButton.setAttribute('aria-label', `Select FIR year, currently ${yearButton.textContent}`);
    yearButton.disabled = !years.length;
}

function closeYearPicker() {
    yearPicker.classList.remove('is-open');
    yearPicker.setAttribute('aria-hidden', 'true');
    yearButton.setAttribute('aria-expanded', 'false');
}

function populateYears() {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 11 }, (_, index) => String(currentYear - 5 + index));
    if (!years.includes(requestedYear)) years.push(requestedYear);
    years.sort((left, right) => Number(left) - Number(right));
    yearSelect.replaceChildren(...years.map(year => makeSelectOption(year, year)));
    yearSelect.value = years.includes(requestedYear) ? requestedYear : String(currentYear);
    yearSelect.disabled = false;
    syncYearPicker(years);
}

function updateUrlAndBackLink() {
    const params = new URLSearchParams(window.location.search);
    if (selectedStation) params.set('station', selectedStation.id);
    if (yearSelect.value) params.set('year', yearSelect.value);
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

    const backUrl = new URL('fir-register.html', window.location.href);
    if (yearSelect.value) backUrl.searchParams.set('year', yearSelect.value);
    if (selectedStation) backUrl.searchParams.set('station', selectedStation.id);
    backLink.href = `${backUrl.pathname}${backUrl.search}`;
}

function stationNameOf(id) {
    return accessContext?.stations.find(station => station.id === id)?.name || '';
}

function setLoading(isLoading) {
    yearSelect.disabled = isLoading;
    yearButton.disabled = isLoading || !yearSelect.options.length;
}

function updateSummary(counts) {
    byId('countRegistered').textContent = counts.totalRegistered.toLocaleString();
    byId('countUi').textContent = counts.underInvestigation.toLocaleString();
    byId('countUcr').textContent = counts.ucr.toLocaleString();
    byId('countUt').textContent = counts.underTrial.toLocaleString();
    byId('countDisposed').textContent = counts.disposed.toLocaleString();
    byId('countOther').textContent = counts.other.toLocaleString();
    byId('countMissing').textContent = counts.missingFirNumbers.toLocaleString();
}

function showDetails(record, number, { missing = false } = {}) {
    const stationName = stationNameOf(selectedStation?.id);
    const master = record?.master;
    const firNumber = record?.firNumber || (record?.firNumberValue ? String(record.firNumberValue) : String(number));
    setText('dialogTitle', missing ? `FIR No. ${number}` : `FIR ${firNumber}`);
    setText('dialogFirNumber', missing ? String(number) : firNumber);
    setText('dialogFirDate', master?.firDate);
    setText('dialogSections', master?.underSection);
    setText('dialogStation', master?.policeStation || stationName);
    const hearing = nextHearingFor(record?.proceedings || []);
    setText('dialogHearing', hearing ? `${hearing.date}${hearing.stage ? ` · ${hearing.stage}` : ''}` : '', 'No upcoming hearing');

    const statusElement = byId('dialogStatus');
    statusElement.className = `dialog-status${record?.statusCategory ? ` status-${record.statusCategory}` : ' status-missing'}`;
    statusElement.textContent = missing ? 'FIR Not Registered' : record.statusLabel;
    byId('dialogMissing').hidden = !missing;
    const viewLink = byId('dialogViewFir');
    viewLink.hidden = missing || !master?.id;
    if (!viewLink.hidden) viewLink.href = firRegisterUrl(yearSelect.value, master.id, window.location.href);
    detailsDialog.showModal();
}

function makeCell(record) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `statusmap-cell ${record.registered ? `status-${record.statusCategory}` : 'status-missing'}`;
    cell.title = record.registered
        ? `FIR ${record.firNumber}: ${record.statusLabel}`
        : `FIR No. ${record.displayNumber}: not registered`;
    cell.setAttribute('aria-label', record.registered
        ? `FIR ${record.firNumber}, ${record.statusLabel}${record.duplicateMasters.length ? `, ${record.duplicateMasters.length + 1} duplicate records` : ''}`
        : `FIR number ${record.displayNumber}, no FIR registered`);
    const number = document.createElement('span');
    number.className = 'statusmap-cell-number';
    number.textContent = record.displayNumber;
    cell.append(number);
    if (record.registered && (!record.color || record.duplicateMasters.length)) {
        const indicator = document.createElement('span');
        indicator.className = 'statusmap-cell-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.textContent = record.duplicateMasters.length ? '!' : '?';
        cell.append(indicator);
    }
    cell.addEventListener('click', () => record.registered
        ? showDetails(record, record.number)
        : showDetails(null, record.displayNumber, { missing: true }));
    return cell;
}

function renderModel(model) {
    const fragment = document.createDocumentFragment();
    model.cells.forEach(record => fragment.append(makeCell(record)));
    grid.replaceChildren(fragment);
    updateSummary(model.counts);

    unnumberedList.replaceChildren();
    model.unnumbered.forEach(record => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `unnumbered-record status-${record.statusCategory}`;
        button.textContent = `${text(record.master.firNo) || 'No FIR number'} · ${record.statusLabel}`;
        button.addEventListener('click', () => showDetails(record, '—'));
        unnumberedList.append(button);
    });
    unnumberedPanel.hidden = model.unnumbered.length === 0;

    if (model.maxNumber === 0 && model.unnumbered.length === 0) {
        message.textContent = 'No FIR records found for this police station and year.';
        message.dataset.state = 'empty';
    } else {
        const extras = [
            countsLabel(model.counts.unnumberedRecords, 'unnumbered record'),
            countsLabel(model.counts.duplicateRecords, 'duplicate FIR number')
        ].filter(Boolean);
        message.textContent = `${model.maxNumber.toLocaleString()} FIR numbers in sequence${extras.length ? ` · ${extras.join(' · ')}` : ''}.`;
        message.dataset.state = 'ready';
    }
}

function countsLabel(value, label) {
    return value ? `${value.toLocaleString()} ${label}${value === 1 ? '' : 's'}` : '';
}

async function loadSelectedRecords() {
    const request = ++loadSequence;
    if (!selectedStation) return;
    setLoading(true);
    message.textContent = 'Loading FIR records…';
    message.dataset.state = 'loading';
    grid.replaceChildren();
    unnumberedPanel.hidden = true;
    try {
        const { masters, proceedings } = await loadFirStatusMapRecords(
            db,
            selectedStation.id,
            yearSelect.value,
            accessContext.stationIds
        );
        if (request !== loadSequence) return;
        renderModel(buildFirStatusMap({ masters, proceedings, stationId: selectedStation.id, year: yearSelect.value }));
    } catch (error) {
        if (request !== loadSequence) return;
        grid.replaceChildren();
        message.textContent = error?.code === 'permission-denied'
            ? 'Access to these FIR records was denied. Contact an administrator to verify your police station access.'
            : 'FIR records could not be loaded. Check your connection and try again.';
        message.dataset.state = 'error';
        console.error('FIR statusmap load failed:', error?.code || 'unknown');
    } finally {
        if (request === loadSequence) setLoading(false);
    }
}

function initializeStationContext(context) {
    accessContext = context;
    if (!context.stations.length) {
        message.textContent = 'No authorized police stations are available for this account.';
        message.dataset.state = 'error';
        return;
    }
    selectedStation = context.stations.find(station => station.id === requestedStation) || context.stations[0];
    updateUrlAndBackLink();
    void loadSelectedRecords();
}

yearSelect.addEventListener('change', () => {
    syncYearPicker([...yearSelect.options].map(option => option.value));
    updateUrlAndBackLink();
    void loadSelectedRecords();
});

yearButton.addEventListener('click', () => {
    const open = !yearPicker.classList.contains('is-open');
    yearPicker.classList.toggle('is-open', open);
    yearPicker.setAttribute('aria-hidden', String(!open));
    yearButton.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', event => {
    if (event.target.closest('.fir-register-hero-year-control')) return;
    closeYearPicker();
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !yearPicker.classList.contains('is-open')) return;
    closeYearPicker();
    yearButton.focus();
});

detailsDialog.addEventListener('click', event => {
    if (event.target === detailsDialog) detailsDialog.close();
});

populateYears();
void loadFirStatusMapContext(db).then(initializeStationContext).catch(error => {
    message.textContent = 'Authorized police stations could not be verified. Check your connection and access, then reload this page.';
    message.dataset.state = 'error';
    console.error('FIR statusmap access check failed:', error?.code || 'unknown');
});
