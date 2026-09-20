import { db } from '@config/firebase-config.js';
import { parseCaseDate, setupDropdown } from './shared-utils.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

let casesCache = [];
let activePcRange = 'thisMonth';

/* =========================
   FIRESTORE
========================= */
const casesCollection = collection(db, 'cases');

const loadCases = async () => {
    try {
        const snapshot = await getDocs(query(casesCollection, orderBy('createdAt', 'desc')));
        casesCache = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        try {
            const snapshot = await getDocs(casesCollection);
            casesCache = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (fallbackError) {
            console.error('Failed to load cases from Firestore:', fallbackError);
            casesCache = [];
        }
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
    'Case Stage':  c => String(c.trialStage || '').trim() || 'Unknown',
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
    const activeCasesEl = document.getElementById('activeCases');
    const closedCasesEl = document.getElementById('closedCases');
    const pendingHearingsEl = document.getElementById('pendingHearings');
    const donutChartEl = document.querySelector('.donut');
    const donutTotalEl = document.getElementById('donutTotal');
    const hearingList = document.getElementById('hearingList');
    const pcThisMonthList = document.getElementById('pcThisMonthList');

    if (!casesCache || casesCache.length === 0) {
        if (totalCasesEl) totalCasesEl.textContent = '0';
        if (activeCasesEl) activeCasesEl.textContent = '0';
        if (closedCasesEl) closedCasesEl.textContent = '0';
        if (pendingHearingsEl) pendingHearingsEl.textContent = '0';
        if (donutTotalEl) donutTotalEl.textContent = '0';
        if (donutChartEl) donutChartEl.style.setProperty('--ut-deg', '0deg');
        if (donutChartEl) donutChartEl.style.setProperty('--cl-deg', '0deg');
        if (donutChartEl) donutChartEl.style.setProperty('--pd-deg', '0deg');
        
        if (hearingList) hearingList.innerHTML = '<p class="empty">No upcoming hearing dates yet.</p>';
        if (pcThisMonthList) pcThisMonthList.innerHTML = '<p class="empty">Add a case to see it here.</p>';
        return;
    }

    const total = casesCache.length;
    let active = 0, closed = 0, pending = 0;

    casesCache.forEach(c => {
        const st = (c.status || '').toLowerCase();
        if (st === 'disposed' || st === 'cancellation') closed++;
        else if (st === 'ut' || st === 'ui') active++;
        else pending++;
    });

    // Calculate Pending Hearings strictly based on nextDate
    const nowZero = new Date();
    nowZero.setHours(0,0,0,0);
    const pendingHearingsCount = casesCache.filter(c => {
        if (!c.nextDate) return false;
        const d = parseCaseDate(c.nextDate);
        return d && d >= nowZero;
    }).length;

    if (totalCasesEl) totalCasesEl.textContent = String(total);
    if (activeCasesEl) activeCasesEl.textContent = String(active);
    if (closedCasesEl) closedCasesEl.textContent = String(closed);
    if (pendingHearingsEl) pendingHearingsEl.textContent = String(pendingHearingsCount);

    // ── Donut chart is rendered separately via renderDonut() ──
    renderDonut(casesCache);


    // Render Upcoming Hearings
    if (hearingList) {
        let hearings = casesCache.filter(c => {
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
        let pcs = casesCache.filter(c => {
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
    await loadCases();

    // Re-render donut when the breakdown dropdown changes
    document.querySelector('.status-filter')?.addEventListener('change', () => {
        renderDonut(casesCache);
    });
};
init();
