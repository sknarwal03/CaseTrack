import { auth, db } from '@config/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { parseCaseDate, setupDropdown } from './shared-utils.js';
import { normalizeTrialStage } from './trial-stages.js';
import { countUniqueFirs, loadCaseRecords } from './fir-case-model.js';
import { isCourtProceeding } from './fir-status.mjs';

let casesCache = [];
let activePcRange = 'thisMonth';
let casesLoadError = null;
let dashboardTasks = [];
let taskStorageKey = 'casetrack-dashboard-tasks:guest';

const TASKS_STORAGE_PREFIX = 'casetrack-dashboard-tasks:';
const localDateValue = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

function saveDashboardTasks() {
    try {
        localStorage.setItem(taskStorageKey, JSON.stringify(dashboardTasks));
        renderDashboardTasks();
    } catch (error) {
        console.error('Could not save dashboard tasks:', error);
        const status = document.getElementById('taskFormStatus');
        if (status) status.textContent = 'Could not save tasks in this browser. Check available storage.';
    }
}

function taskDueLabel(task) {
    const due = task.date ? new Date(`${task.date}T${task.time || '23:59'}`) : null;
    if (!due || Number.isNaN(due.getTime())) return 'No due date';
    const today = new Date();
    const tomorrow = new Date(today);
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const taskDay = new Date(due);
    taskDay.setHours(0, 0, 0, 0);
    const dayLabel = taskDay.getTime() === today.getTime() ? 'Today' :
        taskDay.getTime() === tomorrow.getTime() ? 'Tomorrow' :
            new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: taskDay.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(taskDay);
    const timeLabel = task.time ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(due) : '';
    return [dayLabel, timeLabel].filter(Boolean).join(', ');
}

function sortedTasks() {
    return [...dashboardTasks].sort((a, b) => Number(a.completed) - Number(b.completed) ||
        `${a.date || ''}T${a.time || '23:59'}`.localeCompare(`${b.date || ''}T${b.time || '23:59'}`));
}

function createTaskRow(task) {
    const row = document.createElement('div');
    row.className = `task${task.completed ? ' is-complete' : ''}`;
    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'checkbox';
    checkbox.dataset.taskAction = 'toggle';
    checkbox.dataset.taskId = task.id;
    checkbox.setAttribute('aria-label', task.completed ? 'Mark task incomplete' : 'Mark task complete');
    checkbox.setAttribute('aria-pressed', String(Boolean(task.completed)));
    const content = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = task.title;
    const due = document.createElement('small');
    due.textContent = task.completed ? `Completed · ${taskDueLabel(task)}` : taskDueLabel(task);
    if (!task.completed && task.date && task.date < localDateValue()) due.classList.add('urgent');
    content.append(title, due);
    row.append(checkbox, content);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-delete';
    remove.dataset.taskAction = 'delete';
    remove.dataset.taskId = task.id;
    remove.setAttribute('aria-label', `Delete ${task.title}`);
    remove.textContent = '×';
    row.append(remove);
    return row;
}

function renderTaskRows(container, tasks, emptyMessage) {
    if (!container) return;
    container.replaceChildren();
    if (!tasks.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = emptyMessage;
        container.append(empty);
        return;
    }
    tasks.forEach(task => container.append(createTaskRow(task)));
}

function renderDashboardTasks() {
    const sorted = sortedTasks();
    renderTaskRows(document.getElementById('taskPreview'), sorted.filter(task => !task.completed).slice(0, 3),
        dashboardTasks.length ? 'All tasks are complete.' : 'No tasks yet. Add a task to track a follow-up.');
    renderTaskRows(document.getElementById('taskFullList'), sorted,
        'No tasks yet. Use the form above to add a task.');
}

