import { collection, getDocs, query, where } from 'firebase/firestore';
import { getCaseAccessContext, normalizeCaseRecord } from './fir-case-model.js';
import { isAuthorizedStation } from './fir-statusmap-model.mjs';

const FIR_MASTERS = 'firMasters';
const LINKED_CASES = 'linkedCases';
const LEGACY_CASES = 'cases';
const FIRESTORE_IN_LIMIT = 30;

function chunks(values, size) {
    const output = [];
    for (let index = 0; index < values.length; index += size) {
        output.push(values.slice(index, index + size));
    }
    return output;
}

export async function loadFirStatusMapContext(db) {
    const context = await getCaseAccessContext(db);
    return {
        stations: context.stations.slice().sort((left, right) => left.name.localeCompare(right.name)),
        stationIds: context.stationIds
    };
}

export async function loadFirStatusMapRecords(db, stationId, year, allowedStationIds) {
    if (!isAuthorizedStation((Array.isArray(allowedStationIds) ? allowedStationIds : []).map(id => ({ id })), stationId)) {
        throw new Error('You are not authorized to view this police station.');
    }
    if (!/^\d{4}$/.test(String(year))) throw new Error('Select a valid FIR year.');

    const [masterSnapshot, legacySnapshot] = await Promise.all([
        getDocs(query(
            collection(db, FIR_MASTERS),
            where('policeStationId', '==', stationId),
            where('firYear', '==', String(year))
        )),
        getDocs(query(
            collection(db, LEGACY_CASES),
            where('policeStationId', '==', stationId),
            where('firYear', '==', String(year))
        ))
    ]);
    const masters = masterSnapshot.docs.map(item => ({
        ...item.data(),
        id: item.id,
        _collectionName: FIR_MASTERS,
        recordType: 'fir_master'
    }));
    if (!masters.length) return { masters, proceedings: [] };

    const ids = masters.map(master => master.id);
    const linkedSnapshots = await Promise.all(chunks(ids, FIRESTORE_IN_LIMIT).map(masterIds => getDocs(query(
        collection(db, LINKED_CASES),
        where('policeStationId', '==', stationId),
        where('firMasterId', 'in', masterIds)
    ))));
    const uniqueLinked = new Map();
    linkedSnapshots.forEach(snapshot => snapshot.docs.forEach(item => {
        uniqueLinked.set(item.id, normalizeCaseRecord(item.data(), item.id, LINKED_CASES));
    }));
    const linkedRecords = [...uniqueLinked.values()];
    const masterIdSet = new Set(masters.map(master => master.id));
    const masterIdentities = new Set(masters.map(master => {
        const firNo = String(master.firNo ?? '').trim().toLocaleLowerCase();
        return firNo ? `${firNo}|${String(master.firYear)}|${stationId}` : '';
    }).filter(Boolean));
    const linkedLegacyIds = new Set(linkedRecords.map(record => String(record.legacyCaseId || '')).filter(Boolean));
    const legacyRecords = legacySnapshot.docs
        .map(item => normalizeCaseRecord(item.data(), item.id, LEGACY_CASES))
        .filter(record => {
            if (linkedLegacyIds.has(record.id)) return false;
            const relatedMasterId = String(record.firMasterId || record.firId || '');
            if (masterIdSet.has(relatedMasterId)) return true;
            const firNo = String(record.firNo ?? '').trim().toLocaleLowerCase();
            return firNo && masterIdentities.has(`${firNo}|${String(record.firYear)}|${stationId}`);
        });
    return { masters, proceedings: [...linkedRecords, ...legacyRecords] };
}
