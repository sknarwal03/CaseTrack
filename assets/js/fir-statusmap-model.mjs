import { deriveFirStatus, normalizeFirStatus } from './fir-status.mjs';

export const FIR_STATUSMAP_STATUS_COLORS = Object.freeze({
    UI: Object.freeze({ label: 'Under Investigation', color: '#5B8DEF', category: 'ui' }),
    UCR: Object.freeze({ label: 'UCR — Untraced / Cancellation', color: '#E6B84A', category: 'ucr' }),
    UT: Object.freeze({ label: 'Under Trial', color: '#E66A73', category: 'ut' }),
    Disposed: Object.freeze({ label: 'Disposed', color: '#42B883', category: 'disposed' })
});

const statusStyleFor = status => {
    const normalized = normalizeFirStatus(status);
    if (normalized === 'Cancelled') return FIR_STATUSMAP_STATUS_COLORS.UCR;
    return FIR_STATUSMAP_STATUS_COLORS[normalized] || null;
};

export function firStatusMapColorForStatus(status) {
    return statusStyleFor(status)?.color || null;
}

export function firNumberValue(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function isAuthorizedStation(stations = [], stationId = '') {
    return Array.isArray(stations) && stations.some(station => station?.id === stationId);
}

function yearOf(record = {}) {
    return String(record.firYear ?? record.year ?? '').trim();
}

function masterIdOf(record = {}) {
    return String(record.firMasterId || record.firId || '').trim();
}

function identityKey(record = {}) {
    const firNo = String(record.firNo ?? '').trim().toLocaleLowerCase();
    const year = yearOf(record);
    const stationId = String(record.policeStationId ?? '');
    return firNo && year && stationId ? `${firNo}|${year}|${stationId}` : '';
}

function statusFor(master, proceedings) {
    return deriveFirStatus(master, proceedings);
}

function classify(status) {
    const style = statusStyleFor(status);
    if (!style) return { category: 'other', status: String(status || 'Unknown'), style: null };
    const normalized = normalizeFirStatus(status);
    return {
        category: style.category,
        status: normalized === 'Cancelled' ? 'Cancelled' : normalized,
        style
    };
}

function compareMasterId(left, right) {
    return String(left.id || '').localeCompare(String(right.id || ''));
}

function makeRegisteredRecord(master, proceedings, duplicateMasters = []) {
    const firStatus = statusFor(master, proceedings);
    const classification = duplicateMasters.length
        ? { category: 'other', status: 'Duplicate FIR number', style: null }
        : classify(firStatus);
    return {
        registered: true,
        master,
        proceedings,
        duplicateMasters,
        firNumber: String(master.firNo ?? '').trim(),
        firNumberValue: firNumberValue(master.firNo),
        firStatus,
        status: classification.status,
        statusCategory: classification.category,
        color: classification.style?.color || null,
        statusLabel: classification.style?.label || (duplicateMasters.length ? 'Duplicate FIR number' : 'Registered · status unknown')
    };
}

export function buildFirStatusMap({ masters = [], proceedings = [], stationId, year } = {}) {
    const filteredMasters = masters.filter(master =>
        String(master.policeStationId ?? '') === String(stationId ?? '')
        && yearOf(master) === String(year ?? ''))
        .slice()
        .sort(compareMasterId);
    const masterIds = new Set(filteredMasters.map(master => String(master.id)));
    const proceedingsByMaster = new Map([...masterIds].map(id => [id, []]));
    const mastersByIdentity = new Map();
    filteredMasters.forEach(master => {
        const key = identityKey(master);
        if (key && !mastersByIdentity.has(key)) mastersByIdentity.set(key, String(master.id));
    });
    const representedLegacyIds = new Set(proceedings
        .filter(record => record._collectionName === 'linkedCases')
        .map(record => String(record.legacyCaseId || ''))
        .filter(Boolean));
    proceedings.forEach(record => {
        if (String(record.policeStationId ?? '') !== String(stationId ?? '')) return;
        if (record._collectionName === 'cases' && representedLegacyIds.has(String(record.id || ''))) return;
        const relatedId = masterIdOf(record);
        const masterId = masterIds.has(relatedId)
            ? relatedId
            : record._collectionName === 'cases' ? mastersByIdentity.get(identityKey(record)) : '';
        if (!masterIds.has(masterId)) return;
        proceedingsByMaster.get(masterId).push({ ...record, firMasterId: masterId });
    });

    const numberGroups = new Map();
    const unnumbered = [];
    filteredMasters.forEach(master => {
        const related = proceedingsByMaster.get(String(master.id)) || [];
        const number = firNumberValue(master.firNo);
        const record = makeRegisteredRecord(master, related);
        if (number === null) {
            unnumbered.push(record);
            return;
        }
        if (!numberGroups.has(number)) numberGroups.set(number, []);
        numberGroups.get(number).push(record);
    });

    let maxNumber = 0;
    for (const number of numberGroups.keys()) maxNumber = Math.max(maxNumber, number);
    const maxDisplayWidth = Math.max(1, ...[...numberGroups.values()].flat().map(record => record.firNumber.length));
    const registeredByNumber = new Map();
    for (const [number, group] of numberGroups) {
        group.sort((left, right) => compareMasterId(left.master, right.master));
        const selected = group[0];
        if (group.length > 1) {
            selected.duplicateMasters = group.slice(1).map(record => record.master);
            selected.status = 'Duplicate FIR number';
            selected.statusLabel = 'Duplicate FIR number';
            selected.statusCategory = 'other';
            selected.color = null;
        }
        registeredByNumber.set(number, selected);
    }

    const cells = Array.from({ length: maxNumber }, (_, index) => {
        const number = index + 1;
        const registered = registeredByNumber.get(number);
        if (registered) return { ...registered, number, displayNumber: registered.firNumber };
        return {
            registered: false,
            number,
            displayNumber: String(number).padStart(maxDisplayWidth, '0'),
            master: null,
            proceedings: [],
            duplicateMasters: [],
            firNumber: '',
            firStatus: '',
            status: 'FIR Not Registered',
            statusCategory: 'missing',
            color: null,
            statusLabel: 'FIR Not Registered'
        };
    });

    const counts = { ui: 0, ucr: 0, underTrial: 0, disposed: 0, other: 0 };
    [...registeredByNumber.values(), ...unnumbered].forEach(record => {
        if (record.statusCategory === 'ui') counts.ui += 1;
        else if (record.statusCategory === 'ucr') counts.ucr += 1;
        else if (record.statusCategory === 'ut') counts.underTrial += 1;
        else if (record.statusCategory === 'disposed') counts.disposed += 1;
        else counts.other += 1;
    });

    const registeredNumberCount = registeredByNumber.size;
    const duplicateCount = [...registeredByNumber.values()].reduce((sum, record) => sum + record.duplicateMasters.length, 0);
    return {
        cells,
        unnumbered,
        maxNumber,
        counts: {
            totalRegistered: registeredNumberCount + unnumbered.length,
            underInvestigation: counts.ui,
            ucr: counts.ucr,
            underTrial: counts.underTrial,
            disposed: counts.disposed,
            other: counts.other,
            underTrialOrOther: counts.underTrial + counts.other,
            missingFirNumbers: cells.filter(cell => !cell.registered).length,
            unnumberedRecords: unnumbered.length,
            duplicateRecords: duplicateCount
        }
    };
}

function dateKey(value) {
    const text = String(value ?? '').trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (!match) return '';
    return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

export function nextHearingFor(proceedings, today = new Date()) {
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const hearings = [];
    (Array.isArray(proceedings) ? proceedings : []).forEach(record => {
        const history = Array.isArray(record.hearingDateRecord) ? record.hearingDateRecord : [];
        const managedNext = history.filter(item => item?.kind === 'next');
        const candidates = managedNext.length ? managedNext.map(item => ({ date: item.date, stage: item.trialStage }))
            : [{ date: record.nextDate, stage: record.trialStage }];
        candidates.forEach(item => {
            const key = dateKey(item.date);
            if (key && key >= todayKey) hearings.push({ date: String(item.date), key, stage: String(item.stage || '') });
        });
    });
    hearings.sort((left, right) => left.key.localeCompare(right.key));
    return hearings[0] || null;
}

export function firRegisterUrl(year, masterId, baseUrl) {
    const url = new URL('fir-register.html', baseUrl);
    url.searchParams.set('year', String(year));
    url.searchParams.set('fir', `master:${masterId}`);
    return `${url.pathname}${url.search}`;
}
