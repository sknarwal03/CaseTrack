import { db } from '@config/firebase-config.js';
import { getFirSummaries, loadCaseRecords } from './fir-case-model.js';

const yearSelect = document.getElementById('firRegisterYear');
const yearButton = document.getElementById('firRegisterYearButton');
const yearPicker = document.getElementById('firRegisterYearPicker');
const searchInput = document.getElementById('firRegisterSearch');
const recordPage = document.getElementById('firRecordPage');
const positionLabel = document.getElementById('firPagePosition');
const previousButton = document.getElementById('previousFir');
const nextButton = document.getElementById('nextFir');
const breadcrumb = document.getElementById('yearBreadcrumb');
const indexLink = document.getElementById('openFirIndex');

let records = [];
let firs = [];
let visibleFirs = [];
let activeIndex = 0;

const text = value => String(value ?? '').trim();
const firYearOf = fir => text(fir.firYear || fir.year || fir.firDate?.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]);
const firNumber = fir => text(fir.firNo || fir.fileNo || 'Unnumbered FIR');
const identityKey = record => {
    if (record.recordType === 'fir_master' || record._collectionName === 'firMasters') return `master:${record.id}`;
    const masterId = record.firMasterId || (record._collectionName === 'linkedCases' ? record.firId : '');
    if (masterId) return `master:${masterId}`;
    const firNo = text(record.firNo).toLocaleLowerCase();
    const year = text(record.firYear);
    const station = text(record.policeStation).toLocaleLowerCase();
    return firNo && year && station ? `legacy:${firNo}|${year}|${station}` : `record:${record._collectionName || 'cases'}:${record.id}`;
};
const displayFir = fir => `${firNumber(fir)}${firYearOf(fir) ? `/${firYearOf(fir)}` : ''}`;

function make(tag, className = '', value = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
}

