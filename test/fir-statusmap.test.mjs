import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildFirStatusMap,
    firStatusMapColorForStatus,
    firNumberValue,
    firRegisterUrl,
    isAuthorizedStation,
    nextHearingFor
} from '../assets/js/fir-statusmap-model.mjs';

const master = (id, firNo, extra = {}) => ({
    id,
    firNo,
    firYear: '2026',
    policeStationId: 'station-1',
    policeStation: 'Central Station',
    firDate: '2026-02-03',
    underSection: 'IPC 302',
    _collectionName: 'firMasters',
    recordType: 'fir_master',
    ...extra
});

const linked = (id, firMasterId, status, extra = {}) => ({
    id,
    firMasterId,
    firYear: '2026',
    policeStationId: 'station-1',
    _collectionName: 'linkedCases',
    recordType: 'lower',
    status,
    ...extra
});

test('premium status palette maps exactly and preserves unknown as neutral', () => {
    assert.equal(firStatusMapColorForStatus('Under Investigation'), '#5B8DEF');
    assert.equal(firStatusMapColorForStatus('UI'), '#5B8DEF');
    assert.equal(firStatusMapColorForStatus('Untraced'), '#E6B84A');
    assert.equal(firStatusMapColorForStatus('Cancellation'), '#E6B84A');
    assert.equal(firStatusMapColorForStatus('Under Trial'), '#E66A73');
    assert.equal(firStatusMapColorForStatus('Disposed'), '#42B883');
    assert.equal(firStatusMapColorForStatus('Unknown legacy status'), null);
});

test('statusmap cells, legend, counters, and popup share the approved CSS color tokens', async () => {
    const css = await readFile(new URL('../assets/css/fir-statusmap.css', import.meta.url), 'utf8');
    const html = await readFile(new URL('../pages/fir-statusmap.html', import.meta.url), 'utf8');
    const expected = {
        ui: '#5B8DEF',
        ucr: '#E6B84A',
        ut: '#E66A73',
        disposed: '#42B883'
    };
    Object.entries(expected).forEach(([status, color]) => {
        const token = `--fir-statusmap-${status}`;
        const tokenMatch = css.match(new RegExp(`${token}:\\s*(#[0-9A-F]{6})`));
        assert.equal(tokenMatch?.[1], color);
        assert.ok(html.includes(`fill="${color}"`), `seal motif should use the ${status} palette color`);
        assert.match(css, new RegExp(`\\.legend-swatch\\.status-${status}[^{}]*\\{[^}]*var\\(${token}\\)`));
        assert.match(css, new RegExp(`\\.summary-card\\[data-status="${status}"\\][^{}]*\\{[^}]*var\\(${token}\\)`));
        assert.match(css, new RegExp(`\\.statusmap-cell\\.status-${status}[^{}]*\\{[^}]*var\\(${token}\\)`));
        assert.match(css, new RegExp(`\\.dialog-status\\.status-${status}[^{}]*\\{[^}]*var\\(${token}\\)`));
    });
});

test('a registered FIR without proceedings follows the canonical UI rule', () => {
    const model = buildFirStatusMap({ masters: [master('m1', '1')], stationId: 'station-1', year: '2026' });
    assert.equal(model.cells[0].firStatus, 'UI');
    assert.equal(model.cells[0].color, '#5B8DEF');
    assert.equal(model.counts.underInvestigation, 1);
});

test('UCR and cancellation records use the premium gold color', () => {
    const model = buildFirStatusMap({
        masters: [master('m1', '1'), master('m2', '2')],
        proceedings: [
            linked('ucr1', 'm1', 'UCR', { recordType: 'ucr', ucrNumber: '17', report_type: 'Untraced' }),
            linked('ucr2', 'm2', 'UCR', { recordType: 'ucr', ucrNumber: '18', report_type: 'Cancellation' })
        ],
        stationId: 'station-1',
        year: '2026'
    });
    assert.deepEqual(model.cells.slice(0, 2).map(cell => cell.color), ['#E6B84A', '#E6B84A']);
    assert.equal(model.counts.ucr, 2);
});

