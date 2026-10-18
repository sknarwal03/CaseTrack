import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import { deriveFirStatus } from './fir-status.mjs';

export const FIR_MASTERS_COLLECTION = 'firMasters';
export const LINKED_CASES_COLLECTION = 'linkedCases';
export const LEGACY_CASES_COLLECTION = 'cases';

function fileNumberFor(record = {}) {
    const firNo = String(record.firNo ?? '').trim();
    const firYear = String(record.firYear ?? '').trim();
    return String(record.fileNo || (firNo && firYear.length >= 2 ? `${firNo}/${firYear.slice(-2)}` : ''));
}

export function sameFirIdentity(left = {}, right = {}) {
    const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase();
    const firNoMatches = normalize(left.firNo) && normalize(right.firNo)
        && normalize(left.firNo) === normalize(right.firNo);
    const firYearMatches = normalize(left.firYear) && normalize(right.firYear)
        && normalize(left.firYear) === normalize(right.firYear);
    const leftStationId = normalize(left.policeStationId);
    const rightStationId = normalize(right.policeStationId);
    const stationMatches = leftStationId && rightStationId
        ? leftStationId === rightStationId
        : normalize(left.policeStation) && normalize(right.policeStation)
            && normalize(left.policeStation) === normalize(right.policeStation);
    return Boolean(firNoMatches && firYearMatches && stationMatches);
}

function normalizeDocument(snapshot, collectionName, data) {
    const record = { ...data };
    return {
        ...record,
        id: snapshot.id,
        _collectionName: collectionName,
        fileNo: fileNumberFor(record),
        status: record.status ?? record.caseStatus ?? '',
        firStatus: record.firStatus ?? record.fir_Status ?? '',
        caseStatus: record.caseStatus ?? record.status ?? record.firStatus ?? '',
        caseStage: record.caseStage ?? record.trialStage ?? '',
        recordType: record.recordType || (record.ucrNumber ? 'ucr' : undefined)
    };
}

export async function loadCaseRecords(db) {
    const [masterSnapshot, linkedSnapshot, legacySnapshot] = await Promise.all([
        getDocs(collection(db, FIR_MASTERS_COLLECTION)),
        getDocs(collection(db, LINKED_CASES_COLLECTION)),
        getDocs(collection(db, LEGACY_CASES_COLLECTION))
    ]);
    const linked = linkedSnapshot.docs.map(item => normalizeDocument(item, LINKED_CASES_COLLECTION, item.data()));
    const legacy = legacySnapshot.docs.map(item => normalizeDocument(item, LEGACY_CASES_COLLECTION, item.data()));
    const legacyIds = new Set(linked.map(item => item.legacyCaseId).filter(Boolean));
    const records = [...linked, ...legacy.filter(item => !legacyIds.has(item.id))];
    const mastersById = new Map(masterSnapshot.docs.map(item => [item.id, item.data()]));
    records.forEach(record => {
        const master = mastersById.get(record.firMasterId || record.firId);
        if (!master) return;
        ['firNo', 'firYear', 'fileNo', 'firDate', 'policeStation', 'policeStationId', 'underSection', 'crimeHead', 'incidentDate', 'beatDetails',
            'incidentPlace', 'complainantName', 'complainantFatherName', 'complainantMobile', 'complainantAddress']
            .forEach(key => { record[key] = master[key] ?? (key === 'fileNo' ? fileNumberFor(master) : record[key]) ?? ''; });
        record.firStatus = master.firStatus || master.status || record.firStatus || '';
        record.caseStatus = record.status || record.firStatus;
        record.firMasterId = record.firMasterId || record.firId;
    });
    const representedFirIds = new Set(records.map(item => item.firMasterId || item.firId).filter(Boolean));
    const masters = masterSnapshot.docs
        .filter(item => !representedFirIds.has(item.id))
        .map(item => ({
            id: item.id,
            ...item.data(),
            fileNo: fileNumberFor(item.data()),
            status: item.data().firStatus || item.data().status || 'UI',
            firStatus: item.data().firStatus || item.data().status || 'UI',
            caseStatus: item.data().firStatus || item.data().status || 'UI',
            recordType: 'fir_master',
            _collectionName: FIR_MASTERS_COLLECTION
        }));
    return [...records, ...masters];
}