function bindTaskControls() {
    const dialog = document.getElementById('taskDialog');
    const form = document.getElementById('taskForm');
    const status = document.getElementById('taskFormStatus');
    const openDialog = () => {
        renderDashboardTasks();
        if (status) status.textContent = '';
        if (!form.elements.date.value) form.elements.date.value = localDateValue();
        dialog?.showModal();
        form?.elements.title.focus();
    };
    document.getElementById('addTaskButton')?.addEventListener('click', openDialog);
    document.querySelector('.panel-view-all[data-panel="tasks"]')?.addEventListener('click', openDialog);
    document.getElementById('closeTaskDialog')?.addEventListener('click', () => dialog?.close());
    dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    form?.addEventListener('submit', event => {
        event.preventDefault();
        const title = String(form.elements.title.value || '').trim();
        if (!title) return;
        dashboardTasks.push({
            id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            title,
            date: form.elements.date.value,
            time: form.elements.time.value,
            completed: false,
            createdAt: Date.now()
        });
        saveDashboardTasks();
        form.reset();
        form.elements.date.value = localDateValue();
        if (status) status.textContent = 'Task added.';
        form.elements.title.focus();
    });
    dialog?.addEventListener('click', event => {
        const button = event.target.closest('[data-task-action]');
        if (!button) return;
        const task = dashboardTasks.find(item => item.id === button.dataset.taskId);
        if (!task) return;
        if (button.dataset.taskAction === 'toggle') task.completed = !task.completed;
        if (button.dataset.taskAction === 'delete') dashboardTasks = dashboardTasks.filter(item => item.id !== task.id);
        saveDashboardTasks();
    });
}

function loadDashboardTasks(user) {
    taskStorageKey = `${TASKS_STORAGE_PREFIX}${user?.uid || 'guest'}`;
    try {
        const saved = JSON.parse(localStorage.getItem(taskStorageKey) || '[]');
        dashboardTasks = Array.isArray(saved) ? saved.filter(task => task && typeof task.title === 'string' && task.id) : [];
    } catch (error) {
        dashboardTasks = [];
        console.error('Could not read dashboard tasks:', error);
    }
    renderDashboardTasks();
}

/* =========================
   FIRESTORE
========================= */
const loadCases = async () => {
    try {
        casesCache = await loadCaseRecords(db);
        casesLoadError = null;
    } catch (error) {
        console.error('Failed to load FIR and proceeding records:', error);
        casesLoadError = error;
        casesCache = [];
    }
    renderDashboard();
};

window.addEventListener('caseAdded', () => {
    loadCases();
});

/* =========================
   DATE HELPER
========================= */
/* =========================
   UPDATE TODAY DATE
========================= */
const updateTodayDate = () => {
    const el = document.getElementById('todayDate');
    if (el) {
        const options = { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' };
        el.textContent = new Intl.DateTimeFormat('en-GB', options).format(new Date());
    }
};

const TREND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const trendDateValue = value => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date?.getTime?.()) ? null : date;
    }
    if (typeof value === 'object' && Number.isFinite(value.seconds)) {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value !== 'string') return null;
    const input = value.trim();
    if (!input) return null;
    const date = parseCaseDate(input);
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const firstTrendDate = (record, fields) => {
    for (const field of fields) {
        const date = trendDateValue(record?.[field]);
        if (date) return date;
    }
    return null;
};

const trendMonthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function getTrendMonths(period, now = new Date()) {
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let start;
    let count;
    if (period === 'lastYear') {
        start = new Date(now.getFullYear() - 1, 0, 1);
        count = 12;
    } else if (period === 'last6Months') {
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        count = 6;
    } else if (period === 'last12Months') {
        start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        count = 12;
    } else {
        start = new Date(now.getFullYear(), 0, 1);
        count = now.getMonth() + 1;
    }
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
        return { date, key: trendMonthKey(date), label: TREND_MONTHS[date.getMonth()] };
    });
}

function appendTrendSvg(parent, tag, attributes = {}, textContent = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (textContent) element.textContent = textContent;
    parent.append(element);
    return element;
}

