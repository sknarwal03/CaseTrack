const modal = document.querySelector('#caseModal');
const form = document.querySelector('#caseForm');
const themeToggle = document.querySelector('#themeToggle');
const notificationToggle = document.querySelector('#notificationToggle');
const notificationPanel = document.querySelector('#notificationPanel');

const toggleNotifications = () => {
    if (!notificationPanel) return;
    const isOpen = notificationPanel.classList.toggle('show');
    notificationToggle.setAttribute('aria-expanded', String(isOpen));
};

const closeNotifications = () => {
    if (!notificationPanel) return;
    notificationPanel.classList.remove('show');
    notificationToggle?.setAttribute('aria-expanded', 'false');
};

notificationToggle?.addEventListener('click', e => {
    e.stopPropagation();
    toggleNotifications();
});

document.addEventListener('click', e => {
    if (!notificationPanel?.contains(e.target) && !notificationToggle?.contains(e.target)) {
        closeNotifications();
    }
});

const syncFirYearFromDate = () => {
    if (!form) return;
    const firDateField = form.elements.namedItem('firDate');
    const firYearField = form.elements.namedItem('firYear');
    if (!firDateField || !firYearField) return;

    const setYearFromDate = () => {
        const dateValue = String(firDateField.value || '').trim();
        if (!dateValue) {
            firYearField.value = '';
            return;
        }
        const year = new Date(dateValue + 'T00:00:00').getFullYear();
        firYearField.value = Number.isFinite(year) ? String(year) : '';
    };

    firDateField.addEventListener('change', setYearFromDate);
    setYearFromDate();
};

const getWitnessEntries = value => String(value || '')
    .split(/\r?\n/)
    .map(line => String(line || '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

const syncWitnessCounter = () => {
    if (!form) return;
    const witnessNamesField = form.elements.namedItem('witnessNames');
    const totalWitnessField = form.elements.namedItem('totalWitness');
    if (!witnessNamesField || !totalWitnessField) return;

    totalWitnessField.value = String(getWitnessEntries(witnessNamesField.value).length);
    totalWitnessField.dispatchEvent(new Event('input', { bubbles: true }));
};

const syncListCounter = (fieldName, defaultValue = '1. ') => {
    if (!form) return;
    const field = form.elements.namedItem(fieldName);
    const badge = document.querySelector(`[data-counter-for="${fieldName}"]`);
    if (!field || !badge) return;

    const update = () => {
        const count = getWitnessEntries(field.value).length;
        badge.textContent = String(count);
    };

    field.addEventListener('focus', () => {
        if (!String(field.value || '').trim()) {
            field.value = defaultValue;
        }
        update();
    });

    field.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const currentValue = String(field.value || '');
            const nextNumber = getWitnessEntries(currentValue).length + 1;
            const nextValue = `${currentValue}${currentValue && !currentValue.endsWith('\n') ? '\n' : ''}${nextNumber}. `;
            field.value = nextValue;
            const end = field.value.length;
            field.setSelectionRange?.(end, end);
            update();
            return;
        }

        if ((event.key === 'Backspace' || event.key === 'Delete') && String(field.value || '') === defaultValue) {
            field.value = '';
            update();
        }
    });

    field.addEventListener('input', () => {
        update();
        if (fieldName === 'witnessNames') {
            syncWitnessCounter();
        }
    });

    update();
};

const syncWitnessBalance = () => {
    if (!form) return;
    const totalWitnessField = form.elements.namedItem('totalWitness');
    const witnessExaminedField = form.elements.namedItem('witnessExamined');
    const witnessLeftField = form.elements.namedItem('witnessLeft');
    if (!totalWitnessField || !witnessExaminedField || !witnessLeftField) return;

    const totalWitness = Number.parseInt(String(totalWitnessField.value || '').trim(), 10);
    const witnessExamined = Number.parseInt(String(witnessExaminedField.value || '').trim(), 10);
    const safeTotal = Number.isFinite(totalWitness) ? totalWitness : 0;
    const safeExamined = Number.isFinite(witnessExamined) ? witnessExamined : 0;
    witnessLeftField.value = String(Math.max(safeTotal - safeExamined, 0));
};

