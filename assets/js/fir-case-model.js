import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { getAuth, getIdToken, onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { deriveFirStatus } from './fir-status.mjs';
import { usesStationScopedAccess, projectFunctionsEndpoint } from './firebase-project-policy.js';
export { usesStationScopedAccess } from './firebase-project-policy.js';

export const FIR_MASTERS_COLLECTION = 'firMasters';
export const FIR_IDENTITY_CLAIMS_COLLECTION = 'firIdentityClaims';
export const LINKED_CASES_COLLECTION = 'linkedCases';
export const LEGACY_CASES_COLLECTION = 'cases';
function waitForCurrentUser(auth) {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            resolve(user);
        }, error => {
            unsubscribe();
            reject(error);
        });
    });
}

export async function getCaseAccessContext(db) {
    if (!usesStationScopedAccess(db)) {
        throw new Error('The Firebase project is not approved for station-scoped application access.');
    }
    const user = await waitForCurrentUser(getAuth(db.app));
    if (!user) throw new Error('Sign in is required to access case data.');
    const roleSnapshot = await getDoc(doc(db, 'userRoles', user.uid));
    const role = roleSnapshot.exists() ? roleSnapshot.data() : null;
    if (role?.status !== 'active' || !['admin', 'operator'].includes(role.role)) {
        throw new Error('An active Admin or assigned Operator role is required to access case data.');
    }
    if (role.role === 'operator' && role.mustChangePassword === true) {
        throw new Error('Change your temporary password before accessing case data.');
    }

    let stations;
    if (role.role === 'admin') {
        const response = await fetch(projectFunctionsEndpoint(db.app.options.projectId, 'policeStations', import.meta.env?.MODE === 'role-admin-local'), {
            headers: { Authorization: `Bearer ${await getIdToken(user)}` }
        });
        if (!response.ok) {
            throw new Error(`Could not load authorized police stations (HTTP ${response.status}).`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload?.stations)
            || payload.stations.some(station => !station || typeof station.id !== 'string'
                || !/^[A-Za-z0-9_-]{1,128}$/.test(station.id)
                || typeof station.name !== 'string' || !station.name.trim())) {
            throw new Error('The authorized police station response is invalid.');
        }
        stations = payload.stations;
    } else {
        const stationId = role.policeStationId;
        if (typeof stationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(stationId)) {
            throw new Error('The active Operator role has no valid police station assignment.');
        }
        const stationSnapshot = await getDoc(doc(db, 'policeStations', stationId));
        const stationName = stationSnapshot.exists()
            ? String(stationSnapshot.data().name || '').trim()
            : '';
        if (!stationName) {
            throw new Error('The assigned police station could not be verified. Contact an administrator.');
        }
        stations = [{ id: stationId, name: stationName }];
    }

    return {
        user,
        role,
        stations,
        stationIds: [...new Set(stations.map(station => station.id))]
    };
}

function fileNumberFor(record = {}) {
    const firNo = String(record.firNo ?? '').trim();
    const firYear = String(record.firYear ?? '').trim();
    return String(record.fileNo || (firNo && firYear.length >= 2 ? `${firNo}/${firYear.slice(-2)}` : ''));
}

function normalizeIdentityValue(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase();
}

export function sameFirIdentity(left = {}, right = {}) {
    const firNoMatches = normalizeIdentityValue(left.firNo) && normalizeIdentityValue(right.firNo)
        && normalizeIdentityValue(left.firNo) === normalizeIdentityValue(right.firNo);
    const firYearMatches = normalizeIdentityValue(left.firYear) && normalizeIdentityValue(right.firYear)
        && normalizeIdentityValue(left.firYear) === normalizeIdentityValue(right.firYear);
    const leftStationId = String(left.policeStationId ?? '').trim();
    const rightStationId = String(right.policeStationId ?? '').trim();
    const stationMatches = leftStationId && rightStationId
        ? leftStationId === rightStationId
        : normalizeIdentityValue(left.policeStation) && normalizeIdentityValue(right.policeStation)
            && normalizeIdentityValue(left.policeStation) === normalizeIdentityValue(right.policeStation);
    return Boolean(firNoMatches && firYearMatches && stationMatches);
}

