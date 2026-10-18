import { db } from '@config/firebase-config.js';
import { parseCaseDate, setupModal } from './shared-utils.js';
import { normalizeTrialStage } from './trial-stages.js';
import { loadCaseRecords } from './fir-case-model.js';

const detailsModal = document.querySelector('#caseDetailsModal');
const modalHelper = setupModal(detailsModal);

let casesCache = [];
let activeCaseSort = { key: '', direction: '' };
let casesLoadError = null;
const REGISTER_DIARY_FILE_STATUS_KEY = 'register-diary-file-statuses';

function applyCaseFilters() {
    const filter = document.querySelector('.case-filter.active')?.dataset.filter || 'all';
    const query = document.getElementById('globalSearch')?.value.trim().toLowerCase() || '';
    const isPoFilter = filter === 'po';
    const isDisposedFilter = filter === 'disposed';
    const hearingHeader = document.querySelector('[data-sort="nextDate"]');
    if (hearingHeader) {
        hearingHeader.textContent = isPoFilter
            ? 'PO Accused - PO Date'
            : isDisposedFilter ? 'Disposed Date - Judgement' : 'Next Hearing';
    }
    const rows = [...document.querySelectorAll('.case-row-data')];
    let visibleCount = 0;

    rows.forEach(row => {
        const hearingCell = row.querySelector('.next-hearing-cell');
        if (hearingCell) {
            const firstValue = isPoFilter
                ? row.dataset.poAccused
                : isDisposedFilter ? row.dataset.decisionDate : row.dataset.nextDate;
            const secondValue = isPoFilter
                ? row.dataset.poDates
                : isDisposedFilter ? row.dataset.judgement : row.dataset.caseStage;
            hearingCell.textContent = [firstValue, secondValue].filter(Boolean).join(' - ');
            hearingCell.title = hearingCell.textContent.trim();
        }

        let matchesFilter = filter === 'po'
            ? row.dataset.po === 'true'
            : row.dataset.poRowIndex === '0';
        if (filter === 'pending') {
            matchesFilter = matchesFilter && row.dataset.status !== 'disposed'
                && row.dataset.status !== 'cancellation' && row.dataset.status !== 'committed';
        } else if (filter === 'disposed') {
            matchesFilter = matchesFilter && row.dataset.status === 'disposed';
        } else if (filter === 'po') {
            matchesFilter = row.dataset.po === 'true';
        } else if (filter === 'star') {
            matchesFilter = matchesFilter && row.dataset.highlighted === 'true';
        }

        const matchesSearch = !query || row.textContent.toLowerCase().includes(query);
        const visible = matchesFilter && matchesSearch;
        row.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
    });

    const total = document.getElementById('caseTotalCount');
    if (total) total.textContent = `Total Records: ${visibleCount}`;
}

function getCaseSortValue(caseItem, key) {
    if (key === 'firNo') {
        return [caseItem.firNo || '', caseItem.firYear || ''].filter(Boolean).join('/');
    }
    if (key === 'firDate' || key === 'nextDate') {
        const value = key === 'nextDate' ? getCaseHearingSummary(caseItem).date : caseItem[key];
        const parsedDate = parseCaseDate(value);
        return parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : null;
    }
    if (key === 'courtNumber') return caseItem.courtName || caseItem.courtNumber || '';
    if (key === 'caseStage') return caseItem.trialStage || '';
    return caseItem[key] || '';
}

function compareCaseValues(left, right, key) {
    const leftValue = getCaseSortValue(left, key);
    const rightValue = getCaseSortValue(right, key);
    if (leftValue === null || leftValue === '') return rightValue === null || rightValue === '' ? 0 : 1;
    if (rightValue === null || rightValue === '') return -1;
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue;
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
}

