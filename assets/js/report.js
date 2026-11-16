import { db } from "@config/firebase-config.js";
import { getFirSummaries, loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';
import { configureExportDialog } from './export-dialog.js';
import {
    calculatePendingCourtProceedings,
    pendingCourtProceedingsExportRow
} from './report-pending-proceedings.mjs';

/* Theme handled by shared-layout.js */

let casesCache = [];
const getCases = () => casesCache;

let casesLoadError = null;
let casesLoaded = false;
let pendingCourtProceedingsResult = { pendingCount: 0, unknownStatusCount: 0 };

const countByKey = (items, key) => {
    const map = {};
    items.forEach(item => {
        const value = String(item[key] || '').trim();
        const label = value || 'Unspecified';
        map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
};

const renderStatusChart = () => {
    const rows = countByKey(getFirSummaries(getCases()), 'caseStatus');
    const max = Math.max(...rows.map(([, count]) => count), 1);
    const wrapper = document.querySelector('#statusBarChart');
    if (!wrapper) return;

    wrapper.innerHTML = casesLoadError
        ? '<p class="empty-state">Could not load FIR and proceeding records.</p>'
        : rows.length ? rows.map(([label, count]) => `
        <div class="bar-row">
            <div class="bar-label">${label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
            <div class="bar-value">${count}</div>
        </div>
    `).join('') : '<p class="empty-state">No case data yet.</p>';
};

const renderStageChart = () => {
    const rows = countByKey(getCases().filter(isCourtProceeding), 'caseStage');
    const max = Math.max(...rows.map(([, count]) => count), 1);
    const wrapper = document.querySelector('#stageBarChart');
    if (!wrapper) return;

    wrapper.innerHTML = casesLoadError
        ? '<p class="empty-state">Could not load FIR and proceeding records.</p>'
        : rows.length ? rows.map(([label, count]) => `
        <div class="bar-row">
            <div class="bar-label">${label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
            <div class="bar-value">${count}</div>
        </div>
    `).join('') : '<p class="empty-state">No stage data yet.</p>';
};

const renderList = (id, key) => {
    const wrapper = document.querySelector(`#${id}`);
    if (!wrapper) return;

    const source = key === 'policeStation'
        ? getFirSummaries(getCases())
        : getCases().filter(isCourtProceeding);
    const rows = countByKey(source, key);
    wrapper.innerHTML = casesLoadError
        ? '<li><span>Could not load records</span><span>—</span></li>'
        : rows.length ? rows.map(([label, count]) => `
        <li>
            <span>${label}</span>
            <span>${count}</span>
        </li>
    `).join('') : '<li><span>No data</span><span>0</span></li>';
};

const updateSummary = () => {
    const allCases = getCases();
    const proceedings = allCases.filter(isCourtProceeding);
    const firs = getFirSummaries(allCases);
    pendingCourtProceedingsResult = casesLoadError
        ? { pendingCount: 0, unknownStatusCount: 0 }
        : calculatePendingCourtProceedings(allCases);
    document.querySelector('#reportTotalCases').textContent = casesLoadError ? '—' : firs.length;
    document.querySelector('#reportDisposed').textContent = casesLoadError ? '—' : firs.filter(item => String(item.firStatus).toLowerCase() === 'disposed').length;
    document.querySelector('#reportPending').textContent = casesLoadError ? '—' : pendingCourtProceedingsResult.pendingCount;
    document.querySelector('#reportHearings').textContent = casesLoadError ? '—' : proceedings.filter(item => item.nextDate).length;

    const warning = document.querySelector('#pendingProceedingsWarning');
    if (warning) {
        const count = pendingCourtProceedingsResult.unknownStatusCount;
        warning.hidden = casesLoadError || count === 0;
        warning.textContent = count === 1
            ? '1 court proceeding was excluded because its status is missing or unrecognized.'
            : `${count} court proceedings were excluded because their statuses are missing or unrecognized.`;
    }
};

const renderAll = () => {
    renderStatusChart();
    renderStageChart();
    renderList('courtList', 'courtNumber');
    renderList('policeList', 'policeStation');
    updateSummary();
};

function getReportExportData(scope) {
    if (!casesLoaded) return null;
    if (casesLoadError) throw new Error('Report records could not be loaded.');
    const rows = [];
    [
        ['Summary', 'Unique FIRs', '#reportTotalCases'],
        ['Summary', 'Disposed', '#reportDisposed'],
        ['Summary', 'Next Hearings', '#reportHearings']
    ].forEach(([section, label, selector]) => {
        rows.push({ section, item: label, count: document.querySelector(selector)?.textContent.trim() || '0' });
    });
    rows.splice(2, 0, pendingCourtProceedingsExportRow(pendingCourtProceedingsResult));

    const addChartRows = (section, selector) => {
        document.querySelectorAll(`${selector} .bar-row`).forEach(row => {
            rows.push({
                section,
                item: row.querySelector('.bar-label')?.textContent.trim() || '',
                count: row.querySelector('.bar-value')?.textContent.trim() || '0'
            });
        });
    };
    const addListRows = (section, selector) => {
        document.querySelectorAll(`${selector} li`).forEach(row => {
            const cells = row.querySelectorAll('span');
            if (cells.length < 2 || /^(No data|Could not load records)$/i.test(cells[0].textContent.trim())) return;
            rows.push({ section, item: cells[0].textContent.trim(), count: cells[1].textContent.trim() });
        });
    };
    addChartRows('Case by Status', '#statusBarChart');
    addChartRows('Case Stage', '#stageBarChart');
    addListRows('Top Courts', '#courtList');
    addListRows('Police Station Summary', '#policeList');
    return {
        columns: [
            { header: 'Report section', key: 'section', width: 28 },
            { header: 'Metric or category', key: 'item', width: 34 },
            { header: 'Count', key: 'count', width: 14 }
        ],
        rows,
        scopeLabel: (scope === 'all' ? 'All Records' : 'Filtered Records') + ' (same authorized dataset; no report filters)',
        context: 'Case Insights summary export. Includes the four displayed summary metrics and current displayed chart and list aggregates (up to five categories per section). This page has no active filters, so Filtered Records and All Records both use the same authorized page dataset.',
        countLabel: `${rows.length} report summary rows will be exported. Filtered and All scopes match on this page.`
    };
}

configureExportDialog({
    trigger: '#reportExportTrigger',
    dialog: '#exportDialog',
    title: 'Case Insights Report',
    filenamePrefix: 'casetrack-case-insights',
    getData: getReportExportData
});

const loadCases = async () => {
    try {
        casesCache = await loadCaseRecords(db);
        casesLoadError = null;
    } catch (error) {
        console.error("Error loading FIR and proceeding records:", error);
        casesLoadError = error;
        casesCache = [];
    }
    casesLoaded = true;
    renderAll();
};

const init = () => {
    /* Theme handled by shared-layout.js */
    loadCases();
};

init();
window.addEventListener('caseAdded', loadCases);
