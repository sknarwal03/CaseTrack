const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';

const getCases = () => {
    try {
        const saved = JSON.parse(localStorage.getItem('caseFiles') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
};

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
    const rows = countByKey(getCases(), 'caseStatus');
    const max = Math.max(...rows.map(([, count]) => count), 1);
    const wrapper = document.querySelector('#statusBarChart');
    if (!wrapper) return;

    wrapper.innerHTML = rows.length ? rows.map(([label, count]) => `
        <div class="bar-row">
            <div class="bar-label">${label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
            <div class="bar-value">${count}</div>
        </div>
    `).join('') : '<p class="empty-state">No case data yet.</p>';
};

const renderStageChart = () => {
    const rows = countByKey(getCases(), 'caseStage');
    const max = Math.max(...rows.map(([, count]) => count), 1);
    const wrapper = document.querySelector('#stageBarChart');
    if (!wrapper) return;

    wrapper.innerHTML = rows.length ? rows.map(([label, count]) => `
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

    const rows = countByKey(getCases(), key);
    wrapper.innerHTML = rows.length ? rows.map(([label, count]) => `
        <li>
            <span>${label}</span>
            <span>${count}</span>
        </li>
    `).join('') : '<li><span>No data</span><span>0</span></li>';
};

const updateSummary = () => {
    const allCases = getCases();
    document.querySelector('#reportTotalCases').textContent = allCases.length;
    document.querySelector('#reportDisposed').textContent = allCases.filter(item => String(item.caseStatus || '').trim() === 'Disposed').length;
    document.querySelector('#reportPending').textContent = allCases.filter(item => ['UI', 'UT', 'Untrace', 'Cancellation'].includes(String(item.caseStatus || '').trim())).length;
    document.querySelector('#reportHearings').textContent = allCases.filter(item => item.nextDate).length;
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

const init = () => {
    applyTheme(savedTheme);
    renderStatusChart();
    renderStageChart();
    renderList('courtList', 'courtNumber');
    renderList('policeList', 'policeStation');
    updateSummary();

    themeToggle?.addEventListener('click', () => {
        const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        localStorage.setItem('caseTrackTheme', nextTheme);
        applyTheme(nextTheme);
    });
};

init();
