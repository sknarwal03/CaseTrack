import { db } from '@config/firebase-config.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

const detailsModal = document.querySelector('#caseDetailsModal');
const closeDetailModalButton = document.querySelector('[data-close-detail-modal]');

let casesCache = [];
const casesCollection = collection(db, 'cases');

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

const loadCases = async () => {
    try {
        const snapshot = await getDocs(query(casesCollection, orderBy('createdAt', 'desc')));
        casesCache = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
        try {
            const snapshot = await getDocs(casesCollection);
            casesCache = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        } catch (fallbackError) {
            console.error('Failed to load cases:', fallbackError);
            casesCache = [];
        }
    }
    renderCaseTable();
};

window.addEventListener('caseAdded', () => { loadCases(); });

const renderCaseTable = () => {
    const tableBody = document.querySelector('#casesTableBody');
    if (!tableBody) return;
    if (casesCache.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No cases found.</td></tr>';
        return;
    }
    tableBody.innerHTML = '';
    casesCache.forEach(caseItem => {
        const row = document.createElement('tr');
        row.className = 'case-row-data';

        row.dataset.status = (caseItem.status || '').toLowerCase();
        row.dataset.highlighted = caseItem.highlighted ? 'true' : 'false';
        row.dataset.firyear = caseItem.firYear || '';

        const hasPo = Array.isArray(caseItem.accused) && caseItem.accused.some(a => a.poStatus === true);
        row.dataset.po = hasPo ? 'true' : 'false';

        if (caseItem.highlighted) row.classList.add('highlighted');

        let statusClass = '';
        const st = (caseItem.status || '').toLowerCase();
        if (st === 'ut' || st === 'ui') statusClass = 'status-ut';
        else if (st === 'disposed' || st === 'cancellation') statusClass = 'status-disp';
        else statusClass = 'status-pd';

        row.innerHTML =
            '<td><strong>' + (caseItem.firNo || '') + '</strong></td>' +
            '<td>' + (caseItem.firDate || '') + '</td>' +
            '<td>' + (caseItem.underSection || '') + '</td>' +
            '<td>' + (caseItem.courtName || '') + '</td>' +
            '<td>' + (caseItem.nextDate || '') + '</td>' +
            '<td><span class="status-badge ' + statusClass + '">' + (caseItem.trialStage || '') + '</span></td>' +
            '<td><div class="table-actions">' +
            '<button class="icon-btn view-btn" title="View Details">👁</button>' +
            '<button class="icon-btn edit-btn" title="Edit Case">✎</button>' +
            '</div></td>';

        row.addEventListener('click', event => {
            if (event.target.closest('.icon-btn')) return;
            openDetailModal(caseItem);
        });
        row.querySelector('.view-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            openDetailModal(caseItem);
        });
        row.querySelector('.edit-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            if (window.openAddCaseModal) window.openAddCaseModal(caseItem);
        });
        tableBody.appendChild(row);
    });
};

const closeDetailModal = () => {
    if (!detailsModal) return;
    detailsModal.classList.remove('show');
    detailsModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
};