function fieldValue(sourceList, keys) {
    for (const source of sourceList) {
        for (const key of keys) {
            const value = source?.[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
    }
    return '';
}

function makeSection(code, title, count = '') {
    const section = make('section', 'fir-record-section');
    const heading = make('header', 'fir-record-section-title');
    heading.append(make('i', '', code), make('h3', '', title));
    if (count) heading.append(make('span', '', count));
    section.append(heading);
    return section;
}

function makeDetails(fields, emptyValues = false) {
    const grid = make('div', 'fir-detail-grid');
    fields.forEach(([label, value, wide = false]) => {
        if (!emptyValues && (value === undefined || value === null || String(value).trim() === '')) return;
        const detail = make('div', `fir-detail${wide ? ' wide' : ''}`);
        detail.append(make('label', '', label));
        const content = make('strong', '', value === '' || value == null ? 'Not recorded' : value);
        if (value === '' || value == null) content.classList.add('is-empty');
        detail.append(content);
        grid.append(detail);
    });
    return grid;
}

function createPersonCard(type, person, position) {
    const card = make('article', 'fir-person');
    card.append(make('span', 'fir-person-mark', String(position).padStart(2, '0')));
    const content = make('div', 'fir-person-content');
    content.append(make('strong', '', person.name || `${type} name not recorded`));
    const details = type === 'Accused'
        ? [
            person.fatherName && `Father: ${person.fatherName}`,
            person.mobile && `Mobile: ${person.mobile}`,
            person.arrested && `Arrested${person.arrestDate ? ` on ${person.arrestDate}` : ''}`,
            person.custodyStatus && `Custody: ${person.custodyStatus.replaceAll('_', ' ')}`,
            person.bailDate && `Bail date: ${person.bailDate}`,
            person.poStatus && `Proclaimed offender${person.poDate ? ` · ${person.poDate}` : ''}`,
            person.address && `Address: ${person.address}`
        ].filter(Boolean)
        : [person.status && `Status: ${person.status}`, person.examined && `Examined${person.examinedDate ? ` on ${person.examinedDate}` : ''}`].filter(Boolean);
    if (details.length) content.append(make('p', '', details.join(' · ')));
    card.append(content);
    return card;
}

function uniquePeople(proceedings, key) {
    const unique = new Map();
    proceedings.forEach(record => {
        (Array.isArray(record[key]) ? record[key] : []).forEach(person => {
            const hasDetails = Object.values(person || {}).some(value => value !== false && value != null && String(value).trim() !== '');
            if (!hasDetails) return;
            const signature = JSON.stringify(person);
            if (!unique.has(signature)) unique.set(signature, person);
        });
    });
    return [...unique.values()];
}

function makeProceedingsSection(proceedings) {
    const section = makeSection('03', 'Court & report records', `${proceedings.length} ${proceedings.length === 1 ? 'record' : 'records'}`);
    if (!proceedings.length) {
        const empty = make('div', 'fir-index-empty', 'No court or report record is linked to this FIR yet.');
        section.append(empty);
        return section;
    }
    const list = make('div', 'fir-subrecord-list');
    proceedings.forEach((record, index) => {
        const recordType = text(record.recordType || (record.ucrNumber ? 'ucr' : 'court'));
        const type = ({ ucr: 'UCR report', lower: 'Lower court proceeding', session: 'Sessions court proceeding', jjb: 'JJB proceeding', chargesheet: 'Chargesheet' })[recordType]
            || recordType.replaceAll('_', ' ');
        const article = make('article', 'fir-subrecord');
        const header = make('header', 'fir-subrecord-head');
        header.append(make('strong', '', `${type.toLocaleUpperCase()} · ${String(index + 1).padStart(2, '0')}`));
        header.append(make('span', '', record.status || record.report_type || 'Record'));
        article.append(header);
        article.append(makeDetails([
            ['Court type', record.courtType], ['Court number', record.courtNumber], ['Court name', record.courtName],
            ['Judge', record.judgeDisplayName || record.judgeName], ['Judicial designation', record.judgeCourtType],
            ['Registration number', [record.regPrefix, record.regNo, record.regYear].filter(Boolean).join('/')], ['Registration date', record.regDate],
            ['Date of challan', record.challanDate], ['Date of charge', record.chargeDate], ['Investigating officer', [record.ioRank, record.ioName].filter(Boolean).join(' ')],
            ['IO belt number', record.ioBeltno || record.beltNo], ['IO mobile', record.iomobileNo || record.mobileNo],
            ['Next hearing', record.nextDate], ['Trial stage', record.trialStage],
            ['UCR number', record.ucrNumber], ['Report type', record.report_type || record.ucrType], ['Date disposed', record.ucr_dod || record.ucrDisposedDate],
            ['Decision date', record.decisionDate], ['Disposal type', record.disposalType || record.judgement || record.judgment],
            ['Reason of acquittal', record.reasonOfAcquittal || record.reasonAcquittal, true]
        ]));
        list.append(article);
    });
    section.append(list);
    return section;
}

function makePeopleSection(type, people, code) {
    const title = type === 'Accused' ? 'Accused details' : 'Witness details';
    const section = makeSection(code, title, `${people.length} ${people.length === 1 ? 'person' : 'people'}`);
    if (!people.length) {
        section.append(make('div', 'fir-index-empty', `No ${type.toLocaleLowerCase()} details recorded.`));
        return section;
    }
    if (type === 'Witness') {
        const examined = people.filter(person => person.examined).length;
        section.append(makeDetails([['Total witnesses', people.length], ['Examined', examined], ['Remaining', people.length - examined]]));
    }
    const list = make('div', 'fir-people-list');
    people.forEach((person, index) => list.append(createPersonCard(type, person, index + 1)));
    section.append(list);
    return section;
}

function makeTimeline(proceedings, fir) {
    const items = [];
    const add = (date, label) => {
        if (!text(date)) return;
        const value = text(date);
        const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        const parsed = match
            ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
            : new Date(value);
        items.push({ date: value, label, time: Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime() });
    };
    add(fir.incidentDate, 'Incident reported');
    add(fir.firDate, 'FIR registered');
    proceedings.forEach(record => {
        add(record.regDate, `Registered in ${record.courtType || 'court'}`);
        add(record.challanDate, 'Challan filed');
        add(record.chargeDate, 'Charge filed');
        (Array.isArray(record.hearingDateRecord) ? record.hearingDateRecord : []).forEach(hearing => {
            const kind = hearing.kind === 'previous' ? 'Previous court date' : 'Next court date';
            add(hearing.date, [kind, hearing.trialStage].filter(Boolean).join(' · '));
        });
        if (!record.hearingDateRecord?.length) {
            add(record.nextDate, `Next court date${record.trialStage ? ` · ${record.trialStage}` : ''}`);
        }
        add(record.ucr_dod, 'Report disposed');
        add(record.decisionDate, 'Decision delivered');
    });
    const unique = [...new Map(items.map(item => [`${item.date}|${item.label}`, item])).values()]
        .sort((left, right) => left.time - right.time);
    const section = makeSection('06', 'Case timeline', `${unique.length} ${unique.length === 1 ? 'event' : 'events'}`);
    if (!unique.length) {
        section.append(make('div', 'fir-index-empty', 'No dated events recorded yet.'));
        return section;
    }
    const timeline = make('div', 'fir-timeline');
    unique.forEach(item => {
        const row = make('div', 'fir-timeline-item');
        row.append(make('time', '', item.date), make('i'), make('span', '', item.label));
        timeline.append(row);
    });
    section.append(timeline);
    return section;
}

function renderRecord(fir) {
    if (!fir) {
        recordPage.replaceChildren(make('div', 'fir-record-empty', 'No FIRs found for this year or search.'));
        return;
    }
    const proceedings = records.filter(record => identityKey(record) === fir._registerKey
        && record._collectionName !== 'firMasters' && record.recordType !== 'fir_master');
    const sources = [fir, ...proceedings];
    const status = fieldValue(sources, ['firStatus', 'caseStatus', 'status']) || 'Status not recorded';
    const cover = make('header', 'fir-record-cover');
    const heading = make('div');
    heading.append(make('span', 'fir-record-overline', `FIR REGISTER · ${firYearOf(fir) || 'YEAR NOT RECORDED'}`));
    heading.append(make('h2', '', displayFir(fir)));
    heading.append(make('p', '', [fieldValue(sources, ['policeStation']), fieldValue(sources, ['fileNo']) && `File ${fieldValue(sources, ['fileNo'])}`].filter(Boolean).join('  ·  ') || 'Official police case record'));
    cover.append(heading, make('span', 'fir-record-status', status));

    const body = make('div', 'fir-record-body');
    const identity = makeSection('01', 'First Information Report');
    identity.append(makeDetails([
        ['File number', fieldValue(sources, ['fileNo'])], ['FIR number', firNumber(fir)], ['FIR year', firYearOf(fir)],
        ['Date of FIR', fieldValue(sources, ['firDate'])], ['Police station', fieldValue(sources, ['policeStation'])],
        ['Under section', fieldValue(sources, ['underSection'])], ['Crime head', fieldValue(sources, ['crimeHead'])],
        ['FIR status', status], ['Highlighted case', fieldValue(sources, ['highlighted']) === true ? 'Yes' : (fieldValue(sources, ['highlighted']) === false ? 'No' : '')]
    ], true));
    body.append(identity);

    const incident = makeSection('02', 'Incident & complainant');
    incident.append(makeDetails([
        ['Incident date', fieldValue(sources, ['incidentDate'])], ['Incident place', fieldValue(sources, ['incidentPlace'])],
        ['Beat details', fieldValue(sources, ['beatDetails'])], ['Complainant name', fieldValue(sources, ['complainantName'])],
        ['Father’s name', fieldValue(sources, ['complainantFatherName'])], ['Mobile number', fieldValue(sources, ['complainantMobile'])],
        ['Address', fieldValue(sources, ['complainantAddress']), true]
    ], true));
    body.append(incident);
    body.append(makeProceedingsSection(proceedings));
    body.append(makePeopleSection('Accused', uniquePeople(proceedings, 'accused'), '04'));
    body.append(makePeopleSection('Witness', uniquePeople(proceedings, 'witnesses'), '05'));
    body.append(makeTimeline(proceedings, fir));

    recordPage.replaceChildren(cover, body);
}

function updateNavigation() {
    const fir = visibleFirs[activeIndex];
    positionLabel.textContent = visibleFirs.length ? `${activeIndex + 1} of ${visibleFirs.length}` : '0 of 0';
    previousButton.disabled = activeIndex <= 0;
    nextButton.disabled = activeIndex >= visibleFirs.length - 1;
    renderRecord(fir);
}

function refreshVisibleFirs() {
    const year = text(yearSelect.value);
    const query = text(searchInput.value).toLocaleLowerCase();
    if (indexLink) {
        const indexUrl = new URL('fir-index.html', window.location.href);
        if (year) indexUrl.searchParams.set('year', year);
        if (query) indexUrl.searchParams.set('q', query);
        indexLink.href = `${indexUrl.pathname}${indexUrl.search}`;
    }
    const yearFirs = firs.filter(fir => firYearOf(fir) === year);
    visibleFirs = yearFirs.filter(fir => {
        if (!query) return true;
        const sources = records.filter(record => identityKey(record) === fir._registerKey);
        const haystack = [
            firNumber(fir), firYearOf(fir), fir.fileNo, fir.policeStation, fir.complainantName,
            fir.complainantFatherName, fir.underSection,
            ...sources.flatMap(record => [record.courtName, record.regNo, record.judgeName, ...(record.accused || []).map(person => person?.name)])
        ].join(' ').toLocaleLowerCase();
        return haystack.includes(query);
    });
    activeIndex = Math.min(activeIndex, Math.max(visibleFirs.length - 1, 0));
    breadcrumb.textContent = year || '—';
    updateNavigation();
}

function syncYearPicker(years = []) {
    yearPicker.replaceChildren();
    years.forEach(year => {
        const option = make('button', '', year);
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(year === yearSelect.value));
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
    yearButton.setAttribute('aria-label', `Select FIR register year, currently ${yearButton.textContent}`);
    yearButton.disabled = !years.length;
}

function populateYears() {
    const currentYear = new Date().getFullYear();
    const requestedYear = new URLSearchParams(window.location.search).get('year');
    const years = Array.from({ length: 11 }, (_, index) => String(currentYear - 5 + index));
    if (/^\d{4}$/.test(requestedYear || '') && !years.includes(requestedYear)) {
        years.push(requestedYear);
        years.sort((a, b) => Number(a) - Number(b));
    }
    yearSelect.replaceChildren();
    years.forEach(year => yearSelect.add(new Option(year, year)));
    yearSelect.value = years.includes(requestedYear) ? requestedYear : String(currentYear);
    yearSelect.disabled = false;
    syncYearPicker(years);
    refreshVisibleFirs();
    const requestedFir = new URLSearchParams(window.location.search).get('fir');
    if (requestedFir) {
        const targetIndex = visibleFirs.findIndex(fir => fir._registerKey === requestedFir);
        if (targetIndex >= 0) {
            activeIndex = targetIndex;
            updateNavigation();
        }
    }
}

yearSelect.addEventListener('change', () => { activeIndex = 0; syncYearPicker([...yearSelect.options].map(option => option.value).filter(Boolean)); refreshVisibleFirs(); });
yearButton.addEventListener('click', () => {
    const open = !yearPicker.classList.contains('is-open');
    yearPicker.classList.toggle('is-open', open);
    yearPicker.setAttribute('aria-hidden', String(!open));
    yearButton.setAttribute('aria-expanded', String(open));
});
document.querySelector('.fir-register-hero')?.addEventListener('dblclick', () => {
    const currentYear = String(new Date().getFullYear());
    if (![...yearSelect.options].some(option => option.value === currentYear)) {
        yearSelect.add(new Option(currentYear, currentYear));
    }
    yearSelect.value = currentYear;
    yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
    yearPicker.classList.remove('is-open');
    yearPicker.setAttribute('aria-hidden', 'true');
    yearButton.setAttribute('aria-expanded', 'false');
});
document.addEventListener('click', event => {
    if (event.target.closest('.fir-register-hero-year-control')) return;
    yearPicker.classList.remove('is-open');
    yearPicker.setAttribute('aria-hidden', 'true');
    yearButton.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !yearPicker.classList.contains('is-open')) return;
    yearPicker.classList.remove('is-open');
    yearPicker.setAttribute('aria-hidden', 'true');
    yearButton.setAttribute('aria-expanded', 'false');
    yearButton.focus();
});
searchInput.addEventListener('input', () => { activeIndex = 0; refreshVisibleFirs(); });
previousButton.addEventListener('click', () => { if (activeIndex > 0) { activeIndex--; updateNavigation(); } });
nextButton.addEventListener('click', () => { if (activeIndex < visibleFirs.length - 1) { activeIndex++; updateNavigation(); } });
document.getElementById('printFirPage').addEventListener('click', () => window.print());
document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowLeft' && activeIndex > 0) { activeIndex--; updateNavigation(); }
    if (event.key === 'ArrowRight' && activeIndex < visibleFirs.length - 1) { activeIndex++; updateNavigation(); }
});

async function init() {
    try {
        records = await loadCaseRecords(db);
        firs = getFirSummaries(records).map(fir => ({ ...fir, _registerKey: identityKey(fir) }))
            .sort((left, right) => {
                const numberOrder = Number(firNumber(left)) - Number(firNumber(right));
                return Number.isNaN(numberOrder) || numberOrder === 0
                    ? displayFir(left).localeCompare(displayFir(right), undefined, { numeric: true })
                    : numberOrder;
            });
        populateYears();
    } catch (error) {
        console.error('Unable to load the FIR register.', error);
        yearSelect.replaceChildren(new Option('Unavailable', ''));
        yearSelect.disabled = true;
        syncYearPicker();
        yearButton.textContent = 'Unavailable';
        indexCount.textContent = '—';
        indexList.replaceChildren(make('li', 'fir-index-empty', 'The register could not be loaded. Check your access and connection, then reload this page.'));
        recordPage.replaceChildren(make('div', 'fir-record-empty', 'FIR records are unavailable. Please check your access and try again.'));
        positionLabel.textContent = '—';
    }
}

init();
