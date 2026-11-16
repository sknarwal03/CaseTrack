const DANGEROUS_SPREADSHEET_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;

export function toExportText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return String(value);
}

export function protectSpreadsheetText(value) {
    const text = toExportText(value);
    return DANGEROUS_SPREADSHEET_PREFIX.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
}

export function selectExportRows({ allRows = [], filteredRows = [], scope = 'filtered' } = {}) {
    if (scope === 'all') return [...allRows];
    if (scope === 'filtered') return [...filteredRows];
    throw new Error('Choose a valid export scope.');
}

export function buildCsv(columns, rows) {
    const lines = [columns.map(column => column.header), ...rows.map(row =>
        columns.map(column => protectSpreadsheetText(row[column.key]))
    )];
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    return `\uFEFF${lines.map(line => line.map(quote).join(',')).join('\r\n')}`;
}

export async function buildXlsxBuffer(columns, rows, { sheetName = 'Export' } = {}) {
    const exceljs = await import('exceljs');
    const Workbook = exceljs.default?.Workbook || exceljs.Workbook;
    const workbook = new Workbook();
    workbook.creator = 'CaseTrack';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(sheetName.replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31).trim() || 'Export');
    worksheet.columns = columns.map(column => ({
        header: column.header,
        key: column.key,
        width: column.width || Math.min(Math.max(column.header.length + 4, 14), 34),
        style: { numFmt: '@' }
    }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F35' } };
    rows.forEach(row => {
        const output = {};
        columns.forEach(column => { output[column.key] = toExportText(row[column.key]); });
        worksheet.addRow(output);
    });
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    return workbook.xlsx.writeBuffer();
}

export function buildPdfDefinition({ title, exportedAt, scopeLabel, context = '', columns, rows }) {
    const tableBody = [
        columns.map(column => ({ text: column.header, style: 'tableHeader' })),
        ...rows.map(row => columns.map(column => ({ text: toExportText(row[column.key]), style: 'tableCell' })))
    ];
    return {
        pageOrientation: columns.length > 4 ? 'landscape' : 'portrait',
        pageMargins: [28, 44, 28, 40],
        defaultStyle: { font: 'CaseTrack', fontSize: 8 },
        header: () => ({ text: 'CaseTrack', alignment: 'right', color: '#64748b', margin: [0, 16, 28, 0], fontSize: 8 }),
        footer: (currentPage, pageCount) => ({ text: `${currentPage} / ${pageCount}`, alignment: 'center', color: '#64748b', margin: [0, 12, 0, 0], fontSize: 8 }),
        content: [
            { text: title, fontSize: 17, bold: true, color: '#173f35', margin: [0, 0, 0, 4] },
            { text: `Exported ${exportedAt} · ${scopeLabel}`, color: '#475569', fontSize: 9, margin: [0, 0, 0, 4] },
            ...(context ? [{ text: context, color: '#475569', fontSize: 8, margin: [0, 0, 0, 12] }] : [{ text: '', margin: [0, 0, 0, 8] }]),
            ...(rows.length ? [{
                table: { headerRows: 1, widths: columns.map(() => '*'), body: tableBody },
                layout: {
                    fillColor: rowIndex => rowIndex === 0 ? '#173f35' : rowIndex % 2 ? '#f1f5f9' : null,
                    hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1', paddingLeft: () => 5,
                    paddingRight: () => 5, paddingTop: () => 4, paddingBottom: () => 4
                }
            }] : [{ text: 'No records to export.', italics: true, color: '#64748b', margin: [0, 12, 0, 0] }])
        ],
        styles: {
            tableHeader: { bold: true, color: '#ffffff', fontSize: 8 },
            tableCell: { fontSize: 7.5, color: '#172033' }
        }
    };
}

async function pdfMakeWithDevanagari() {
    const [{ default: pdfMake }, fontUrl] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('../fonts/NotoSansDevanagari.ttf?url')
    ]);
    const response = await fetch(fontUrl.default || fontUrl);
    if (!response.ok) throw new Error('The PDF font could not be loaded.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const customVfs = { 'NotoSansDevanagari.ttf': btoa(binary) };
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(customVfs);
    const customFont = { CaseTrack: { normal: 'NotoSansDevanagari.ttf', bold: 'NotoSansDevanagari.ttf', italics: 'NotoSansDevanagari.ttf', bolditalics: 'NotoSansDevanagari.ttf' } };
    if (typeof pdfMake.addFonts === 'function') pdfMake.addFonts(customFont);
    return pdfMake;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadExport({ format, columns, rows, filename, title, scopeLabel, context = '', exportedAt }) {
    if (!['csv', 'xlsx', 'pdf'].includes(format)) throw new Error('Choose a valid file format.');
    if (format === 'csv') {
        downloadBlob(new Blob([buildCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
        return;
    }
    if (format === 'xlsx') {
        const buffer = await buildXlsxBuffer(columns, rows, { sheetName: title });
        downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
        return;
    }
    const pdfMake = await pdfMakeWithDevanagari();
    const definition = buildPdfDefinition({ title, exportedAt, scopeLabel, context, columns, rows });
    pdfMake.createPdf(definition).download(`${filename}.pdf`);
}