function renderCaseTrends(proceedings = []) {
    const chart = document.getElementById('caseTrendChart');
    const empty = document.getElementById('trendEmpty');
    if (!chart) return;
    const now = new Date();
    const selectedPeriod = document.getElementById('trendPeriod')?.value || 'thisYear';
    const months = getTrendMonths(selectedPeriod, now);
    const monthIndex = new Map(months.map((month, index) => [month.key, index]));
    const openings = Array(months.length).fill(0);
    const closures = Array(months.length).fill(0);
    const datedEvents = [];
    const currentPending = proceedings.filter(record => {
        const status = String(record.status || '').trim().toLowerCase();
        return status !== 'committed' && status !== 'disposed' && status !== 'cancellation';
    }).length;

    proceedings.forEach(record => {
        const status = String(record.status || '').trim().toLowerCase();
        const isClosed = status === 'disposed' || status === 'cancellation';
        const openedAt = firstTrendDate(record, ['regDate', 'registrationDate', 'createdAt']);
        const closedAt = isClosed ? firstTrendDate(record, ['decisionDate', 'ucr_dod', 'ucrDisposedDate', 'disposedDate']) : null;
        if (openedAt && openedAt <= now) datedEvents.push({ type: 'opened', date: openedAt });
        if (closedAt && closedAt <= now) datedEvents.push({ type: 'closed', date: closedAt });
        const openIndex = openedAt ? monthIndex.get(trendMonthKey(openedAt)) : undefined;
        const closeIndex = closedAt ? monthIndex.get(trendMonthKey(closedAt)) : undefined;
        if (openIndex !== undefined) openings[openIndex] += 1;
        if (closeIndex !== undefined) closures[closeIndex] += 1;
    });

    const chartParts = [
        chart.querySelector('#trendArea'), chart.querySelector('#newCasesSeries'),
        chart.querySelector('#closedCasesSeries'), chart.querySelector('#pendingCasesSeries'),
        chart.querySelector('#trendGrid'), chart.querySelector('#trendPoints'), chart.querySelector('#trendLabels')
    ];
    const [area, newSeries, closedSeries, pendingSeries, grid, points, labels] = chartParts;
    [area, newSeries, closedSeries, pendingSeries, grid, points, labels].forEach(element => {
        if (element && element.tagName.toLowerCase() === 'g') element.replaceChildren();
    });
    area?.setAttribute('d', '');
    [newSeries, closedSeries, pendingSeries].forEach(series => series?.setAttribute('points', ''));

    if (empty) {
        const hasDatedActivity = datedEvents.length > 0;
        empty.hidden = hasDatedActivity;
        empty.textContent = hasDatedActivity
            ? ''
            : 'No dated case activity yet. Add registration and disposal dates to see trends.';
    }
    if (!datedEvents.length || !months.length) return;

    const cumulativeAfter = (events, month) => events.filter(event => event.date >= new Date(month.date.getFullYear(), month.date.getMonth() + 1, 1)).length;
    const currentMonthPending = months.map(month => Math.max(0,
        currentPending - cumulativeAfter(datedEvents.filter(event => event.type === 'opened'), month)
            + cumulativeAfter(datedEvents.filter(event => event.type === 'closed'), month)
    ));
    const maxValue = Math.max(1, ...openings, ...closures, ...currentMonthPending);
    const left = 43, right = 705, top = 16, bottom = 138;
    const xFor = index => months.length === 1 ? (left + right) / 2 : left + (right - left) * index / (months.length - 1);
    const yFor = value => bottom - (Math.max(0, value) / maxValue) * (bottom - top);

    for (let tick = 0; tick <= 4; tick += 1) {
        const y = top + (bottom - top) * tick / 4;
        const value = Math.round(maxValue * (4 - tick) / 4);
        appendTrendSvg(grid, 'line', { x1: left, y1: y, x2: right, y2: y, class: 'grid-line' });
        appendTrendSvg(grid, 'text', { x: 35, y: y + 4, 'text-anchor': 'end', class: 'axis-label' }, String(value));
    }
    months.forEach((month, index) => {
        const x = xFor(index);
        appendTrendSvg(grid, 'line', { x1: x, y1: top, x2: x, y2: bottom, class: 'grid-line vertical' });
        appendTrendSvg(labels, 'text', { x, y: 165 }, selectedPeriod === 'lastYear' ? `${month.label}` : month.label);
    });

    const makePoints = values => values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ');
    const newPoints = makePoints(openings);
    newSeries?.setAttribute('points', newPoints);
    closedSeries?.setAttribute('points', makePoints(closures));
    pendingSeries?.setAttribute('points', makePoints(currentMonthPending));
    area?.setAttribute('d', `M${newPoints.replaceAll(' ', ' L')} L${right},${bottom} L${left},${bottom} Z`);

    const brandColor = getComputedStyle(document.body).getPropertyValue('--brand-primary').trim();
    const seriesData = [
        { values: openings, label: 'new cases', color: brandColor || '#55d1aa' },
        { values: closures, label: 'closed cases', color: '#19d49b' },
        { values: currentMonthPending, label: 'pending cases', color: '#935cf6' }
    ];
    seriesData.forEach(series => series.values.forEach((value, index) => {
        const circle = appendTrendSvg(points, 'circle', {
            cx: xFor(index), cy: yFor(value), r: 3.5, fill: series.color, class: 'trend-point'
        });
        appendTrendSvg(circle, 'title', {}, `${months[index].label} ${months[index].date.getFullYear()}: ${value} ${series.label}`);
    }));
}

/* =========================
   DONUT CHART — DYNAMIC
========================= */