export async function loadFirMasters(db) {
    const snapshot = await getDocs(collection(db, FIR_MASTERS_COLLECTION));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function loadRecordsForFir(db, firId) {
    if (!firId) return [];
    const [linkedByFirId, linkedByMasterId, legacyByFirId, legacyByMasterId, masterSnapshot] = await Promise.all([
        getDocs(query(collection(db, LINKED_CASES_COLLECTION), where('firId', '==', firId))),
        getDocs(query(collection(db, LINKED_CASES_COLLECTION), where('firMasterId', '==', firId))),
        getDocs(query(collection(db, LEGACY_CASES_COLLECTION), where('firId', '==', firId))),
        getDocs(query(collection(db, LEGACY_CASES_COLLECTION), where('firMasterId', '==', firId))),
        getDoc(doc(db, FIR_MASTERS_COLLECTION, firId))
    ]);
    const uniqueDocs = (collectionName, snapshots) => {
        const byId = new Map();
        snapshots.forEach(snapshot => snapshot.docs.forEach(item => byId.set(item.id, item)));
        return [...byId.values()].map(item => normalizeDocument(item, collectionName, item.data()));
    };
    const linked = uniqueDocs(LINKED_CASES_COLLECTION, [linkedByFirId, linkedByMasterId]);
    const legacyIds = new Set(linked.map(item => item.legacyCaseId).filter(Boolean));
    const records = [
        ...linked,
        ...uniqueDocs(LEGACY_CASES_COLLECTION, [legacyByFirId, legacyByMasterId])
            .filter(item => !legacyIds.has(item.id))
    ];
    if (masterSnapshot.exists()) {
        const master = masterSnapshot.data();
        records.forEach(record => {
            ['firNo', 'firYear', 'fileNo', 'firDate', 'policeStation', 'policeStationId', 'underSection', 'crimeHead', 'incidentDate', 'beatDetails',
                'incidentPlace', 'complainantName', 'complainantFatherName', 'complainantMobile', 'complainantAddress']
                .forEach(key => { record[key] = master[key] ?? (key === 'fileNo' ? fileNumberFor(master) : record[key]) ?? ''; });
            record.firStatus = master.firStatus || master.status || record.firStatus || '';
            record.firMasterId = firId;
        });
    }
    return records;
}

export async function findFirMasterMatches(db, identity) {
    const masters = await loadFirMasters(db);
    return masters.filter(master => sameFirIdentity(master, identity));
}

export async function findLegacyFirGroups(db, identity) {
    const snapshot = await getDocs(collection(db, LEGACY_CASES_COLLECTION));
    if (!identity.firNo || !identity.firYear || !identity.policeStation) return [];
    const groups = new Map();
    snapshot.docs.forEach(item => {
        const data = item.data();
        if (data.firMasterId) return;
        if (!sameFirIdentity(data, identity)) return;
        const key = String(data.firId || `legacy:${item.id}`);
        if (!groups.has(key)) groups.set(key, { legacyFirId: data.firId || '', records: [] });
        groups.get(key).records.push({ id: item.id, ...data });
    });
    return [...groups.entries()].map(([id, group]) => ({
        id,
        ...group,
        firNo: group.records[0]?.firNo || '',
        firYear: group.records[0]?.firYear || '',
        policeStation: group.records[0]?.policeStation || '',
        policeStationId: group.records[0]?.policeStationId || '',
        fileNo: fileNumberFor(group.records[0] || {}),
        firDate: group.records[0]?.firDate || '',
        firStatus: group.records[0]?.firStatus || group.records[0]?.fir_Status || 'UI',
        underSection: group.records[0]?.underSection || '',
        crimeHead: group.records[0]?.crimeHead || '',
        incidentDate: group.records[0]?.incidentDate || '',
        incidentPlace: group.records[0]?.incidentPlace || '',
        beatDetails: group.records[0]?.beatDetails || '',
        complainantName: group.records[0]?.complainantName || '',
        complainantFatherName: group.records[0]?.complainantFatherName || '',
        complainantMobile: group.records[0]?.complainantMobile || '',
        complainantAddress: group.records[0]?.complainantAddress || ''
    }));
}

export async function saveFirMaster(db, fields, firMasterId = '', { allowLegacyMatch = false } = {}) {
    const reference = firMasterId
        ? doc(db, FIR_MASTERS_COLLECTION, firMasterId)
        : doc(collection(db, FIR_MASTERS_COLLECTION));
    const identity = {
        firNo: String(fields.firNo || '').trim(),
        firYear: String(fields.firYear || '').trim(),
        policeStation: String(fields.policeStation || '').trim(),
        policeStationId: String(fields.policeStationId || '').trim()
    };
    const matches = await findFirMasterMatches(db, identity);
    const duplicate = matches.find(item => item.id !== reference.id);
    if (!firMasterId && duplicate) {
        const error = new Error('A matching FIR Master already exists. Select it after verifying its details.');
        error.code = 'fir-master/duplicate-match';
        error.matches = matches;
        throw error;
    }
    if (!firMasterId && !allowLegacyMatch) {
        const legacyMatches = await findLegacyFirGroups(db, identity);
        if (legacyMatches.length) {
            const error = new Error('Matching legacy records exist. Search, verify, and link them before creating a new FIR Master.');
            error.code = 'fir-master/legacy-match';
            error.matches = legacyMatches;
            throw error;
        }
    }
    const data = { ...fields, ...identity, updatedAt: new Date() };
    if (firMasterId) await updateDoc(reference, data);
    else await setDoc(reference, { ...data, createdAt: new Date() });
    return reference.id;
}

export function caseRecordRef(db, caseItem) {
    const collectionName = caseItem?._collectionName || LEGACY_CASES_COLLECTION;
    if (!caseItem?.id) throw new Error('A saved case record ID is required.');
    return doc(db, collectionName, caseItem.id);
}

export function normalizeCaseRecord(data, id, collectionName = LEGACY_CASES_COLLECTION) {
    return normalizeDocument({ id }, collectionName, data);
}

export function getFirSummaries(records = []) {
    const grouped = new Map();
    (Array.isArray(records) ? records : []).forEach(record => {
        let key;
        if (record.recordType === 'fir_master' || record._collectionName === FIR_MASTERS_COLLECTION) {
            key = `master:${record.id}`;
        } else {
            const masterId = record.firMasterId
                || (record._collectionName === LINKED_CASES_COLLECTION ? record.firId : '');
            if (masterId) key = `master:${masterId}`;
            else {
                const firNo = String(record.firNo || '').trim();
                const firYear = String(record.firYear || '').trim();
                const policeStation = String(record.policeStation || '').trim();
                key = firNo && firYear && policeStation
                    ? `legacy:${firNo.toLocaleLowerCase()}|${firYear}|${policeStation.toLocaleLowerCase()}`
                    : `record:${record._collectionName || 'cases'}:${record.id}`;
            }
        }
        if (!grouped.has(key)) grouped.set(key, { master: null, proceedings: [] });
        const group = grouped.get(key);
        if (record.recordType === 'fir_master' || record._collectionName === FIR_MASTERS_COLLECTION) group.master = record;
        else group.proceedings.push(record);
    });
    return [...grouped.values()].map(group => {
        const base = group.master || group.proceedings[0] || {};
        const firStatus = deriveFirStatus(group.master || base, group.proceedings);
        return { ...base, firStatus, caseStatus: firStatus };
    });
}

export function countUniqueFirs(records = []) {
    return getFirSummaries(records).length;
}
