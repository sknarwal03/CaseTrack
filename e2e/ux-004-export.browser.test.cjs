const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ExcelJS = require('../node_modules/exceljs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:5174';
const CHROME = process.env.CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--disable-gpu', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 320, height: 760 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    try {
        await page.goto(`${ORIGIN}/CaseTrack/test/fixtures/export-smoke.html`);
        await page.waitForFunction(() => window.exportFixtureReady === true);
        await page.locator('#openExport').click();
        await page.waitForFunction(() => document.querySelector('#exportDialog').classList.contains('show'));
        assert.equal(await page.evaluate(() => document.activeElement.name), 'export-format', 'dialog should focus its first format choice');
        const lightSurface = await page.locator('.export-choice').first().evaluate(element => getComputedStyle(element).backgroundColor);
        await page.locator('body').evaluate(body => body.classList.remove('light-theme'));
        const darkSurface = await page.locator('.export-choice').first().evaluate(element => getComputedStyle(element).backgroundColor);
        assert.notEqual(lightSurface, darkSurface, 'export choices should use theme-specific surfaces');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px dialog should not create horizontal overflow');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#exportDialog').classList.contains('show'));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'openExport', 'Escape should restore focus to the opener');
        await page.setViewportSize({ width: 1366, height: 900 });
        await page.locator('body').evaluate(body => body.classList.add('light-theme'));
        await page.locator('#openExport').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desktop dialog should not create horizontal overflow');
        await page.keyboard.press('Escape');
        await page.locator('#openExport').click();
        await page.locator('[data-export-close]').first().click();
        await page.waitForFunction(() => !document.querySelector('#exportDialog').classList.contains('show'));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'openExport', 'close button should restore focus');
        await page.evaluate(() => window.setExportFixtureFailure(true));
        await page.locator('#openExport').click();
        assert.match(await page.locator('[data-export-count]').textContent(), /unavailable/i);
        await page.locator('[data-export-submit]').click();
        await page.waitForFunction(() => document.querySelector('[data-export-status]').textContent.includes('Export failed'));
        assert.doesNotMatch(await page.locator('[data-export-status]').textContent(), /storage|synthetic/i, 'errors should not expose internal details');
        await page.locator('[data-export-close]').last().click();
        await page.evaluate(() => window.setExportFixtureFailure(false));

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'casetrack-ux004-'));
        try {
            await page.locator('#openExport').click();
            await page.locator('input[name="export-scope"][value="all"]').check();
            assert.match(await page.locator('[data-export-count]').textContent(), /3 rows/);
            await page.locator('input[name="export-format"][value="csv"]').check();
            let downloadWait = page.waitForEvent('download');
            await page.locator('[data-export-submit]').click();
            let download = await downloadWait;
            const dateStamp = new Date().toISOString().slice(0, 10);
            assert.equal(download.suggestedFilename(), `casetrack-export-smoke-all-${dateStamp}.csv`);
            let filePath = path.join(tempDir, download.suggestedFilename());
            await download.saveAs(filePath);
            let csv = await fs.readFile(filePath, 'utf8');
            assert.ok(csv.startsWith('\uFEFF'));
            assert.match(csv, /0007\/26/);
            assert.match(csv, /दिल्ली/);
            assert.match(csv, /'\=1\+1/);

            await page.locator('input[name="export-format"][value="xlsx"]').check();
            downloadWait = page.waitForEvent('download');
            await page.locator('[data-export-submit]').click();
            download = await downloadWait;
            filePath = path.join(tempDir, download.suggestedFilename());
            await download.saveAs(filePath);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            assert.equal(workbook.worksheets[0].getRow(2).getCell(1).value, '0007/26');
            assert.match(workbook.worksheets[0].getRow(2).getCell(2).value, /दिल्ली/);
            assert.equal(workbook.worksheets[0].rowCount, 4);

            await page.locator('input[name="export-scope"][value="filtered"]').check();
            await page.locator('input[name="export-format"][value="pdf"]').check();
            assert.match(await page.locator('[data-export-count]').textContent(), /1 rows/);
            downloadWait = page.waitForEvent('download', { timeout: 30_000 });
            await page.locator('[data-export-submit]').click();
            try {
                download = await downloadWait;
            } catch (error) {
                console.error(JSON.stringify({ status: await page.locator('[data-export-status]').textContent(), errors }));
                throw error;
            }
            filePath = path.join(tempDir, download.suggestedFilename());
            await download.saveAs(filePath);
            const pdf = await fs.readFile(filePath);
            assert.equal(download.suggestedFilename(), `casetrack-export-smoke-filtered-${dateStamp}.pdf`);
            assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
            const pdfText = pdf.toString('latin1');
            assert.ok(pdfText.includes('/FontFile2'), 'PDF should embed its Devanagari TrueType font');
            assert.ok(pdfText.includes('/ToUnicode'), 'PDF should retain Unicode text mappings');
            assert.match(await page.locator('[data-export-status]').textContent(), /download should begin/i);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
        assert.deepEqual(errors, [], 'export dialog fixture should not raise browser errors');
        console.log(JSON.stringify({ result: 'passed', checks: ['320px and 1366px dialog layout', 'light/dark surfaces', 'open/cancel/Escape/focus restore', 'scope counts', 'safe error feedback', 'CSV download/content', 'XLSX download/content', 'PDF download/font and Unicode map'] }));
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
