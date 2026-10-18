import { db } from "@config/firebase-config.js";
import { getFirSummaries, loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';

/* Theme handled by shared-layout.js */

let casesCache = [];
const getCases = () => casesCache;

let casesLoadError = null;

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
    document.querySelector('#reportTotalCases').textContent = casesLoadError ? '—' : firs.length;
    document.querySelector('#reportDisposed').textContent = casesLoadError ? '—' : firs.filter(item => String(item.firStatus).toLowerCase() === 'disposed').length;
    document.querySelector('#reportPending').textContent = casesLoadError ? '—' : firs.filter(item => ['UI', 'UT', 'UCR', 'Untrace', 'Cancelled', 'Cancellation'].includes(String(item.firStatus).trim())).length;
    document.querySelector('#reportHearings').textContent = casesLoadError ? '—' : proceedings.filter(item => item.nextDate).length;
};

const renderAll = () => {
    renderStatusChart();
    renderStageChart();
    renderList('courtList', 'courtNumber');
    renderList('policeList', 'policeStation');
    updateSummary();
};

const loadCases = async () => {
    try {
        casesCache = await loadCaseRecords(db);
        casesLoadError = null;
    } catch (error) {
        console.error("Error loading FIR and proceeding records:", error);
        casesLoadError = error;
        casesCache = [];
    }
    renderAll();
};

const init = () => {
    /* Theme handled by shared-layout.js */
    loadCases();
};

init();
window.addEventListener('caseAdded', loadCases);
