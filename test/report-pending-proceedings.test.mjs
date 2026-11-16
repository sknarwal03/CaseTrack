import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculatePendingCourtProceedings,
    pendingCourtProceedingsExportRow
} from '../assets/js/report-pending-proceedings.mjs';

const linked = (id, status, extra = {}) => ({
    id,
    _collectionName: 'linkedCases',
    recordType: 'lower',
    status,
    firMasterId: 'fir-1',
    ...extra
});

test('counts recognized active statuses and exact In Progress alias', () => {
    for (const status of ['UT', ' Under Trial ', 'ui', ' Under Investigation ', 'In Progress', ' in progress ']) {
        assert.deepEqual(calculatePendingCourtProceedings([linked('case-1', status)]), {
            pendingCount: 1,
            unknownStatusCount: 0
        }, status);
    }
});

test('counts each distinct court proceeding for one FIR', () => {
    const result = calculatePendingCourtProceedings([
        linked('magistrate', 'UT', { courtType: 'Magistrate' }),
        linked('sessions', 'UT', { courtType: 'Sessions' }),
        linked('jjb', 'UI', { courtType: 'JJB' })
    ]);
    assert.deepEqual(result, { pendingCount: 3, unknownStatusCount: 0 });
});

test('excludes committed and disposed proceeding records individually', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('disposed', 'Disposed'),
        linked('active', 'UT'),
        linked('committed', 'Committed')
    ]), { pendingCount: 1, unknownStatusCount: 0 });
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('committed-1', 'Committed'),
        linked('committed-2', 'committed')
    ]), { pendingCount: 0, unknownStatusCount: 0 });
});

test('excludes UCR and cancellation records through the existing classifier', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        { ...linked('ucr-1', 'UCR'), recordType: 'ucr' },
        linked('untrace-1', 'Untrace'),
        linked('cancel-1', 'Cancellation'),
        linked('cancelled-1', 'Cancelled')
    ]), { pendingCount: 0, unknownStatusCount: 0 });
});

test('counts unknown and missing linked statuses separately for data-quality warning', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('unknown', 'Unknown'),
        linked('missing', ''),
        { ...linked('null', null), status: null }
    ]), { pendingCount: 0, unknownStatusCount: 3 });
});

test('does not infer a missing proceeding status from FIR-level caseStatus', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('missing-status', '', { caseStatus: 'UT', firStatus: 'UT' })
    ]), { pendingCount: 0, unknownStatusCount: 1 });
});

test('hearing dates and PO flags do not affect status-based eligibility', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('no-date', 'UT', { nextDate: '', poStatus: 'PO' }),
        linked('past', 'UT', { nextDate: '2001-01-01' }),
        linked('future', 'UT', { nextDate: '2099-01-01' }),
        linked('po-closed', 'Disposed', { poStatus: 'PO' })
    ]), { pendingCount: 3, unknownStatusCount: 0 });
});

test('deduplicates repeated document paths and existing legacyCaseId equivalents only', () => {
    const canonical = linked('canonical', 'UT', { legacyCaseId: 'legacy-1' });
    const result = calculatePendingCourtProceedings([
        canonical,
        { ...canonical },
        { id: 'legacy-1', _collectionName: 'cases', recordType: 'lower', status: 'UT' },
        linked('distinct-2', 'UT', { courtType: 'Sessions' })
    ]);
    assert.deepEqual(result, { pendingCount: 2, unknownStatusCount: 0 });
});

test('leaves separate document IDs distinct and does not group by FIR', () => {
    assert.deepEqual(calculatePendingCourtProceedings([
        linked('same-fir-case-1', 'UT'),
        linked('same-fir-case-2', 'UT'),
        { id: 'master', _collectionName: 'firMasters', recordType: 'fir_master', status: 'UT' }
    ]), { pendingCount: 2, unknownStatusCount: 0 });
});

test('export summary row uses the shared metric result and exact label', () => {
    assert.deepEqual(pendingCourtProceedingsExportRow({ pendingCount: 7 }), {
        section: 'Summary',
        item: 'Pending Court Proceedings',
        count: '7'
    });
});
