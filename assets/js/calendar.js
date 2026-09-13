import { db } from "../../firebase/firebase-config.js";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';
const dateFieldSelect = document.querySelector('#dateFieldSelect');
const monthLabel = document.querySelector('#monthLabel');
const calendarGrid = document.querySelector('#calendarGrid');
const selectedDateLabel = document.querySelector('#selectedDateLabel');
const selectedDateCases = document.querySelector('#selectedDateCases');
const prevMonthBtn = document.querySelector('#prevMonthBtn');
const nextMonthBtn = document.querySelector('#nextMonthBtn');

const state = {
    currentDate: new Date(),
    activeKey: 'registrationDate',
    selectedDateKey: ''
};

let casesCache = [];
const getCases = () => casesCache;
const casesCollection = collection(db, "cases");

const getRegistrationDateValue = caseItem => caseItem?.registrationDate || caseItem?.putInCourtDate || caseItem?.firDate || '';

const formatDateKey = value => {
    if (!value) return '';
    const date = new Date(value + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDisplayDate = value => {
    if (!value) return '—';
    const date = new Date(value + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(date);
};

const getMatchesForDate = (dateKey, fieldKey) => getCases().filter(caseItem => {
    const itemDate = fieldKey === 'registrationDate' ? getRegistrationDateValue(caseItem) : caseItem[fieldKey];
    return !!itemDate && formatDateKey(itemDate) === dateKey;
});

const updateSelectedDateKey = () => {
    if (!state.selectedDateKey) {
        const safeDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        state.selectedDateKey = formatDateKey(safeDate);
    }
};

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    if (themeToggle) {
        themeToggle.textContent = isLight ? '☾' : '☼';
        themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }
};

const renderSelectedDateCases = () => {
    const dateCases = getMatchesForDate(state.selectedDateKey, state.activeKey);
    const dateLabel = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date(state.selectedDateKey + 'T00:00:00'));

    selectedDateLabel.textContent = dateLabel;

    if (!dateCases.length) {
        selectedDateCases.innerHTML = '<div class="empty-state">No cases scheduled for this date.</div>';
        return;
    }

    selectedDateCases.innerHTML = dateCases.map(caseItem => {
        const firId = `FIR-${caseItem.firNo || '—'}/${caseItem.firYear || '—'}`;
        const court = caseItem.courtNumber || caseItem.courtType || 'Court not assigned';
        return `
            <article class="case-calendar-item">
                <div>
                    <h3>${firId}</h3>
                    <p><strong>Section:</strong> ${caseItem.underSection || '—'}</p>
                    <p><strong>Court:</strong> ${court}</p>
                    <p><strong>Stage:</strong> ${caseItem.caseStage || '—'}</p>
                </div>
                <span class="case-status-tag">${caseItem.caseStatus || 'Active'}</span>
            </article>
        `;
    }).join('');
};

const renderCalendar = () => {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const displayMonth = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(state.currentDate);

    monthLabel.textContent = displayMonth;

    const startOfMonth = new Date(year, month, 1);
    const firstDayIndex = startOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - firstDayIndex);

    const cells = [];

    for (let i = 0; i < 42; i += 1) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + i);
        const cellKey = formatDateKey(cellDate);
        const matches = getMatchesForDate(cellKey, state.activeKey);
        const visibleCases = matches.slice(0, 3);
        const moreCount = matches.length - visibleCases.length;

        cells.push(`
            <button type="button" class="day-cell ${cellDate.getMonth() === month ? 'in-month' : 'out-month'} ${matches.length ? 'has-events' : ''} ${cellKey === state.selectedDateKey ? 'selected' : ''}" data-date="${cellKey}">
                <span class="day-number">${cellDate.getDate()}</span>
                <div class="day-events">
                    ${visibleCases.map(item => `<span class="event-pill">${item.caseStatus || 'Case'}</span>`).join('')}
                    ${moreCount > 0 ? `<span class="more-pill">+${moreCount}</span>` : ''}
                </div>
            </button>
        `);
    }

    calendarGrid.innerHTML = cells.join('');
    document.querySelectorAll('.day-cell').forEach(button => {
        button.addEventListener('click', () => {
            state.selectedDateKey = button.dataset.date;
            renderCalendar();
            renderSelectedDateCases();
        });
    });
};

const loadCases = async () => {
    try {
        const snapshot = await getDocs(query(casesCollection, orderBy("createdAt", "desc")));
        casesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        try {
            const snapshot = await getDocs(casesCollection);
            casesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading cases from Firebase:", error);
            casesCache = [];
        }
    }
    
    updateSelectedDateKey();
    renderCalendar();
    renderSelectedDateCases();
};

const init = () => {
    applyTheme(savedTheme);
    
    if (dateFieldSelect) {
        dateFieldSelect.value = state.activeKey;
        dateFieldSelect.addEventListener('change', event => {
            state.activeKey = event.target.value;
            const firstOfMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
            state.selectedDateKey = formatDateKey(firstOfMonth);
            renderCalendar();
            renderSelectedDateCases();
        });
    }

    prevMonthBtn?.addEventListener('click', () => {
        state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
        state.selectedDateKey = formatDateKey(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1));
        renderCalendar();
        renderSelectedDateCases();
    });

    nextMonthBtn?.addEventListener('click', () => {
        state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
        state.selectedDateKey = formatDateKey(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1));
        renderCalendar();
        renderSelectedDateCases();
    });

    themeToggle?.addEventListener('click', () => {
        const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        localStorage.setItem('caseTrackTheme', nextTheme);
        applyTheme(nextTheme);
    });

    loadCases();
};

init();