// Palette: first 3 match the existing legend colours; extras for additional categories
const DONUT_PALETTE = [
    '#3994ff', '#8854f4', '#19d49b',
    '#ff9f43', '#ee5a6f', '#00cec9',
    '#a29bfe', '#fd79a8', '#55efc4', '#fdcb6e',
];

// Map dropdown value → case object field key
const FIELD_MAP = {
    'FIR Year':    c => String(c.firYear  || '').trim() || 'Unknown',
    'Court Type':  c => String(c.courtType || '').trim() || 'Unknown',
    'Court Name':  c => String(c.courtName || '').trim() || 'Unknown',
    'Case Stage':  c => normalizeTrialStage(c.trialStage) || 'Unknown',
};

const renderDonut = (cases) => {
    const donutChartEl = document.querySelector('.donut');
    const donutTotalEl = document.getElementById('donutTotal');
    const legendEl     = document.querySelector('.legend');
    const tooltip      = document.querySelector('.donut-tooltip');

    if (!donutChartEl) return;

    const selectedField = (document.querySelector('.status-filter')?.value) || 'FIR Year';
    const getKey = FIELD_MAP[selectedField] || FIELD_MAP['FIR Year'];

    // ── Group cases by selected dimension ─────────────────────────────
    const counts = {};
    (cases || []).forEach(c => {
        const k = getKey(c);
        counts[k] = (counts[k] || 0) + 1;
    });

    // Sort by count descending, exclude zero
    const entries = Object.entries(counts)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (donutTotalEl) donutTotalEl.textContent = String(total || 0);

    // Empty state
    if (total === 0 || entries.length === 0) {
        donutChartEl.style.background = `conic-gradient(#2a3f5a 0deg 360deg)`;
        donutChartEl.querySelector('.donut-slice-overlay')?.remove();
        if (legendEl) legendEl.innerHTML = '<li style="color:var(--muted);font-size:12px;">No data</li>';
        if (tooltip) tooltip.classList.remove('show');
        return;
    }

    // ── Build conic-gradient string ───────────────────────────────────
    let gradParts = [];
    let runningDeg = 0;
    const sliceData = [];

    entries.forEach(([label, count], idx) => {
        const color = DONUT_PALETTE[idx % DONUT_PALETTE.length];
        const deg = (count / total) * 360;
        const pct = ((count / total) * 100).toFixed(1);
        gradParts.push(`${color} ${runningDeg.toFixed(4)}deg ${(runningDeg + deg).toFixed(4)}deg`);
        sliceData.push({ label, color, count, pct, startDeg: runningDeg, endDeg: runningDeg + deg });
        runningDeg += deg;
    });

    donutChartEl.style.background =
        `conic-gradient(${gradParts.join(', ')})`;

    // ── Legend ────────────────────────────────────────────────────────
    if (legendEl) {
        legendEl.innerHTML = sliceData.map(s =>
            `<li>` +
            `<i style="background:${s.color};border-radius:4px;width:11px;height:11px;display:block;flex-shrink:0;"></i>` +
            `<span title="${s.label}">${s.label}</span>` +
            `<b>${s.count} <span style="font-weight:400;color:var(--muted)">(${s.pct}%)</span></b>` +
            `</li>`
        ).join('');
    }

    // ── SVG hover overlay ─────────────────────────────────────────────
    donutChartEl.querySelector('.donut-slice-overlay')?.remove();
    if (tooltip) tooltip.classList.remove('show');

    const EXPLODE_PX = 7;
    const R = 50;
    const ns = 'http://www.w3.org/2000/svg';

    const polar = (angleDeg) => {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: 50 + R * Math.cos(rad), y: 50 + R * Math.sin(rad) };
    };

    const arcPath = (startDeg, endDeg) => {
        if (endDeg - startDeg >= 359.99) {
            return `M 50 50 m -${R} 0 a ${R} ${R} 0 1 1 ${R*2} 0 a ${R} ${R} 0 1 1 -${R*2} 0`;
        }
        const s = polar(startDeg);
        const e = polar(endDeg);
        const large = endDeg - startDeg > 180 ? 1 : 0;
        return `M 50 50 L ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y} Z`;
    };

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('donut-slice-overlay');

    sliceData.forEach(slice => {
        const midDeg = (slice.startDeg + slice.endDeg) / 2;
        const midRad = (midDeg - 90) * Math.PI / 180;
        const tx = Math.cos(midRad) * EXPLODE_PX;
        const ty = Math.sin(midRad) * EXPLODE_PX;

        const highlight = document.createElementNS(ns, 'path');
        highlight.setAttribute('d', arcPath(slice.startDeg, slice.endDeg));
        highlight.setAttribute('fill', slice.color);
        highlight.classList.add('slice-highlight');
        highlight.style.transform = 'translate(0,0)';
        highlight.style.opacity = '0';
        svg.appendChild(highlight);

        const hit = document.createElementNS(ns, 'path');
        hit.setAttribute('d', arcPath(slice.startDeg, slice.endDeg));
        hit.setAttribute('fill', 'transparent');
        hit.classList.add('slice-hit');
        svg.appendChild(hit);

        hit.addEventListener('mouseenter', () => {
            highlight.style.transform = `translate(${tx}px, ${ty}px)`;
            highlight.style.opacity = '1';
            if (tooltip) {
                tooltip.innerHTML =
                    `<div class="tooltip-label"><i style="background:${slice.color};color:${slice.color}"></i>${slice.label}</div>` +
                    `<div class="tooltip-row"><strong>Cases</strong><span>${slice.count}</span></div>` +
                    `<div class="tooltip-row"><strong>Percentage</strong><span>${slice.pct}%</span></div>`;
                tooltip.classList.add('show');
            }
        });

        hit.addEventListener('mouseleave', () => {
            highlight.style.transform = 'translate(0,0)';
            highlight.style.opacity = '0';
            if (tooltip) tooltip.classList.remove('show');
        });
    });

    donutChartEl.appendChild(svg);
};