const openDetailModal = caseItem => {
    if (!detailsModal) return;
    const firLabel = document.querySelector('#detailFIRLabel');
    if (firLabel) firLabel.textContent = 'FIR No. ' + (caseItem.firNo || '') + ' / ' + (caseItem.firYear || '');

    const badge = document.querySelector('#detailStatusBadge');
    if (badge) badge.textContent = caseItem.status || '';

    const nextHearingLabel = document.querySelector('.detail-header-card h3:last-child');
    if (nextHearingLabel) nextHearingLabel.textContent = (caseItem.nextDate || '') + ' - ' + (caseItem.trialStage || '');

    const detailFields = document.querySelector('#caseDetailFields');
    if (detailFields) {
        const generalFields = [
            ['Court Type', caseItem.courtType],
            ['Date of FIR', caseItem.firDate],
            ['Under Section', caseItem.underSection],
            ['Crime Head', caseItem.crimeHead],
            ['Police Station', caseItem.policeStation],

            ['Registration Prefix', caseItem.regPrefix],
            ['Registration No', caseItem.regNo],
            ['Registration Year', caseItem.regYear],
            ['Registration Date', caseItem.regDate],
            ['Court Name', caseItem.courtName],
            ['Challan Date', caseItem.challanDate],
            ['Charge Date', caseItem.chargeDate],
            ['Decision Date', caseItem.decisionDate],

            ['IO Rank', caseItem.ioRank],
            ['IO Name', caseItem.ioName],
            ['Belt No', caseItem.beltNo],
            ['IO Mobile', caseItem.mobileNo],

            ['Incident Date', caseItem.incidentDate],
            ['Incident Place', caseItem.incidentPlace],
            ['Complainant', caseItem.complainantName],
            ['Complainant Father', caseItem.complainantFatherName],
            ['Complainant Mobile', caseItem.complainantMobile],
            ['Complainant Address', caseItem.complainantAddress],

            ['Highlighted', caseItem.highlighted ? 'Yes' : 'No']
        ].filter(([, value]) => value !== undefined && value !== '');

        let html = generalFields.map(([label, value]) => '<div class="detail-item"><span>' + label + '</span><strong>' + value + '</strong></div>').join('');

        if (caseItem.accused && caseItem.accused.length > 0) {
            html += '<div style="grid-column: 1 / -1; margin-top: 1rem;"><h4>Accused</h4></div>';
            caseItem.accused.forEach((a, i) => {
                const details = [];
                if (a.fatherName) details.push('S/o ' + a.fatherName);
                if (a.mobile) details.push(a.mobile);
                if (a.arrested) details.push('Arrested: ' + a.arrestDate);
                if (
                    a.custodyStatus === 'bailed_police' ||
                    a.custodyStatus === 'bailed_court'
                ) {
                    details.push('Bail: ' + a.bailDate);
                }
                if (a.poStatus) details.push('PO: ' + a.poDate);

                html += '<div class="detail-item" style="grid-column: 1 / -1; border-left: 2px solid #5d429a; padding-left: 10px;"><span>Accused ' + (i + 1) + '</span><strong>' + a.name + '</strong>' + (details.length ? '<small>' + details.join(' | ') + '</small>' : '') + '</div>';
            });
        }

        if (caseItem.witnesses && caseItem.witnesses.length > 0) {
            html += '<div style="grid-column: 1 / -1; margin-top: 1rem;"><h4>Witnesses</h4></div>';
            caseItem.witnesses.forEach((w, i) => {
                const details = [];
                if (w.status) details.push('Status: ' + w.status);
                if (w.examined) details.push('Examined: ' + w.examinedDate);

                html += '<div class="detail-item" style="grid-column: 1 / -1; border-left: 2px solid #4a90e2; padding-left: 10px;"><span>Witness ' + (i + 1) + '</span><strong>' + w.name + '</strong>' + (details.length ? '<small>' + details.join(' | ') + '</small>' : '') + '</div>';
            });
        }

        detailFields.innerHTML = html;
    }

    detailsModal.classList.add('show');
    detailsModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

closeDetailModalButton?.addEventListener('click', closeDetailModal);
detailsModal?.addEventListener('click', event => { if (event.target === detailsModal) closeDetailModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && detailsModal?.classList.contains('show')) closeDetailModal(); });

// Search functionality
document.addEventListener('input', event => {
    if (event.target.id === 'globalSearch') {
        const q = event.target.value.trim().toLowerCase();
        document.querySelectorAll('.case-row-data').forEach(row => {
            row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    }
});

// Status filters
document.querySelectorAll('.case-filter').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.case-filter').forEach(btn => btn.classList.toggle('active', btn === button));
        const filter = button.dataset.filter;

        document.querySelectorAll('.case-row-data').forEach(row => {
            if (filter === 'all') {
                row.style.display = '';
            } else if (filter === 'pending') {
                const st = row.dataset.status;
                row.style.display = (st !== 'disposed' && st !== 'cancellation') ? '' : 'none';
            } else if (filter === 'disposed') {
                row.style.display = (row.dataset.status === 'disposed') ? '' : 'none';
            } else if (filter === 'po') {
                row.style.display = (row.dataset.po === 'true') ? '' : 'none';
            } else if (filter === 'star') {
                row.style.display = (row.dataset.highlighted === 'true') ? '' : 'none';
            } else if (filter === 'year' || filter.match(/^\d{4}$/)) {
                // Year filter
                const targetYear = filter === 'year' ? new Date().getFullYear().toString() : filter;
                row.style.display = (row.dataset.firyear === targetYear) ? '' : 'none';
            } else {
                row.style.display = 'none';
            }
        });
    });
});

loadCases();