import { db } from '@config/firebase-config.js';
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
function parseCaseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parseInt(parts[1], 10) - 1, parts[0]);
        }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

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

    if (donutTotalEl) donutTotalEl.textContent = String(total);

    if (donutChartEl && total > 0) {
        const actDeg = (active / total) * 360;
        const clDeg = (closed / total) * 360;
        const pdDeg = (pending / total) * 360; // UCR etc.
        donutChartEl.style.setProperty('--ut-deg', actDeg + 'deg');
        donutChartEl.style.setProperty('--cl-deg', (actDeg + clDeg) + 'deg');
        donutChartEl.style.setProperty('--pd-deg', (actDeg + clDeg + pdDeg) + 'deg');
    }

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
    const trigger = document.querySelector(".pc-range-trigger");
    if (trigger) {
        trigger.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const menu = trigger.parentElement.querySelector(".pc-range-panel");
            if (menu) {
                const shouldOpen = !menu.classList.contains("show-dropdown");
                menu.classList.toggle("show-dropdown", shouldOpen);
                menu.style.display = shouldOpen ? "" : "none";
            }
        });
    }

    document.addEventListener("click", event => {
        const menu = document.querySelector(".pc-range-menu");
        if (!menu || menu.contains(event.target)) return;
        const panel = menu.querySelector(".pc-range-panel");
        panel?.classList.remove("show-dropdown");
        if (panel) panel.style.display = "none";
    });

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
};
init();