function getRegisterDiaryDateRecords(caseItem) {
    const firestoreRecords = Array.isArray(caseItem.hearingDateRecord)
        ? caseItem.hearingDateRecord
        : Array.isArray(caseItem.registerDiaryDaterecords)
            ? caseItem.registerDiaryDaterecords
            : Array.isArray(caseItem.registerDiaryDateRecords)
                ? caseItem.registerDiaryDateRecords
                : null;
    if (firestoreRecords) {
        return firestoreRecords.filter(record => record && typeof record.date === 'string'
            && ['previous', 'next'].includes(record.kind));
    }

    try {
        const saved = JSON.parse(localStorage.getItem(REGISTER_DIARY_FILE_STATUS_KEY) || '{}');
        const records = saved?.[caseItem.id]?.dateRecords;
        return Array.isArray(records)
            ? records.filter(record => record && typeof record.date === 'string'
                && ['previous', 'next'].includes(record.kind))
            : [];
    } catch (error) {
        console.error('Could not load register diary dates for case timeline:', error);
        return [];
    }
}

function getCaseHearingSummary(caseItem) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const records = getRegisterDiaryDateRecords(caseItem)
        .map(record => ({ ...record, parsedDate: parseCaseDate(record.date) }))
        .filter(record => record.parsedDate && !Number.isNaN(record.parsedDate.getTime()));
    const upcoming = records
        .filter(record => {
            if (record.kind !== 'next') return false;
            const date = new Date(record.parsedDate);
            date.setHours(0, 0, 0, 0);
            return date > today;
        })
        .sort((left, right) => right.parsedDate - left.parsedDate)[0];

    if (upcoming) {
        return {
            date: upcoming.parsedDate.toLocaleDateString('en-GB'),
            trialStage: normalizeTrialStage(upcoming.trialStage)
        };
    }
    if (records.length > 0) return { date: '', trialStage: '' };
    return {
        date: caseItem.nextDate || '',
        trialStage: normalizeTrialStage(caseItem.trialStage)
    };
}

// parseCaseDate is imported from shared-utils.js

