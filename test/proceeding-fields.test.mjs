import test from 'node:test';
import assert from 'node:assert/strict';
import { proceedingFieldsFromForm, proceedingPayload } from '../assets/js/proceeding-fields.mjs';

function proceedingForm({ officer, accused, witness, highlighted }) {
    const values = new Map([
        ['iorank', [{ value: officer.rank }]],
        ['ioname', [{ value: officer.name }]],
        ['ioId', [{ value: officer.id }]],
        ['ioBeltno', [{ value: officer.belt }]],
        ['iomobileNo', [{ value: officer.mobile }]],
        ['highlightcase', [{ checked: highlighted }]],
        ['accused_name[]', [{ value: accused.name }]],
        ['accused_father_name[]', [{ value: accused.fatherName }]],
        ['accused_mobile[]', [{ value: accused.mobile }]],
        ['arrested[]', [{ checked: accused.arrested }]],
        ['arrestingdate[]', [{ value: accused.arrestDate }]],
        ['custody_status[]', [{ value: accused.custodyStatus }]],
        ['baildate[]', [{ value: accused.bailDate }]],
        ['po_status[]', [{ checked: accused.poStatus }]],
        ['po_date[]', [{ value: accused.poDate }]],
        ['accused_address[]', [{ value: accused.address }]],
        ['witness_name[]', [{ value: witness.name }]],
        ['witness_status[]', [{ value: witness.status }]],
        ['witness_examined[]', [{ checked: witness.examined }]],
        ['witness_examined_date[]', [{ value: witness.examinedDate }]]
    ]);
    return {
        querySelectorAll: selector => values.get(selector.slice(7, -2)) || [],
        elements: {
            namedItem: name => values.get(name)?.[0] || null
        }
    };
}

test('saving two proceedings preserves their independent IO, accused, witness and highlight data', () => {
    const masterFields = {
        firNo: '42',
        firYear: '2026',
        policeStationId: 'station-a'
    };
    const drafts = [
        {
            courtFields: proceedingFieldsFromForm(proceedingForm({
                officer: { rank: 'Inspector', name: 'Officer One', id: 'io-1', belt: '101', mobile: '111' },
                accused: { name: 'Accused One', fatherName: 'Parent One', mobile: '211', arrested: true, arrestDate: '01/01/2026', custodyStatus: 'bailed_court', bailDate: '02/01/2026', poStatus: false, poDate: '', address: 'Address One' },
                witness: { name: 'Witness One', status: 'Examined', examined: true, examinedDate: '03/01/2026' },
                highlighted: true
            }))
        },
        {
            courtFields: proceedingFieldsFromForm(proceedingForm({
                officer: { rank: 'Sub-Inspector', name: 'Officer Two', id: 'io-2', belt: '202', mobile: '222' },
                accused: { name: 'Accused Two', fatherName: 'Parent Two', mobile: '212', arrested: false, arrestDate: '', custodyStatus: '', bailDate: '', poStatus: true, poDate: '04/01/2026', address: 'Address Two' },
                witness: { name: 'Witness Two', status: 'Pending', examined: false, examinedDate: '' },
                highlighted: false
            }))
        }
    ];
    const saved = drafts.map(draft => proceedingPayload(masterFields, draft.courtFields));

    assert.equal(saved[0].ioName, 'Officer One');
    assert.equal(saved[1].ioName, 'Officer Two');
    assert.equal(saved[0].accused[0].name, 'Accused One');
    assert.equal(saved[1].accused[0].name, 'Accused Two');
    assert.equal(saved[0].witnesses[0].name, 'Witness One');
    assert.equal(saved[1].witnesses[0].name, 'Witness Two');
    assert.equal(saved[0].highlighted, true);
    assert.equal(saved[1].highlighted, false);
    assert.equal(saved[0].firNo, saved[1].firNo);
    assert.notEqual(saved[0].accused, saved[1].accused);
});
