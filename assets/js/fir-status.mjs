const STATUS_ALIASES = new Map([
    ['ui', 'UI'], ['under investigation', 'UI'],
    ['ucr', 'UCR'], ['untrace', 'UCR'], ['untraced', 'UCR'],
    ['cancelled', 'Cancelled'], ['canceled', 'Cancelled'], ['cancellation', 'Cancelled'],
    ['ut', 'UT'], ['under trial', 'UT'],
    ['disposed', 'Disposed']
]);

export function normalizeFirStatus(value) {
    const key = String(value ?? '').trim().toLocaleLowerCase();
    return STATUS_ALIASES.get(key) || '';
}

export function isCourtProceeding(record = {}) {
    const type = String(record.recordType || '').trim().toLocaleLowerCase();
    if (type === 'fir_master' || String(record._collectionName || '') === 'firMasters') return false;
    const status = String(record.status || '').trim().toLocaleLowerCase();
    return type !== 'ucr'
        && !['ucr', 'untrace', 'untraced', 'cancellation', 'cancelled', 'canceled'].includes(status)
        && !record.ucrNumber;
}

export function deriveFirStatus(master = {}, proceedings = []) {
    const courtCases = (Array.isArray(proceedings) ? proceedings : []).filter(isCourtProceeding);
    if (courtCases.length) {
        const statuses = courtCases.map(item => String(item.status || item.caseStatus || '').trim().toLocaleLowerCase());
        const hasUnderTrial = statuses.some(status => !['committed', 'disposed'].includes(status));
        if (hasUnderTrial) return 'UT';
        if (statuses.every(status => status === 'committed')) return 'UT';
        return 'Disposed';
    }

    const ucrRecords = (Array.isArray(proceedings) ? proceedings : []).filter(item => !isCourtProceeding(item));
    const ucrType = String(ucrRecords[ucrRecords.length - 1]?.report_type
        || ucrRecords[ucrRecords.length - 1]?.ucrType
        || master.report_type
        || master.ucrType
        || '').trim().toLocaleLowerCase();
    if (['cancelled', 'canceled', 'cancellation'].includes(ucrType)) return 'Cancelled';
    if (['untraced', 'untrace', 'ucr'].includes(ucrType)) return 'UCR';
    return 'UI';
}