const loadCases = async () => {
    try {
        casesCache = await loadCaseRecords(db);
        casesLoadError = null;
    } catch (error) {
        console.error('Failed to load FIR and proceeding records:', error);
        casesLoadError = error;
        casesCache = [];
    }
    renderCaseTable();
    const requestedCaseId = new URLSearchParams(window.location.search).get('case');
    if (requestedCaseId) {
        const requestedCollection = new URLSearchParams(window.location.search).get('collection');
        const requestedCase = casesCache.find(caseItem => caseItem.id === requestedCaseId
            && (!requestedCollection || caseItem._collectionName === requestedCollection));
        if (requestedCase) {
            openDetailModal(requestedCase);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }
};

window.addEventListener('caseAdded', () => { loadCases(); });

const renderCaseTable = () => {
    const tableBody = document.querySelector('#casesTableBody');
    if (!tableBody) return;
    if (casesCache.length === 0) {
        const message = casesLoadError
            ? 'Could not load FIR and proceeding records. Check access and retry.'
            : 'No cases found.';
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">${message}</td></tr>`;
        applyCaseFilters();
        return;
    }
    tableBody.innerHTML = '';
    const casesToRender = [...casesCache];
    if (activeCaseSort.key) {
        casesToRender.sort((left, right) => {
            const result = compareCaseValues(left, right, activeCaseSort.key);
            return activeCaseSort.direction === 'desc' ? -result : result;
        });
    }
    casesToRender.forEach(caseItem => {
        const poAccused = (caseItem.accused || []).filter(accused => accused.poStatus === true);
        const displayedAccused = poAccused.length ? poAccused : [null];
        displayedAccused.forEach((poAccusedPerson, poRowIndex) => {
        const row = document.createElement('tr');
        row.className = 'case-row-data';

        row.dataset.status = (caseItem.status || '').toLowerCase();
        row.dataset.highlighted = caseItem.highlighted ? 'true' : 'false';
        row.dataset.firyear = caseItem.firYear || '';

        row.dataset.po = poAccusedPerson ? 'true' : 'false';
        row.dataset.poRowIndex = String(poRowIndex);
        row.dataset.poAccused = poAccusedPerson?.name || '';
        row.dataset.poDates = poAccusedPerson?.poDate || '';
        const hearingSummary = getCaseHearingSummary(caseItem);
        row.dataset.nextDate = hearingSummary.date;
        row.dataset.caseStage = hearingSummary.trialStage;
        row.dataset.decisionDate = caseItem.decisionDate || '';
        row.dataset.judgement = caseItem.judgement || caseItem.judgment || '';

        if (caseItem.highlighted) row.classList.add('highlighted');

        let statusClass = '';
        const st = (caseItem.status || '').toLowerCase();
        if (st === 'ut' || st === 'ui') statusClass = 'status-ut';
        else if (st === 'disposed' || st === 'cancellation') statusClass = 'status-disp';
        else statusClass = 'status-pd';
        row.dataset.statusClass = statusClass;

        let displayFir = caseItem.firNo || '';
        if (caseItem.firNo && caseItem.firYear) {
            const yrStr = String(caseItem.firYear).trim();
            if (yrStr.length >= 2) {
                displayFir = caseItem.firNo + '/' + yrStr.slice(-2);
            }
        }

        row.innerHTML =
            '<td><strong style="cursor: pointer; color: var(--primary);" class="fir-trigger">' + displayFir + '</strong></td>' +
            '<td>' + (caseItem.firDate || '') + '</td>' +
            '<td>' + (caseItem.underSection || '') + '</td>' +
            '<td>' + (caseItem.courtName || '') + '</td>' +
            '<td class="next-hearing-cell">' + [hearingSummary.date, hearingSummary.trialStage].filter(Boolean).join(' - ') + '</td>' +
            '<td><div class="table-actions">' +
            '<button class="icon-btn view-btn" title="View Details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
            '<button class="icon-btn edit-btn" title="Edit Case"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>' +
            '</div></td>';

        row.querySelectorAll('td').forEach(cell => {
            const fullValue = cell.textContent.trim();
            if (fullValue) cell.title = fullValue;
        });

        row.querySelector('.fir-trigger')?.addEventListener('click', event => {
            event.stopPropagation();
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
    });
    applyCaseFilters();
};

const openDetailModal = caseItem => {
    if (!detailsModal) return;

    let shareWrap = document.querySelector('#sharePdfWrap');
    if (!shareWrap) {
        const header = detailsModal.querySelector('.modal-header');
        if (header) {
            shareWrap = document.createElement('div');
            shareWrap.id = 'sharePdfWrap';
            shareWrap.style.position = 'relative';
            shareWrap.style.marginLeft = 'auto';
            shareWrap.style.marginRight = '15px';
            shareWrap.style.display = 'flex';
            shareWrap.style.alignItems = 'center';
            shareWrap.style.gap = '8px';
            shareWrap.innerHTML = `
                <button id="sharePdfBtn" class="case-modal-icon-btn share-case-icon" type="button" aria-label="Share case" title="Share case"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"></path></svg></button>
                <button id="editCaseModalBtn" class="case-modal-icon-btn edit-case-icon" type="button" aria-label="Edit case" title="Edit case"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button>
                <div id="shareMenu" style="display: none; position: absolute; right: 0; top: 100%; margin-top: 8px; background: var(--panel, #1e293b); border: 1px solid var(--line, #334155); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 100; min-width: 180px; overflow: hidden;">
                    <a href="#" id="sharePrint" style="display: block; padding: 12px 16px; color: var(--text, #f8fafc); text-decoration: none; font-size: 14px; border-bottom: 1px solid var(--line, #334155);">🖨️ Print / Save PDF</a>
                    <a href="#" id="shareWa" style="display: block; padding: 12px 16px; color: var(--text, #f8fafc); text-decoration: none; font-size: 14px; border-bottom: 1px solid var(--line, #334155);">📱 WhatsApp</a>
                    <a href="#" id="shareEmail" style="display: block; padding: 12px 16px; color: var(--text, #f8fafc); text-decoration: none; font-size: 14px; border-bottom: 1px solid var(--line, #334155);">📧 Email</a>
                    <a href="#" id="shareNative" style="display: block; padding: 12px 16px; color: var(--text, #f8fafc); text-decoration: none; font-size: 14px;">📤 Native Share</a>
                </div>
            `;
            header.insertBefore(shareWrap, header.querySelector('.close'));

            const shareBtn = shareWrap.querySelector('#sharePdfBtn');
            const shareMenu = shareWrap.querySelector('#shareMenu');
            
            shareBtn.onclick = (e) => {
                e.stopPropagation();
                shareMenu.style.display = shareMenu.style.display === 'none' ? 'block' : 'none';
            };
            document.addEventListener('click', (e) => {
                if (!shareWrap.contains(e.target)) {
                    shareMenu.style.display = 'none';
                }
            });
            
            shareMenu.querySelectorAll('a').forEach(a => {
                a.onmouseover = () => a.style.background = 'rgba(128, 128, 128, 0.1)';
                a.onmouseout = () => a.style.background = 'transparent';
            });
        }
    }

    if (shareWrap) {
        let displayFir = caseItem.firNo || '';
        if (caseItem.firNo && caseItem.firYear) {
            const yrStr = String(caseItem.firYear).trim();
            if (yrStr.length >= 2) displayFir = caseItem.firNo + '/' + yrStr.slice(-2);
        }
        const textSummary = `Case Details\nFIR No: ${displayFir}\nStatus: ${caseItem.status || 'N/A'}\nNext Date: ${caseItem.nextDate || 'N/A'}\nCourt: ${caseItem.courtName || 'N/A'}`;

        const shareMenu = shareWrap.querySelector('#shareMenu');
        shareWrap.querySelector('#editCaseModalBtn').onclick = event => {
            event.stopPropagation();
            shareMenu.style.display = 'none';
            modalHelper?.closeModal();
            window.openAddCaseModal?.(caseItem);
        };
        
        shareWrap.querySelector('#sharePrint').onclick = (e) => {
            e.preventDefault();
            shareMenu.style.display = 'none';
            
            const content = document.querySelector('.detail-modal-body').innerHTML;
            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(s => s.outerHTML).join('\n');
            
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>FIR Details - ${caseItem.firNo || ''}/${caseItem.firYear || ''}</title>
                        ${styles}
                        <style>
                            :root {
                                --pdf-bg: #ffffff;
                                --pdf-card: #f8fafc;
                                --pdf-text: #1e293b;
                                --pdf-border: #e2e8f0;
                                --pdf-muted: #64748b;
                                --pdf-accent: #e0f2fe;
                            }
                            body { 
                                background: var(--pdf-bg) !important; 
                                color: var(--pdf-text) !important;
                                padding: 20px; 
                                overflow: visible !important; 
                                font-family: 'Segoe UI', system-ui, sans-serif;
                            }
                            h2, h3, h4 { color: #0f172a !important; }
                            .detail-label { color: var(--pdf-muted) !important; }
                            .detail-modal-body { max-height: none !important; overflow: visible !important; }
                            .detail-header-card { 
                                background: var(--pdf-accent) !important;
                                border: 1px solid #bae6fd !important; 
                                padding: 15px; 
                                margin-bottom: 20px; 
                                border-radius: 8px; 
                            }
                            .detail-header-card h3 { color: #0369a1 !important; }
                            .detail-header-card .detail-status {
                                background: #dbeafe !important;
                                color: #1e40af !important;
                                border: 1px solid #bfdbfe !important;
                            }
                            .detail-item { 
                                background: var(--pdf-card) !important;
                                padding: 10px;
                                border-radius: 6px;
                                border: 1px solid var(--pdf-border) !important;
                                color: var(--pdf-text) !important;
                            }
                            .detail-item strong { color: #0f172a !important; }
                            .detail-item span { color: var(--pdf-muted) !important; }
                            
                            span[style*="#555"] { color: var(--pdf-muted) !important; }
                            div[style*="border-bottom"] { border-bottom-color: var(--pdf-border) !important; }

                            @media print {
                                @page { size: A4; margin: 15mm; }
                                body { 
                                    -webkit-print-color-adjust: exact !important; 
                                    print-color-adjust: exact !important; 
                                    background: var(--pdf-bg) !important;
                                }
                                h4 { page-break-after: avoid; }
                                .detail-item, .detail-header-card { page-break-inside: avoid; }
                            }
                        </style>
                    </head>
                    <body>
                        <h2 style="text-align: center; margin-bottom: 20px; color: var(--primary);">Case Information Report</h2>
                        <div class="detail-modal-body">${content}</div>
                        <script>
                            window.onload = () => {
                                setTimeout(() => {
                                    window.print();
                                    window.close();
                                }, 250);
                            };
                        </script>
                    </body>
                    </html>
                `);
                printWindow.document.close();
            }
        };

        shareWrap.querySelector('#shareWa').onclick = (e) => {
            e.preventDefault();
            shareMenu.style.display = 'none';
            window.open(`https://wa.me/?text=${encodeURIComponent(textSummary)}`, '_blank');
        };

        shareWrap.querySelector('#shareEmail').onclick = (e) => {
            e.preventDefault();
            shareMenu.style.display = 'none';
            window.open(`mailto:?subject=${encodeURIComponent('Case Details - FIR ' + displayFir)}&body=${encodeURIComponent(textSummary)}`, '_self');
        };

        const nativeBtn = shareWrap.querySelector('#shareNative');
        if (navigator.share) {
            nativeBtn.style.display = 'block';
            nativeBtn.onclick = async (e) => {
                e.preventDefault();
                shareMenu.style.display = 'none';
                try {
                    await navigator.share({
                        title: `Case Details - FIR ${displayFir}`,
                        text: textSummary,
                    });
                } catch(err) {
                    console.log('Share failed:', err);
                }
            };
        } else {
            nativeBtn.style.display = 'none';
        }
    }

    const headerCard = document.querySelector('.detail-header-card');
    if (headerCard) {
        let displayFir = caseItem.firNo || '';
        if (caseItem.firNo && caseItem.firYear) {
            const yrStr = String(caseItem.firYear).trim();
            if (yrStr.length >= 2) {
                displayFir = caseItem.firNo + '/' + yrStr.slice(-2);
            }
        }

        let nextStageTxt = '';
        if (caseItem.nextDate) nextStageTxt += caseItem.nextDate;
        if (caseItem.trialStage) nextStageTxt += (nextStageTxt ? ' ' : '') + normalizeTrialStage(caseItem.trialStage);

        headerCard.innerHTML = `
            <div>
                <span class="detail-label">FIR No.</span>
                <h3 id="detailFIRLabel">${displayFir}</h3>
            </div>
            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px;">
                <span class="detail-label">Case Status</span>
                <span class="detail-status" id="detailStatusBadge" style="display: inline-flex; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">${caseItem.status || ''}</span>
            </div>
            <div style="text-align: right;">
                <span class="detail-label">Next Date & Trial Stage</span>
                <h3>${nextStageTxt}</h3>
            </div>
        `;
    }

    const detailFields = document.querySelector('#caseDetailFields');
    if (detailFields) {
        const sections = [
            {
                title: 'FIR Details',
                fields: [
                    ['firNo', caseItem.firNo],
                    ['firYear', caseItem.firYear],
                    ['firDate', caseItem.firDate],
                    ['underSection', caseItem.underSection],
                    ['crimeHead', caseItem.crimeHead],
                    ['policeStation', caseItem.policeStation]
                ]
            },
            {
                title: 'Court Details',
                fields: [
                    ['courtType', caseItem.courtType],
                    ['courtName', caseItem.courtName],
                    ['regPrefix', caseItem.regPrefix],
                    ['regNo', caseItem.regNo],
                    ['regYear', caseItem.regYear],
                    ['regDate', caseItem.regDate]
                ]
            },
            {
                title: 'Case Progress',
                fields: [
                    ['challanDate', caseItem.challanDate],
                    ['chargeDate', caseItem.chargeDate],
                    ['nextDate', caseItem.nextDate],
                    ['trialStage', normalizeTrialStage(caseItem.trialStage)],
                    ['decisionDate', caseItem.decisionDate]
                ]
            },
            {
                title: 'Investigating Officer',
                fields: [
                    ['ioRank', caseItem.ioRank],
                    ['ioName', caseItem.ioName],
                    ['IO Belt No', caseItem.ioBeltno ?? caseItem.beltNo],
                    ['IO Mobile No', caseItem.iomobileNo ?? caseItem.mobileNo]
                ]
            },
            {
                title: 'Incident Details',
                fields: [
                    ['incidentDate', caseItem.incidentDate],
                    ['incidentPlace', caseItem.incidentPlace]
                ]
            },
            {
                title: 'Complainant Details',
                fields: [
                    ['complainantName', caseItem.complainantName],
                    ['complainantFatherName', caseItem.complainantFatherName],
                    ['complainantMobile', caseItem.complainantMobile],
                    ['complainantAddress', caseItem.complainantAddress]
                ]
            },
            {
                title: 'Other Details',
                fields: [
                    ['status', caseItem.status],
                    ['highlighted', caseItem.highlighted ? 'true' : 'false']
                ]
            }
        ];

        let html = '';

        sections.forEach(sec => {
            const validFields = sec.fields.filter(([, v]) => v !== undefined && v !== '');
            if (validFields.length > 0) {
                html += '<div style="grid-column: 1 / -1; margin-top: 1rem; border-bottom: 1px solid #eaeaea; padding-bottom: 5px;"><h4>' + sec.title + '</h4></div>';
                html += validFields.map(([label, value]) => '<div class="detail-item"><span>' + label + '</span><strong>' + value + '</strong></div>').join('');
            }
        });

        if (caseItem.accused && caseItem.accused.length > 0) {
            html += '<div style="grid-column: 1 / -1; margin-top: 1rem; border-bottom: 1px solid #eaeaea; padding-bottom: 5px;"><h4>Accused Details</h4></div>';
            caseItem.accused.forEach((a, i) => {
                const details = [];
                if (a.fatherName) details.push('S/o ' + a.fatherName);
                if (a.mobile) details.push(a.mobile);
                if (a.arrested) details.push('Arrested: ' + (a.arrestDate || ''));
                
                if (a.custodyStatus) {
                    const custMap = {
                        'bailed_police': 'Bailed by Police',
                        'bailed_court': 'Bailed by Court',
                        'jc': 'In Judicial Custody',
                        'pc': 'In Police Custody'
                    };
                    details.push('Custody: ' + (custMap[a.custodyStatus] || a.custodyStatus));
                }
                
                if (
                    a.custodyStatus === 'bailed_police' ||
                    a.custodyStatus === 'bailed_court'
                ) {
                    if (a.bailDate) details.push('Bail: ' + a.bailDate);
                }
                
                if (a.poStatus) details.push('PO Status: true', 'PO Date: ' + (a.poDate || ''));
                if (a.address) details.push('Address: ' + a.address);

                html += '<div class="detail-item" style="grid-column: 1 / -1; border-left: 2px solid #5d429a; padding-left: 10px;"><span>Accused ' + (i + 1) + '</span><strong>' + (a.name || 'Unnamed') + '</strong>' + (details.length ? '<small style="display: block; margin-top: 5px; opacity: 0.8;">' + details.join(' &bull; ') + '</small>' : '') + '</div>';
            });
        }

        if (caseItem.witnesses && caseItem.witnesses.length > 0) {
            html += '<div style="grid-column: 1 / -1; margin-top: 1rem; border-bottom: 1px solid #eaeaea; padding-bottom: 5px;"><h4>Witness Details</h4></div>';
            caseItem.witnesses.forEach((w, i) => {
                const details = [];
                if (w.status) details.push('Status: ' + w.status);
                if (w.examined) details.push('Examined: ' + (w.examinedDate || ''));

                html += '<div class="detail-item" style="grid-column: 1 / -1; border-left: 2px solid #4a90e2; padding-left: 10px;"><span>Witness ' + (i + 1) + '</span><strong>' + (w.name || 'Unnamed') + '</strong>' + (details.length ? '<small style="display: block; margin-top: 5px; opacity: 0.8;">' + details.join(' &bull; ') + '</small>' : '') + '</div>';
            });
        }

        detailFields.innerHTML = html;

        // Render Case Timeline
        const timeline = [];
        const addTimelineDate = (dateStr, label) => {
            if (dateStr) {
                const d = parseCaseDate(dateStr);
                if (d) timeline.push({ dateStr, label, ms: d.getTime() });
            }
        };

        addTimelineDate(caseItem.incidentDate, 'Incident Date');
        addTimelineDate(caseItem.firDate, 'FIR Date');
        addTimelineDate(caseItem.regDate, 'Registration Date');
        addTimelineDate(caseItem.challanDate, 'Challan Date');
        addTimelineDate(caseItem.chargeDate, 'Charge Date');
        const diaryDateRecords = getRegisterDiaryDateRecords(caseItem);
        const dateIdentity = value => {
            const parsed = parseCaseDate(value);
            return parsed
                ? `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`
                : String(value || '');
        };
        if (!diaryDateRecords.some(record => dateIdentity(record.date) === dateIdentity(caseItem.nextDate))) {
            addTimelineDate(caseItem.nextDate, 'Next Court Date');
        }
        diaryDateRecords.forEach(record => {
            const dateKind = record.kind === 'previous' ? 'Previous Court Date' : 'Next Court Date';
            const trialStage = normalizeTrialStage(record.trialStage);
            addTimelineDate(record.date, `${dateKind}${trialStage ? ` (${trialStage})` : ''}`);
        });
        addTimelineDate(caseItem.decisionDate, 'Decision Date');

        if (caseItem.accused && Array.isArray(caseItem.accused)) {
            caseItem.accused.forEach(a => {
                const suffix = caseItem.accused.length > 1 && a.name ? ` (${a.name})` : '';
                addTimelineDate(a.arrestDate, 'Arrest Date' + suffix);
                addTimelineDate(a.bailDate, 'Bail Date' + suffix);
                addTimelineDate(a.poDate, 'PO Date' + suffix);
            });
        }

        if (timeline.length > 0) {
            timeline.sort((a, b) => a.ms - b.ms);
            let tlHtml = '<div style="grid-column: 1 / -1; margin-top: 1.5rem; border-bottom: 1px solid #eaeaea; padding-bottom: 5px;"><h4>Case Timeline</h4></div>';
            tlHtml += '<div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px; padding-left: 10px; border-left: 2px solid var(--primary); margin-top: 10px;">';
            timeline.forEach(item => {
                tlHtml += `<div style="display: flex; gap: 15px;">
                    <span style="font-weight: bold; min-width: 90px;">${item.dateStr}</span>
                    <span style="color: #555;">- ${item.label}</span>
                </div>`;
            });
            tlHtml += '</div>';
            detailFields.innerHTML += tlHtml;
        }
    }

    modalHelper.openModal();
};

export { openDetailModal as openCaseDetailsModal };

// Search functionality
document.addEventListener('input', event => {
    if (event.target.id === 'globalSearch') {
        applyCaseFilters();
    }
});

// Status filters
const requestedCaseFilter = new URLSearchParams(window.location.search).get('filter');
if (requestedCaseFilter) {
    const requestedFilterButton = document.querySelector(`.case-filter[data-filter="${requestedCaseFilter}"]`);
    if (requestedFilterButton) {
        document.querySelectorAll('.case-filter').forEach(button => {
            button.classList.toggle('active', button === requestedFilterButton);
        });
    }
}

document.querySelectorAll('.case-filter').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.case-filter').forEach(btn => btn.classList.toggle('active', btn === button));
        applyCaseFilters();
    });
});

document.querySelectorAll('.cases-table th.sortable[data-sort]').forEach(header => {
    header.addEventListener('click', () => {
        const key = header.dataset.sort;
        const direction = activeCaseSort.key === key && activeCaseSort.direction === 'asc'
            ? 'desc'
            : 'asc';
        activeCaseSort = { key, direction };
        document.querySelectorAll('.cases-table th.sortable').forEach(item => {
            item.dataset.direction = item === header ? direction : 'none';
            item.setAttribute('aria-sort', item === header
                ? (direction === 'asc' ? 'ascending' : 'descending')
                : 'none');
        });
        renderCaseTable();
    });
});

let mobileCellTooltip;
document.addEventListener('click', event => {
    if (!window.matchMedia('(max-width: 780px)').matches) return;
    const cell = event.target.closest('.cases-table tbody td:not(:last-child)');
    if (!cell) {
        mobileCellTooltip?.remove();
        mobileCellTooltip = null;
        return;
    }

    const value = cell.title || cell.textContent.trim();
    if (!value) return;
    event.stopPropagation();
    mobileCellTooltip?.remove();
    mobileCellTooltip = document.createElement('div');
    mobileCellTooltip.className = 'mobile-case-cell-tooltip';
    mobileCellTooltip.setAttribute('role', 'tooltip');
    mobileCellTooltip.textContent = value;
    document.body.append(mobileCellTooltip);

    const rect = cell.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 292));
    mobileCellTooltip.style.left = `${left}px`;
    mobileCellTooltip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 72)}px`;
});

loadCases();
