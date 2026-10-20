function parseCalendarDate(value) {
    const trimmed = String(value || '').trim();
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
        || trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const [year, month, day] = trimmed.includes('-')
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : [Number(match[3]), Number(match[2]), Number(match[1])];
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

export function latestTrialStage(records, fallback = '') {
    let latest = null;

    (Array.isArray(records) ? records : []).forEach(record => {
        const stage = record?.trialStage;
        if (!String(stage || '').trim()) return;

        const date = parseCalendarDate(record?.date);
        if (date && (!latest || date.getTime() > latest.date.getTime())) {
            latest = { date, stage };
        }
    });

    return latest?.stage || fallback;
}

export function latestChargeDate(records) {
    let latestDate = null;

    (Array.isArray(records) ? records : []).forEach(record => {
        if (String(record?.trialStage || '').trim().toLowerCase() !== 'charge') return;
        const date = parseCalendarDate(record.date);
        if (date && (!latestDate || date.getTime() > latestDate.getTime())) latestDate = date;
    });

    if (!latestDate) return '';
    const year = latestDate.getFullYear();
    const month = String(latestDate.getMonth() + 1).padStart(2, '0');
    const day = String(latestDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