test('any applicable active linked court case keeps FIR status UT and red', () => {
    const model = buildFirStatusMap({
        masters: [master('m1', '1')],
        proceedings: [linked('lower', 'm1', 'Disposed'), linked('session', 'm1', 'UT', { recordType: 'session' })],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.cells[0].firStatus, 'UT');
    assert.equal(model.cells[0].color, '#E66A73');
    assert.equal(model.counts.underTrial, 1);
});

test('Disposed is green only when all applicable court proceedings meet canonical disposal rules', () => {
    const allDisposed = buildFirStatusMap({
        masters: [master('m1', '1')],
        proceedings: [
            linked('lower', 'm1', 'Disposed'),
            linked('session', 'm1', 'Disposed', { recordType: 'session' }),
            linked('ucr', 'm1', 'UCR', { recordType: 'ucr', ucrNumber: '22', report_type: 'Untraced' })
        ],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(allDisposed.cells[0].firStatus, 'Disposed');
    assert.equal(allDisposed.cells[0].color, '#42B883');

    const committedOnly = buildFirStatusMap({
        masters: [master('m2', '2')],
        proceedings: [linked('lower-committed', 'm2', 'Committed')],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(committedOnly.cells[1].firStatus, 'UT');
    assert.equal(committedOnly.cells[1].color, '#E66A73');
});

test('legacy proceedings associated by FIR identity contribute to canonical status', () => {
    const model = buildFirStatusMap({
        masters: [master('m1', '1')],
        proceedings: [{
            id: 'legacy-1',
            _collectionName: 'cases',
            recordType: 'lower',
            status: 'Disposed',
            firNo: '1',
            firYear: '2026',
            policeStationId: 'station-1'
        }],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.cells[0].firStatus, 'Disposed');
    assert.equal(model.cells[0].color, '#42B883');
});

test('linked legacy counterparts are not counted twice during status derivation', () => {
    const model = buildFirStatusMap({
        masters: [master('m1', '1')],
        proceedings: [
            linked('linked-1', 'm1', 'Disposed', { legacyCaseId: 'legacy-1' }),
            {
                id: 'legacy-1',
                _collectionName: 'cases',
                recordType: 'lower',
                status: 'UT',
                firNo: '1',
                firYear: '2026',
                policeStationId: 'station-1'
            }
        ],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.cells[0].firStatus, 'Disposed');
});

test('year and authorized station filtering uses the complete FIR identity scope', () => {
    const model = buildFirStatusMap({
        masters: [
            master('m1', '1'),
            master('other-year', '2', { firYear: '2025' }),
            master('other-station', '3', { policeStationId: 'station-2' })
        ],
        proceedings: [linked('cross-station', 'm1', 'Disposed', { policeStationId: 'station-2' })],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.maxNumber, 1);
    assert.equal(model.cells[0].firStatus, 'UI');
    assert.equal(isAuthorizedStation([{ id: 'station-1' }], 'station-1'), true);
    assert.equal(isAuthorizedStation([{ id: 'station-1' }], 'station-2'), false);
});

test('sequential grid includes missing FIR numbers and preserves stored leading zeroes', () => {
    const model = buildFirStatusMap({
        masters: [master('m1', '001'), master('m3', '003')],
        stationId: 'station-1',
        year: '2026'
    });
    assert.deepEqual(model.cells.map(cell => [cell.displayNumber, cell.registered]), [
        ['001', true], ['002', false], ['003', true]
    ]);
    assert.equal(model.cells[1].status, 'FIR Not Registered');
    assert.equal(model.cells[1].color, null);
    assert.equal(model.counts.missingFirNumbers, 1);
});

test('duplicate numbers make one neutral outlined cell and are reported separately', () => {
    const model = buildFirStatusMap({
        masters: [master('m2', '1'), master('m1', '01')],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.cells.length, 1);
    assert.equal(model.cells[0].color, null);
    assert.equal(model.cells[0].statusCategory, 'other');
    assert.equal(model.cells[0].duplicateMasters.length, 1);
    assert.equal(model.counts.totalRegistered, 1);
    assert.equal(model.counts.duplicateRecords, 1);
});

test('registered records without a valid number remain visible and count as registered', () => {
    const model = buildFirStatusMap({
        masters: [master('unnumbered', '', { underSection: 'IPC 379' })],
        stationId: 'station-1',
        year: '2026'
    });
    assert.equal(model.cells.length, 0);
    assert.equal(model.unnumbered.length, 1);
    assert.equal(model.counts.totalRegistered, 1);
    assert.equal(model.counts.underInvestigation, 1);
});

test('invalid, zero, and unsafe FIR numbers are not placed in the sequence', () => {
    assert.equal(firNumberValue('0007'), 7);
    assert.equal(firNumberValue('0'), null);
    assert.equal(firNumberValue('12-A'), null);
    assert.equal(firNumberValue('9007199254740992'), null);
});

test('FIR details link preserves year and opens the existing FIR Register record', () => {
    assert.equal(
        firRegisterUrl('2024', 'master-abc', 'https://example.test/CaseTrack/pages/fir-statusmap.html'),
        '/CaseTrack/pages/fir-register.html?year=2024&fir=master%3Amaster-abc'
    );
});

test('next hearing selects the earliest current/future next entry across linked proceedings', () => {
    assert.deepEqual(nextHearingFor([
        { nextDate: '01/12/2026', trialStage: 'Evidence' },
        { hearingDateRecord: [
            { kind: 'previous', date: '2026-11-01' },
            { kind: 'next', date: '2026-11-20', trialStage: 'Arguments' }
        ] }
    ], new Date(2026, 10, 1)), { date: '2026-11-20', key: '2026-11-20', stage: 'Arguments' });
});

test('a 1,000 FIR year builds one sequence without duplicate slots', () => {
    const masters = Array.from({ length: 1000 }, (_, index) => master(`m${index + 1}`, String(index + 1)));
    const model = buildFirStatusMap({ masters, stationId: 'station-1', year: '2026' });
    assert.equal(model.cells.length, 1000);
    assert.equal(model.counts.totalRegistered, 1000);
    assert.equal(model.counts.underInvestigation, 1000);
    assert.equal(model.counts.missingFirNumbers, 0);
});