const openModal = () => {
    const firDateField = form.elements.namedItem('firDate');
    const firYearField = form.elements.namedItem('firYear');
    if (firDateField && firYearField) {
        const dateValue = String(firDateField.value || '').trim();
        firYearField.value = dateValue ? String(new Date(dateValue + 'T00:00:00').getFullYear()) : '';
    }
    syncWitnessCounter();
    syncWitnessBalance();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    modal.classList.remove('show');
    document.body.style.overflow = '';
};

document.querySelector('#openModal').onclick = openModal;
document.querySelector('#closeModal').onclick = closeModal;
document.querySelector('#cancelModal').onclick = closeModal;

modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

const getCases = () => JSON.parse(localStorage.getItem('caseFiles') || '[]');
const getRegistrationDateValue = caseItem => caseItem?.registrationDate || caseItem?.putInCourtDate || '';
const formatDate = value => value ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

const updateTodayDate = () => {
    const dateEl = document.querySelector('#todayDate');
    if (!dateEl) return;

    const today = new Date();
    dateEl.textContent = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(today);
};

const getDimensionSummary = (cases, fieldKey) => {
    const counts = {};

    cases.forEach(caseItem => {
        const value = String(caseItem[fieldKey] || '').trim();
        const key = value || 'Unspecified';
        counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
};

const getDimensionKey = selectedValue => {
    const map = {
        'FIR Year': 'firYear',
        'Court Type': 'courtType',
        'Court Name': 'courtNumber',
        'Case Stage': 'caseStage'
    };

    return map[selectedValue] || 'firYear';
};

let activePcRange = 'thisMonth';

const togglePanelViewAll = (panelId, visibleCount, totalCount) => {
    const button = document.querySelector(`.panel-view-all[data-panel="${panelId}"]`);
    if (!button) return;
    button.classList.toggle('visible', totalCount > visibleCount);
};

const navigateToCasesPage = (panelId, range) => {
    const params = new URLSearchParams();
    if (panelId === 'pc-this-month' && range) {
        params.set('range', range);
    }
    window.location.href = `cases.html${params.toString() ? `?${params.toString()}` : ''}`;
};

const getPcCaseRange = range => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const ranges = {
        thisMonth: {
            label: 'This Month',
            start: new Date(currentYear, currentMonth, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        lastMonth: {
            label: 'Last Month',
            start: new Date(currentYear, currentMonth - 1, 1),
            end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
        },
        last6Months: {
            label: 'Last 6 Months',
            start: new Date(currentYear, currentMonth - 5, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        thisYear: {
            label: 'This Year',
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 31, 23, 59, 59, 999)
        }
    };

    return ranges[range] || ranges.thisMonth;
};

const matchesPcRange = (dateValue, range) => {
    if (!dateValue) return false;
    const date = new Date(dateValue + 'T00:00:00');
    const bounds = getPcCaseRange(range);
    return date >= bounds.start && date <= bounds.end;
};

const renderPcList = (range = 'thisMonth') => {
    activePcRange = range;
    const cases = getCases();
    const list = document.querySelector('#pcThisMonthList');
    const trigger = document.querySelector('.pc-range-trigger');
    const options = document.querySelectorAll('.pc-range-option');

    if (!list) return;

    const bounds = getPcCaseRange(range);
    const filtered = cases
        .map(c => ({ ...c, _registrationDate: getRegistrationDateValue(c) }))
        .filter(c => c._registrationDate)
        .filter(c => {
            const date = new Date(c._registrationDate + 'T00:00:00');
            return date >= bounds.start && date <= bounds.end;
        })
        .sort((a, b) => new Date(b._registrationDate + 'T00:00:00') - new Date(a._registrationDate + 'T00:00:00'))
        .slice(0, 5);

    if (trigger) {
        trigger.innerHTML = `${bounds.label} <span>▾</span>`;
    }

    const totalInRange = cases.filter(c => getRegistrationDateValue(c) && matchesPcRange(getRegistrationDateValue(c), range)).length;
    togglePanelViewAll('pc-this-month', 5, totalInRange);

    options.forEach(option => {
        option.classList.toggle('active', option.dataset.range === range);
    });

    list.innerHTML = filtered.length ? filtered.map(c => `
        <div class="case-row">
            <div class="case-doc">▧</div>
            <div class="case-info">
                <b>FIR-${c.firNo}/${c.firYear}</b>
                <small>${c._registrationDate ? formatDate(c._registrationDate) : (c.underSection || 'Case details')}</small>
            </div>
            <span class="badge ${c.caseStatus === 'Disposed' ? 'closed' : c.caseStatus === 'UT' ? 'pending' : ''}">${c.caseStatus}</span>
        </div>
    `).join('') : '<p class="empty">No cases found for this range.</p>';
};

function renderDashboard() {
    const cases = getCases();
    const total = cases.length;
    const donut = document.querySelector('.donut');
    const tooltip = document.querySelector('.donut-tooltip');
    const legendList = document.querySelector('.legend');
    const statusFilter = document.querySelector('.status-filter');
    const selectedField = statusFilter ? statusFilter.value : 'FIR Year';
    const fieldKey = getDimensionKey(selectedField);
    const summary = getDimensionSummary(cases, fieldKey);
    const palette = ['#3994ff', '#19d49b', '#8854f4', '#ff9f43', '#2ec4b6', '#f472b6', '#60a5fa', '#94a3b8'];

    renderPcList(activePcRange || document.querySelector('.pc-range-option.active')?.dataset.range || 'thisMonth');

    document.querySelector('#totalCases').textContent = total;
    document.querySelector('#activeCases').textContent = cases.filter(c => !['Disposed', 'Cancellation', 'UI', 'UT', 'Untrace'].includes(String(c.caseStatus || '').trim())).length;
    document.querySelector('#pendingHearings').textContent = cases.filter(c => c.nextDate).length;
    document.querySelector('#closedCases').textContent = cases.filter(c => String(c.caseStatus || '').trim() === 'Disposed').length;
    document.querySelector('#donutTotal').textContent = total;

    if (legendList) {
        legendList.innerHTML = summary.length
            ? summary.map((item, index) => `
                <li>
                    <i style="background:${palette[index % palette.length]}"></i>
                    <span>${item.label}</span>
                    <b>${item.count}</b>
                </li>
            `).join('')
            : '<li><i style="background:#94a3b8"></i><span>No data</span><b>0</b></li>';
    }

    if (donut) {
        let current = 0;
        const gradient = summary.length
            ? summary.map((item, index) => {
                const start = current;
                const end = current + (total ? (item.count / total) * 100 : 0);
                current = end;
                return `${palette[index % palette.length]} ${start}% ${end}%`;
            }).join(', ')
            : '#94a3b8 0 100%';

        donut.style.background = `conic-gradient(${gradient})`;

        const segmentMeta = summary.map((item, index) => ({
            label: item.label,
            count: item.count,
            percentage: total ? ((item.count / total) * 100).toFixed(1) : '0.0',
            color: palette[index % palette.length],
            key: selectedField
        }));

        donut.onmousemove = event => {
            if (!segmentMeta.length) {
                tooltip?.classList.remove('show');
                donut.classList.remove('is-hovered');
                return;
            }

            const rect = donut.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const dx = x - cx;
            const dy = y - cy;
            const radius = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
            const normalized = (angle + 360) % 360;

            if (radius < 18 || radius > rect.width / 2 - 12) {
                tooltip?.classList.remove('show');
                donut.classList.remove('is-hovered');
                return;
            }

            let cumulative = 0;
            let hovered = null;

            for (const item of segmentMeta) {
                const segmentAngle = total ? (item.count / total) * 360 : 0;
                const start = cumulative;
                const end = cumulative + segmentAngle;
                cumulative = end;
                if (normalized >= start && normalized < end) {
                    hovered = item;
                    break;
                }
            }

            if (!hovered) hovered = segmentMeta[segmentMeta.length - 1];

            if (!tooltip || !hovered) return;

            tooltip.innerHTML = `
                <div class="tooltip-label"><i style="color:${hovered.color}; background:${hovered.color};"></i>${hovered.label}</div>
                <div class="tooltip-row"><strong>Cases</strong><span>${hovered.count}</span></div>
                <div class="tooltip-row"><strong>Percentage</strong><span>${hovered.percentage}%</span></div>
            `;
            tooltip.style.color = hovered.color;
            tooltip.style.borderColor = `${hovered.color}88`;
            tooltip.style.left = `${rect.width / 2 + Math.cos((normalized - 90) * Math.PI / 180) * 18}px`;
            tooltip.style.top = `${rect.height / 2 + Math.sin((normalized - 90) * Math.PI / 180) * 18}px`;
            tooltip.classList.add('show');
            donut.classList.add('is-hovered');
            donut.style.filter = `saturate(1.12) brightness(1.08) drop-shadow(0 0 10px ${hovered.color}66)`;
        };

        donut.onmouseleave = () => {
            tooltip?.classList.remove('show');
            donut.classList.remove('is-hovered');
            donut.style.filter = '';
        };
    }

    const hearings = cases.filter(c => c.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 4);

    document.querySelector('#hearingList').innerHTML = hearings.length ? hearings.map(c => {
        const d = new Date(c.nextDate + 'T00:00:00');
        return `
            <div class="hearing">
                <div class="date-box">
                    <b>${String(d.getDate()).padStart(2, '0')}</b>
                    <small>${d.toLocaleString('en', { month: 'short' }).toUpperCase()}</small>
                </div>
                <div class="hearing-info">
                    <b>FIR-${c.firNo}/${c.firYear}</b>
                    <small>${c.courtNumber || c.policeStation || 'Court hearing'}</small>
                </div>
                <span class="time">Upcoming</span>
            </div>
        `;
    }).join('') : '<p class="empty">No upcoming hearing dates yet.</p>';

    togglePanelViewAll('hearings', 4, hearings.length);
    togglePanelViewAll('tasks', 3, document.querySelectorAll('#tasks .task').length);
}

const witnessNamesField = form?.elements.namedItem('witnessNames');
const totalWitnessField = form?.elements.namedItem('totalWitness');

if (form) {
    syncListCounter('witnessNames');
    syncListCounter('accused');

    const witnessExaminedField = form.elements.namedItem('witnessExamined');
    totalWitnessField?.addEventListener('input', syncWitnessBalance);
    witnessExaminedField?.addEventListener('input', syncWitnessBalance);

    form.addEventListener('reset', () => {
        setTimeout(() => {
            const accusedField = form.elements.namedItem('accused');
            if (accusedField && !String(accusedField.value || '').trim()) {
                accusedField.value = '1. ';
                accusedField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (witnessNamesField && !String(witnessNamesField.value || '').trim()) {
                witnessNamesField.value = '1. ';
                witnessNamesField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            syncWitnessCounter();
            syncWitnessBalance();
        }, 0);
    });
}

const bindPcRangeSelector = () => {
    const trigger = document.querySelector('.pc-range-trigger');
    const options = document.querySelectorAll('.pc-range-option');

    if (!trigger || !options.length) return;

    trigger.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const menu = trigger.parentElement.querySelector('.pc-range-panel');
        if (!menu) return;
        const shouldOpen = !menu.classList.contains('show-dropdown');
        menu.classList.toggle('show-dropdown', shouldOpen);
        menu.style.display = shouldOpen ? '' : 'none';
    });

    document.addEventListener('click', event => {
        const menu = document.querySelector('.pc-range-menu');
        if (!menu) return;
        if (!menu.contains(event.target)) {
            menu.querySelector('.pc-range-panel')?.classList.remove('show-dropdown');
            menu.querySelector('.pc-range-panel')?.style.setProperty('display', 'none');
        }
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            const range = option.dataset.range || 'thisMonth';
            activePcRange = range;
            renderPcList(range);
            const panel = option.closest('.pc-range-panel');
            panel?.classList.remove('show-dropdown');
            if (panel) panel.style.display = 'none';
        });
    });
};

const bindViewAllButtons = () => {
    document.querySelectorAll('.panel-view-all').forEach(button => {
        button.addEventListener('click', () => {
            const panelId = button.dataset.panel;
            const range = panelId === 'pc-this-month' ? (activePcRange || 'thisMonth') : 'all';
            navigateToCasesPage(panelId, range);
        });
    });
};

form.addEventListener('submit', e => {
    e.preventDefault();
    const item = Object.fromEntries(new FormData(form));
    const cases = getCases();
    cases.push(item);
    localStorage.setItem('caseFiles', JSON.stringify(cases));
    form.reset();
    closeModal();
    renderDashboard();
});

document.querySelector('#caseSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.case-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
});

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    themeToggle.textContent = isLight ? '☾' : '☼';
    themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    themeToggle.setAttribute('aria-pressed', String(isLight));
};

applyTheme(localStorage.getItem('caseTrackTheme') || 'dark');
syncFirYearFromDate();
themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});

const statusFilter = document.querySelector('.status-filter');
statusFilter?.addEventListener('change', () => {
    renderDashboard();
});

updateTodayDate();
bindPcRangeSelector();
bindViewAllButtons();
renderDashboard();
document.getElementById("firDate").addEventListener("click", function () {
    this.showPicker();
});