function duplicateIdentityError(matches = []) {
    const error = new Error('A matching FIR Master already exists. Select it after verifying its details.');
    error.code = 'fir-master/duplicate-match';
    error.matches = matches;
    return error;
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

function mergeCaseRecords(masterDocs, linkedDocs, legacyDocs) {
    const linked = linkedDocs.map(item => normalizeDocument(item, LINKED_CASES_COLLECTION, item.data()));
    const legacy = legacyDocs.map(item => normalizeDocument(item, LEGACY_CASES_COLLECTION, item.data()));
    const legacyIds = new Set(linked.map(item => item.legacyCaseId).filter(Boolean));
    const records = [...linked, ...legacy.filter(item => !legacyIds.has(item.id))];
    const mastersById = new Map(masterDocs.map(item => [item.id, item.data()]));
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
    const masters = masterDocs
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

export async function loadCaseRecords(db) {
    if (usesStationScopedAccess(db)) {
        return loadStationScopedCaseRecords(db);
    }

    const [masterSnapshot, linkedSnapshot, legacySnapshot] = await Promise.all([
        getDocs(collection(db, FIR_MASTERS_COLLECTION)),
        getDocs(collection(db, LINKED_CASES_COLLECTION)),
        getDocs(collection(db, LEGACY_CASES_COLLECTION))
    ]);
    return mergeCaseRecords(masterSnapshot.docs, linkedSnapshot.docs, legacySnapshot.docs);
}

async function loadStationScopedCaseRecords(db) {
    const { stationIds } = await getCaseAccessContext(db);
    const uniqueStationIds = [...new Set(stationIds)];
    if (uniqueStationIds.length === 0) return [];

    const masterSnapshots = await Promise.all(uniqueStationIds.map(stationId =>
        getDocs(query(
            collection(db, FIR_MASTERS_COLLECTION),
            where('policeStationId', '==', stationId)
        ))
    ));
    const mastersByStation = new Map(uniqueStationIds.map(stationId => [stationId, []]));
    masterSnapshots.flatMap(snapshot => snapshot.docs).forEach(master => {
        mastersByStation.get(master.data().policeStationId)?.push(master);
    });
    const linkedSnapshots = [];
    const legacySnapshots = await Promise.all(uniqueStationIds.map(stationId =>
        getDocs(query(
            collection(db, LEGACY_CASES_COLLECTION),
            where('policeStationId', '==', stationId)
        ))
    ));

    await Promise.all(uniqueStationIds.flatMap(stationId => {
        const stationMasters = mastersByStation.get(stationId) || [];
        return stationMasters.map(master =>
            getDocs(query(
                collection(db, LINKED_CASES_COLLECTION),
                where('policeStationId', '==', stationId),
                where('firMasterId', '==', master.id)
            )).then(snapshot => linkedSnapshots.push(snapshot))
        );
    }));

    const uniqueDocuments = snapshots => {
        const documents = new Map();
        snapshots.forEach(snapshot => snapshot.docs.forEach(item => {
            documents.set(item.ref.path, item);
        }));
        return [...documents.values()];
    };
    const masterDocs = uniqueDocuments(masterSnapshots);
    const linkedDocs = uniqueDocuments(linkedSnapshots);
    const legacyDocs = uniqueDocuments(legacySnapshots);
    return mergeCaseRecords(masterDocs, linkedDocs, legacyDocs);
}

export async function loadFirMasters(db) {
    if (usesStationScopedAccess(db)) {
        const { stationIds } = await getCaseAccessContext(db);
        const snapshots = await Promise.all(stationIds.map(stationId => getDocs(query(
            collection(db, FIR_MASTERS_COLLECTION),
            where('policeStationId', '==', stationId)
        ))));
        return snapshots.flatMap(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }
    const snapshot = await getDocs(collection(db, FIR_MASTERS_COLLECTION));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function loadRecordsForFir(db, firId) {
    if (!firId) return [];
    if (usesStationScopedAccess(db)) {
        const { stationIds } = await getCaseAccessContext(db);
        const masterSnapshots = await Promise.all(stationIds.map(stationId => getDocs(query(
            collection(db, FIR_MASTERS_COLLECTION),
            where('policeStationId', '==', stationId)
        ))));
        const masterDocs = masterSnapshots.flatMap(snapshot => snapshot.docs);
        const masterSnapshot = masterDocs.find(item => item.id === firId) || null;
        const master = masterSnapshot ? { id: masterSnapshot.id, ...masterSnapshot.data() } : null;
        const stationQueries = stationIds.flatMap(stationId => {
            const linkedQuery = master && master.policeStationId === stationId
                ? getDocs(query(
                    collection(db, LINKED_CASES_COLLECTION),
                    where('policeStationId', '==', stationId),
                    where('firMasterId', '==', master.id)
                ))
                : Promise.resolve(null);
            return [
                linkedQuery,
                getDocs(query(
                    collection(db, LEGACY_CASES_COLLECTION),
                    where('policeStationId', '==', stationId)
                ))
            ];
        });
        const snapshots = await Promise.all(stationQueries);
        const linkedSnapshots = snapshots.filter((snapshot, index) => index % 2 === 0 && snapshot);
        const legacySnapshots = snapshots.filter((snapshot, index) => index % 2 === 1);
        const linked = linkedSnapshots.flatMap(snapshot =>
            snapshot.docs.map(item => normalizeDocument(item, LINKED_CASES_COLLECTION, item.data()))
        );
        const legacy = legacySnapshots.flatMap(snapshot => snapshot.docs
            .filter(item => {
                const data = item.data();
                return data.firMasterId === firId || data.firId === firId
                    || item.id === firId || fileNumberFor(data) === firId
                    || (master && sameFirIdentity(data, master));
            })
            .map(item => normalizeDocument(item, LEGACY_CASES_COLLECTION, item.data()))
        );
        const records = [...linked, ...legacy];
        if (!master || !masterSnapshot) return records;
        const matchedLegacySnapshots = legacySnapshots.flatMap(snapshot =>
            snapshot.docs.filter(item => legacy.some(record => record.id === item.id))
        );
        return mergeCaseRecords([masterSnapshot], linkedSnapshots.flatMap(snapshot => snapshot.docs), matchedLegacySnapshots);
    }
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
    if (usesStationScopedAccess(db)) {
        const { stationIds } = await getCaseAccessContext(db);
        const requestedStationId = String(identity.policeStationId || '').trim();
        const scopedStationIds = requestedStationId
            ? stationIds.filter(stationId => stationId === requestedStationId)
            : stationIds;
        const snapshots = await Promise.all(scopedStationIds.map(stationId => getDocs(query(
            collection(db, LEGACY_CASES_COLLECTION),
            where('policeStationId', '==', stationId)
        ))));
        return legacyFirGroups(snapshots.flatMap(snapshot => snapshot.docs), identity);
    }
    const snapshot = await getDocs(collection(db, LEGACY_CASES_COLLECTION));
    return legacyFirGroups(snapshot.docs, identity);
}

function legacyFirGroups(documents, identity) {
    if (!identity.firNo || !identity.firYear || !identity.policeStation) return [];
    const groups = new Map();
    documents.forEach(item => {
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

export async function saveFirMaster(
    db,
    fields,
    firMasterId = '',
    { allowLegacyMatch = false, createMasterId = '' } = {}
) {
    const reference = firMasterId
        ? doc(db, FIR_MASTERS_COLLECTION, firMasterId)
        : createMasterId
            ? doc(db, FIR_MASTERS_COLLECTION, createMasterId)
            : doc(collection(db, FIR_MASTERS_COLLECTION));
    const identity = {
        firNo: String(fields.firNo || '').trim(),
        firYear: String(fields.firYear || '').trim(),
        policeStation: String(fields.policeStation || '').trim(),
        policeStationId: String(fields.policeStationId || '').trim()
    };
    if (!identity.firNo || !identity.firYear || !identity.policeStationId) {
        const error = new Error('FIR number, FIR year and stable police station ID are required for a unique FIR identity.');
        error.code = 'fir-master/identity-required';
        throw error;
    }

    try {
        const save = httpsCallable(getFunctions(db.app), 'saveFirMaster');
        await save({
            masterId: reference.id,
            isUpdate: Boolean(firMasterId),
            fields: { ...fields, ...identity },
            allowLegacyMatch
        });
    } catch (error) {
        if (error.code === 'functions/already-exists'
            && error.details?.reason === 'duplicate-identity') {
            throw duplicateIdentityError(error.details.matches || []);
        }
        if (error.code === 'functions/failed-precondition'
            && error.details?.reason === 'legacy-match') {
            const legacyError = new Error('Matching legacy records exist. Search, verify, and link them before creating a new FIR Master.');
            legacyError.code = 'fir-master/legacy-match';
            legacyError.matches = error.details.matches || [];
            throw legacyError;
        }
        if (error.code === 'functions/not-found' && firMasterId) {
            throw new Error('The FIR Master no longer exists. Reload it before saving.');
        }
        throw error;
    }
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