/* =========================
   RENDER DASHBOARD
========================= */
const renderDashboard = () => {
    const totalCasesEl = document.getElementById('totalCases');
    const proceedingCountEl = document.getElementById('totalProceedings');
    const activeCasesEl = document.getElementById('activeCases');
    const closedCasesEl = document.getElementById('closedCases');
    const pendingHearingsEl = document.getElementById('pendingHearings');
    const donutChartEl = document.querySelector('.donut');
    const donutTotalEl = document.getElementById('donutTotal');
    const hearingList = document.getElementById('hearingList');
    const pcThisMonthList = document.getElementById('pcThisMonthList');

    if (!casesCache || casesCache.length === 0) {
        renderCaseTrends([]);
        const emptyValue = casesLoadError ? '—' : '0';
        if (totalCasesEl) totalCasesEl.textContent = emptyValue;
        if (proceedingCountEl) proceedingCountEl.textContent = emptyValue;
        if (activeCasesEl) activeCasesEl.textContent = '0';
        if (closedCasesEl) closedCasesEl.textContent = '0';
        if (pendingHearingsEl) pendingHearingsEl.textContent = '0';
        if (donutTotalEl) donutTotalEl.textContent = '0';
        if (donutChartEl) donutChartEl.style.setProperty('--ut-deg', '0deg');
        if (donutChartEl) donutChartEl.style.setProperty('--cl-deg', '0deg');
        if (donutChartEl) donutChartEl.style.setProperty('--pd-deg', '0deg');
        
        if (hearingList) hearingList.innerHTML = `<p class="empty">${casesLoadError ? 'Could not load FIR and proceeding records. Check access and retry.' : 'No upcoming hearing dates yet.'}</p>`;
        if (pcThisMonthList) pcThisMonthList.innerHTML = `<p class="empty">${casesLoadError ? 'Could not load FIR and proceeding records.' : 'Add a case to see it here.'}</p>`;
        return;
    }

    const proceedings = casesCache.filter(isCourtProceeding);
    renderCaseTrends(proceedings);
    const total = countUniqueFirs(casesCache);
    let active = 0, closed = 0, pending = 0;

    proceedings.forEach(c => {
        const st = (c.status || '').toLowerCase();
        if (st === 'committed') return;
        if (st === 'disposed' || st === 'cancellation') closed++;
        else if (st === 'ut' || st === 'ui') active++;
        else pending++;
    });

    // Calculate Pending Hearings strictly based on nextDate
    const nowZero = new Date();
    nowZero.setHours(0,0,0,0);
    const pendingHearingsCount = proceedings.filter(c => {
        if (String(c.status || '').trim().toLowerCase() === 'committed' || c.successorCaseId) return false;
        if (!c.nextDate) return false;
        const d = parseCaseDate(c.nextDate);
        return d && d >= nowZero;
    }).length;

    if (totalCasesEl) totalCasesEl.textContent = String(total);
    if (proceedingCountEl) proceedingCountEl.textContent = String(proceedings.length);
    if (activeCasesEl) activeCasesEl.textContent = String(active);
    if (closedCasesEl) closedCasesEl.textContent = String(closed);
    if (pendingHearingsEl) pendingHearingsEl.textContent = String(pendingHearingsCount);

    // ── Donut chart is rendered separately via renderDonut() ──
    renderDonut(proceedings);


    // Render Upcoming Hearings
    if (hearingList) {
        let hearings = proceedings.filter(c => {
            if (String(c.status || '').trim().toLowerCase() === 'committed' || c.successorCaseId) return false;
            if (!c.nextDate) return false;
            const d = parseCaseDate(c.nextDate);
            return d && d >= nowZero; // Future or today
        });
        
        hearings.sort((a, b) => parseCaseDate(a.nextDate) - parseCaseDate(b.nextDate));
        
        if (hearings.length === 0) {
            hearingList.innerHTML = '<p class="empty">No upcoming hearing dates yet.</p>';
        } else {
            hearingList.innerHTML = hearings.slice(0, 5).map(c => 
                '<div class="hearing-item"><div class="hearing-info">' +
                '<strong>' + (c.firNo || 'Unassigned') + '</strong>' +
                '<small>' + (c.courtName || 'Unknown Court') + '</small>' +
                '</div><span class="hearing-badge">' + c.nextDate + '</span></div>'
            ).join('');
        }
    }

    // Render PC List (Put In Court)
    if (pcThisMonthList) {
        let pcs = proceedings.filter(c => {
            if (!c.regDate) return false; // Using regDate for Put in Court
            const d = parseCaseDate(c.regDate);
            if (!d) return false;
            
            if (activePcRange === 'thisMonth') {
                return d.getMonth() === nowZero.getMonth() && d.getFullYear() === nowZero.getFullYear();
            } else if (activePcRange === 'lastMonth') {
                const prev = new Date(nowZero.getFullYear(), nowZero.getMonth() - 1, 1);
                return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
            } else if (activePcRange === 'last6Months') {
                const sixAgo = new Date(nowZero.getFullYear(), nowZero.getMonth() - 6, nowZero.getDate());
                return d >= sixAgo && d <= nowZero;
            } else if (activePcRange === 'thisYear') {
                return d.getFullYear() === nowZero.getFullYear();
            }
            return true;
        });
        
        pcs.sort((a, b) => parseCaseDate(b.regDate) - parseCaseDate(a.regDate));

        if (pcs.length === 0) {
            pcThisMonthList.innerHTML = '<p class="empty">No put-in-court cases in selected range.</p>';
        } else {
            pcThisMonthList.innerHTML = pcs.slice(0, 5).map(c => 
                '<div class="pc-item"><div class="pc-info">' +
                '<strong>' + (c.firNo || 'Unassigned') + '</strong>' +
                '<small>' + (c.courtName || 'Unknown Court') + '</small>' +
                '</div><span class="pc-badge">' + c.regDate + '</span></div>'
            ).join('');
        }
    }
};

