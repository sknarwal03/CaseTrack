import { isCourtProceeding, normalizeFirStatus } from './fir-status.mjs';

export const PENDING_COURT_PROCEEDINGS_LABEL = 'Pending Court Proceedings';

const LINKED_CASES_COLLECTION = 'linkedCases';
const LEGACY_CASES_COLLECTION = 'cases';

function deduplicateReportRecords(records) {
    const unique = [];
    const seenDocuments = new Set();

    for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
        if (!record || typeof record !== 'object') continue;
        const documentKey = record.id && record._collectionName
            ? `${record._collectionName}:${record.id}`
            : '';
        if (documentKey && seenDocuments.has(documentKey)) continue;
        if (documentKey) seenDocuments.add(documentKey);
        unique.push({ record, index });
    }

    const linkedLegacyIds = new Set(unique
        .filter(({ record }) => record._collectionName === LINKED_CASES_COLLECTION)
        .map(({ record }) => record.legacyCaseId)
        .filter(Boolean));

    return unique
        .filter(({ record }) => !(record._collectionName === LEGACY_CASES_COLLECTION
            && linkedLegacyIds.has(record.id)))
        .map(({ record }) => record);
}

function classifyProceedingStatus(record) {
    // Use only the normalized linked-record status. Do not fall back to
    // caseStatus/firStatus, which may have been populated from its parent FIR.
    const rawStatus = String(record.status ?? '').trim();
    if (!rawStatus) return 'unknown';

    const normalizedStatus = normalizeFirStatus(rawStatus);
    if (normalizedStatus === 'UI' || normalizedStatus === 'UT') return 'active';
    if (rawStatus.toLocaleLowerCase() === 'in progress') return 'active';
    if (rawStatus.toLocaleLowerCase() === 'committed' || normalizedStatus === 'Disposed') return 'terminal';
    return 'unknown';
}

export function calculatePendingCourtProceedings(records = []) {
    let pendingCount = 0;
    let unknownStatusCount = 0;

    for (const record of deduplicateReportRecords(records)) {
        if (!isCourtProceeding(record)) continue;
        const status = classifyProceedingStatus(record);
        if (status === 'active') pendingCount += 1;
        else if (status === 'unknown') unknownStatusCount += 1;
    }

    return { pendingCount, unknownStatusCount };
}

export function pendingCourtProceedingsExportRow(result) {
    return {
        section: 'Summary',
        item: PENDING_COURT_PROCEEDINGS_LABEL,
        count: String(result?.pendingCount ?? 0)
    };
}
