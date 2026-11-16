import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
    buildCsv,
    buildPdfDefinition,
    buildXlsxBuffer,
    protectSpreadsheetText,
    selectExportRows,
    toExportText
} from '../assets/js/data-export.mjs';

const columns = [
    { header: 'FIR No.', key: 'firNo' },
    { header: 'Value', key: 'value' }
];

test('CSV includes UTF-8 BOM, text identifiers, unicode, and escaped quotes/newlines', () => {
    const csv = buildCsv(columns, [{ firNo: '0007/26', value: 'शुभेच्छा, "नमस्ते"\nदूसरी पंक्ति' }]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.match(csv, /"0007\/26"/);
    assert.match(csv, /"शुभेच्छा, ""नमस्ते""\nदूसरी पंक्ति"/);
});

test('CSV neutralizes spreadsheet formula prefixes and handles empty values/datasets', () => {
    for (const input of ['=1+1', ' +SUM(A1:A2)', '-cmd', '@value', '\t=1']) {
        assert.ok(protectSpreadsheetText(input).startsWith("'"));
    }
    assert.equal(protectSpreadsheetText(''), '');
    assert.equal(toExportText(null), '');
    assert.equal(buildCsv(columns, []), '\uFEFF"FIR No.","Value"');
});

test('date objects are formatted by local calendar date without UTC conversion', () => {
    const date = new Date(2026, 0, 5, 23, 45);
    assert.equal(toExportText(date), '2026-01-05');
});

test('filtered/all scope selects the whole matching set and is independent of visible pagination', () => {
    const authorizedRows = Array.from({ length: 27 }, (_, index) => ({ id: index + 1 }));
    const currentPage = authorizedRows.slice(0, 10);
    const matchingRows = authorizedRows.filter(row => row.id % 2 === 0);
    assert.equal(selectExportRows({ allRows: authorizedRows, filteredRows: matchingRows, scope: 'filtered' }).length, 13);
    assert.equal(selectExportRows({ allRows: authorizedRows, filteredRows: currentPage, scope: 'all' }).length, 27);
    assert.throws(() => selectExportRows({ scope: 'everything' }), /valid export scope/);
});

test('XLSX is a readable workbook with identifiers and user data stored as text', async () => {
    const buffer = await buildXlsxBuffer(columns, [
        { firNo: '0007/26', value: 'हिंदी, "case"\ncontinued' },
        { firNo: '', value: '=1+1' }
    ], { sheetName: 'Cases' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Cases');
    assert.equal(sheet.getRow(1).getCell(1).value, 'FIR No.');
    assert.equal(sheet.getRow(2).getCell(1).value, '0007/26');
    assert.equal(sheet.getRow(2).getCell(1).type, ExcelJS.ValueType.String);
    assert.equal(sheet.getRow(2).getCell(2).value, 'हिंदी, "case"\ncontinued');
    assert.equal(sheet.getRow(3).getCell(2).type, ExcelJS.ValueType.String);
    assert.equal(sheet.getRow(3).getCell(2).formula, undefined);
    assert.equal(sheet.views[0].ySplit, 1);
});

test('PDF definition requests repeated headers, landscape layout for wide tables, and unicode rows', () => {
    const definition = buildPdfDefinition({
        title: 'All Cases', exportedAt: '15 Nov 2026, 10:00', scopeLabel: 'Filtered Records', context: 'Status filter: Pending',
        columns: Array.from({ length: 5 }, (_, index) => ({ header: `Column ${index}`, key: `c${index}` })),
        rows: [{ c0: '0003', c1: 'दिल्ली', c2: '', c3: 'Court', c4: '2026-11-15' }]
    });
    const table = definition.content.find(item => item.table);
    assert.equal(definition.pageOrientation, 'landscape');
    assert.equal(table.table.headerRows, 1);
    assert.equal(table.table.body[1][0].text, '0003');
    assert.equal(table.table.body[1][1].text, 'दिल्ली');
    assert.equal(definition.defaultStyle.font, 'CaseTrack');
    assert.ok(definition.content[1].text.includes('Filtered Records'));
});

test('empty PDF dataset produces a useful empty state', () => {
    const definition = buildPdfDefinition({
        title: 'Report', exportedAt: 'today', scopeLabel: 'All Records',
        columns: [{ header: 'Section', key: 'section' }], rows: []
    });
    assert.ok(definition.content.some(item => item.text === 'No records to export.'));
});