/* =========================
   BINDINGS
========================= */
const bindPcRangeSelector = () => {
    // Dropdown toggle
    setupDropdown(".pc-range-trigger", ".pc-range-panel", "show-dropdown");
    const trigger = document.querySelector(".pc-range-trigger");

    const buttons = document.querySelectorAll('.pc-range-option');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activePcRange = btn.dataset.range || 'thisMonth';
            
            if (trigger) trigger.innerHTML = btn.textContent.trim() + ' <span>&#9662;</span>';
            
            const panel = btn.closest(".pc-range-panel");
            panel?.classList.remove("show-dropdown");
            if (panel) panel.style.display = "none";

            renderDashboard();
        });
    });
};

const bindViewAllButtons = () => {
    document.querySelectorAll('.view-all').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            window.location.href = 'cases.html';
        });
    });
};

/* =========================
   INIT
========================= */
const init = async () => {
    updateTodayDate();
    bindPcRangeSelector();
    bindViewAllButtons();
    bindTaskControls();
    document.getElementById('trendPeriod')?.addEventListener('change', () => renderCaseTrends(casesCache.filter(isCourtProceeding)));
    onAuthStateChanged(auth, loadDashboardTasks);
    await loadCases();

    // Re-render donut when the breakdown dropdown changes
    document.querySelector('.status-filter')?.addEventListener('change', () => {
        renderDonut(casesCache.filter(isCourtProceeding));
    });
};
init();
