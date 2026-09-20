import { db } from '@config/firebase-config.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { parseCaseDate, setupModal } from './shared-utils.js';

const detailsModal = document.querySelector('#caseDetailsModal');
const modalHelper = setupModal(detailsModal);

let casesCache = [];
const casesCollection = collection(db, 'cases');

// parseCaseDate is imported from shared-utils.js

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
            '<td>' + (caseItem.nextDate || '') + '</td>' +
            '<td><span class="status-badge ' + statusClass + '">' + (caseItem.trialStage || '') + '</span></td>' +
            '<td><div class="table-actions">' +
            '<button class="icon-btn view-btn" title="View Details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
            '<button class="icon-btn edit-btn" title="Edit Case"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>' +
            '</div></td>';

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
            shareWrap.innerHTML = `
                <button id="sharePdfBtn" class="btn primary" type="button" style="display: flex; align-items: center; gap: 6px;">Share <span style="font-size: 10px;">▼</span></button>
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
        if (caseItem.trialStage) nextStageTxt += (nextStageTxt ? ' ' : '') + caseItem.trialStage;

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
                    ['trialStage', caseItem.trialStage],
                    ['decisionDate', caseItem.decisionDate]
                ]
            },
            {
                title: 'Investigating Officer',
                fields: [
                    ['ioRank', caseItem.ioRank],
                    ['ioName', caseItem.ioName],
                    ['beltNo', caseItem.beltNo],
                    ['mobileNo', caseItem.mobileNo]
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
        addTimelineDate(caseItem.nextDate, 'Next Court Date');
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
