import { db } from '@config/firebase-config.js';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import addCaseHtml from './add-case.html?raw';

if (!document.getElementById('caseModal')) {
    document.body.insertAdjacentHTML('beforeend', addCaseHtml);
}

const modal = document.getElementById('caseModal');
const form = document.getElementById('caseForm');

function initDatePickers(container = document) {
    const dateInputs = container.querySelectorAll('input[type="date"], input.flatpickr-date');
    dateInputs.forEach(input => {
        if (input.getAttribute('type') === 'date') {
            input.setAttribute('type', 'text');
            input.classList.add('flatpickr-date');
        }
    });
    if (window.flatpickr) {
        flatpickr(dateInputs, { dateFormat: 'd/m/Y', allowInput: true, disableMobile: true });
    }
}
setTimeout(() => initDatePickers(modal), 50);

// Helper for resetting form state
function resetForm() {
    form.reset();
    document.querySelectorAll('.flatpickr-date').forEach(input => {
        if (input._flatpickr) input._flatpickr.clear();
    });
    delete form.dataset.editId;

    // reset dynamic arrays
    const accusedContainer = document.getElementById('accusedContainer');
    if (accusedContainer) {
        const cards = accusedContainer.querySelectorAll('.accused-card');
        for (let i = 1; i < cards.length; i++) cards[i].remove();
        if (cards.length > 0) resetAccusedCard(cards[0]);
    }

    const witnessContainer = document.getElementById('witnessTableBody');
    if (witnessContainer) {
        const rows = witnessContainer.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) rows[i].remove();
        if (rows.length > 0) resetWitnessRow(rows[0]);
    }
}

function resetAccusedCard(card) {
    card.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox') {
            el.checked = false;
        } else if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });

    const arrestDate = card.querySelector('input[name="arrestingdate[]"]');
    const custody = card.querySelector('select[name="custody_status[]"]');
    const bailDate = card.querySelector('input[name="baildate[]"]');
    const poDate = card.querySelector('input[name="po_date[]"]');

    if (arrestDate) {
        arrestDate.disabled = true;
        arrestDate.closest('.input-group')?.style.setProperty('display', 'none');

        if (arrestDate._flatpickr) {
            arrestDate._flatpickr.clear();
        }
    }

    if (custody) {
        custody.disabled = true;
        custody.value = '';
        custody.closest('.input-group')?.style.setProperty('display', 'none');
    }

    if (bailDate) {
        bailDate.disabled = true;
        bailDate.value = '';
        bailDate.closest('.input-group')?.style.setProperty('display', 'none');

        if (bailDate._flatpickr) {
            bailDate._flatpickr.clear();
        }
    }

    if (poDate) {
        poDate.disabled = true;
        poDate.value = '';
        poDate.closest('.input-group')?.style.setProperty('display', 'none');

        if (poDate._flatpickr) {
            poDate._flatpickr.clear();
        }
    }
}
function resetWitnessRow(row) {
    row.querySelectorAll('input, select').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    });
    const exDate = row.querySelector('input[name="witness_examined_date[]"]');
    if (exDate) exDate.disabled = true;
}

window.openAddCaseModal = (caseItem = null) => {
    resetForm();

    const title = document.getElementById('modalTitle');
    if (title) title.textContent = caseItem ? 'Edit Case' : 'Add New Case';

    if (caseItem && caseItem.id) {
        form.dataset.editId = caseItem.id;

        // Map Firestore to Form Fields
        const mapping = {
            status: 'casestatus',
            courtType: 'courttype',
            firNo: 'firno',
            firYear: 'firyear',
            firDate: 'firdate',
            underSection: 'undersection',
            crimeHead: 'crimehead',
            policeStation: 'policestation',
            regPrefix: 'regprefix',
            regNo: 'regnumber',
            regYear: 'regyear',
            regDate: 'regdate',
            courtName: 'courtnan',
            challanDate: 'challandate',
            chargeDate: 'chargedate',
            nextDate: 'nextdate',
            trialStage: 'trial_stage',
            decisionDate: 'dod_date',
            ioRank: 'iorank',
            ioName: 'ioname',
            beltNo: 'beltno',
            mobileNo: 'iomobile',
            incidentDate: 'incident_date',
            incidentPlace: 'incident_place',
            complainantName: 'complainant_name',
            complainantFatherName: 'complainant_father_name',
            complainantMobile: 'complainant_mobile',
            complainantAddress: 'complainant_address',
            highlighted: 'highlightcase'
        };

        Object.entries(mapping).forEach(([fsKey, formName]) => {
            if (caseItem[fsKey] !== undefined && caseItem[fsKey] !== null) {
                const field = form.elements.namedItem(formName);
                if (field) {
                    if (field.type === 'checkbox') {
                        field.checked = caseItem[fsKey] === true;
                    } else {
                        field.value = caseItem[fsKey];
                        if (field.classList.contains('flatpickr-date') && field._flatpickr) {
                            field._flatpickr.setDate(caseItem[fsKey], false, 'd/m/Y');
                        }
                    }
                }
            }
        });

        // Recreate Accused
        if (Array.isArray(caseItem.accused) && caseItem.accused.length > 0) {
            const container = document.getElementById('accusedContainer');
            if (container) {
                let cards = container.querySelectorAll('.accused-card');
                for (let i = 1; i < caseItem.accused.length; i++) {
                    addAccusedCard();
                }
                cards = container.querySelectorAll('.accused-card');
                caseItem.accused.forEach((acc, i) => {
                    const card = cards[i];
                    if (!card) return;
                    card.querySelector('input[name="accused_name[]"]').value = acc.name || '';
                    card.querySelector('input[name="accused_father_name[]"]').value = acc.fatherName || '';
                    card.querySelector('input[name="accused_mobile[]"]').value = acc.mobile || '';
                    card.querySelector('textarea[name="accused_address[]"]').value = acc.address || '';

                    const arrCb = card.querySelector('input[name="arrested[]"]');
                    const arrDate = card.querySelector('input[name="arrestingdate[]"]');
                    const custSel = card.querySelector('select[name="custody_status[]"]');
                    const bailDate = card.querySelector('input[name="baildate[]"]');

                    arrCb.checked = acc.arrested === true;
                    if (arrCb.checked) {
                        arrDate.disabled = false;
                        custSel.disabled = false;
                        arrDate.closest('.input-group')?.style.setProperty('display', '');
                        custSel.closest('.input-group')?.style.setProperty('display', '');
                        
                        if (acc.arrestDate) {
                            if (arrDate._flatpickr) arrDate._flatpickr.setDate(acc.arrestDate, false, 'd/m/Y');
                            else arrDate.value = acc.arrestDate;
                        }
                        custSel.value = acc.custodyStatus || '';

                        if (
                            acc.custodyStatus === 'bailed_police' ||
                            acc.custodyStatus === 'bailed_court'
                        ) {
                            bailDate.disabled = false;
                            bailDate.closest('.input-group')?.style.setProperty('display', '');

                            if (acc.bailDate) {
                                if (bailDate._flatpickr) bailDate._flatpickr.setDate(acc.bailDate, false, 'd/m/Y');
                                else bailDate.value = acc.bailDate;
                            }
                        }
                    }

                    const poCb = card.querySelector('input[name="po_status[]"]');
                    const poDate = card.querySelector('input[name="po_date[]"]');
                    poCb.checked = acc.poStatus === true;
                    if (poCb.checked) {
                        poDate.disabled = false;
                        poDate.closest('.input-group')?.style.setProperty('display', '');
                        if (acc.poDate) {
                            if (poDate._flatpickr) poDate._flatpickr.setDate(acc.poDate, false, 'd/m/Y');
                            else poDate.value = acc.poDate;
                        }
                    }
                });
            }
        }

        // Recreate Witnesses
        if (Array.isArray(caseItem.witnesses) && caseItem.witnesses.length > 0) {
            const container = document.getElementById('witnessTableBody');
            if (container) {
                let rows = container.querySelectorAll('tr');
                for (let i = 1; i < caseItem.witnesses.length; i++) {
                    addWitnessRow();
                }
                rows = container.querySelectorAll('tr');
                caseItem.witnesses.forEach((w, i) => {
                    const row = rows[i];
                    if (!row) return;
                    row.querySelector('input[name="witness_name[]"]').value = w.name || '';
                    row.querySelector('select[name="witness_status[]"]').value = w.status || '';
                    const exCb = row.querySelector('input[name="witness_examined[]"]');
                    const exDate = row.querySelector('input[name="witness_examined_date[]"]');
                    exCb.checked = w.examined === true;
                    if (exCb.checked) {
                        exDate.disabled = false;
                        if (w.examinedDate && exDate._flatpickr) exDate._flatpickr.setDate(w.examinedDate, false, 'd/m/Y');
                    }
                });
                updateWitnessCounts();
            }
        }
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    modal.classList.remove('show');
    document.body.style.overflow = '';
};

document.addEventListener('click', e => {
    if (e.target.closest('[data-open-add-case]')) {
        e.preventDefault();
        window.openAddCaseModal();
    }
});
document.getElementById('closeModal')?.addEventListener('click', closeModal);
document.getElementById('cancelModal')?.addEventListener('click', closeModal);
modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.classList.contains('show')) closeModal(); });

// FIR Year Auto calculation
const firDate = document.getElementById('firdate');
const firYear = document.getElementById('firyear');
if (firDate && firYear) {
    firDate.addEventListener('change', () => {
        if (!firDate.value) { firYear.value = ''; return; }
        if (firDate._flatpickr && firDate._flatpickr.selectedDates.length > 0) {
            firYear.value = firDate._flatpickr.selectedDates[0].getFullYear(); return;
        }
        const parts = firDate.value.split('/');
        if (parts.length === 3) {
            const y = parseInt(parts[2], 10);
            if (!isNaN(y)) { firYear.value = y; return; }
        }
    });
}

// Accused Logic
const showField = (field) => {
    field?.closest('.input-group')?.style.setProperty('display', '');
};

const hideField = (field) => {
    field?.closest('.input-group')?.style.setProperty('display', 'none');
};

function setupAccusedCard(card) {
    const arrCb = card.querySelector('input[name="arrested[]"]');
    const arrDate = card.querySelector('input[name="arrestingdate[]"]');
    const custSel = card.querySelector('select[name="custody_status[]"]');
    const bailDate = card.querySelector('input[name="baildate[]"]');
    const poCb = card.querySelector('input[name="po_status[]"]');
    const poDate = card.querySelector('input[name="po_date[]"]');
    const removeBtn = card.querySelector('.remove-accused-btn');


    // =========================
    // ARREST STATUS
    // =========================
    if (arrCb && arrDate && custSel && bailDate) {

        arrCb.addEventListener('change', () => {

            if (arrCb.checked) {

                showField(arrDate);
                showField(custSel);

                arrDate.disabled = false;
                custSel.disabled = false;

            } else {

                hideField(arrDate);
                hideField(custSel);
                hideField(bailDate);

                arrDate.disabled = true;
                custSel.disabled = true;
                bailDate.disabled = true;

                arrDate.value = '';
                custSel.value = '';
                bailDate.value = '';
            }
        });


        // =========================
        // CUSTODY STATUS
        // =========================
        custSel.addEventListener('change', () => {

            const isBail =
                custSel.value === 'bailed_police' ||
                custSel.value === 'bailed_court';

            if (isBail && arrCb.checked) {

                showField(bailDate);
                bailDate.disabled = false;

            } else {

                hideField(bailDate);
                bailDate.disabled = true;
                bailDate.value = '';
            }
        });
    }

    // =========================
    // PROCLAIMED OFFENDER
    // =========================
    if (poCb && poDate) {

        poCb.addEventListener('change', () => {
            const isPo = poCb.checked;

            if (isPo) {
                showField(poDate);
                poDate.disabled = false;

                if (poDate._flatpickr && typeof poDate._flatpickr.enable === 'function') {
                    poDate._flatpickr.enable();
                }
            } else {
                hideField(poDate);
                poDate.disabled = true;
                poDate.value = '';

                if (poDate._flatpickr) {
                    poDate._flatpickr.clear();
                    poDate._flatpickr.disable();
                }
            }
        });
    }

    // =========================
    // REMOVE ACCUSED
    // =========================
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            card.remove();
        });
    }
}
document.querySelectorAll('.accused-card').forEach(setupAccusedCard);

function addAccusedCard() {
    const container = document.getElementById('accusedContainer');
    if (!container) return;

    const cards = container.querySelectorAll('.accused-card');
    if (cards.length === 0) return;

    const tpl = cards[0].cloneNode(true);

    resetAccusedCard(tpl);

    const num = cards.length + 1;

    // Accused number
    const numberEl = tpl.querySelector('.accused-number span');
    if (numberEl) {
        numberEl.textContent = String(num).padStart(2, '0');
    }

    // Add remove button only to additional accused
    if (!tpl.querySelector('.remove-accused-btn')) {

        const rm = document.createElement('button');

        rm.type = 'button';

        rm.className = 'remove-accused-btn';

        rm.textContent = 'Remove';

        // Wrapper ko poore section header ke andar rakho
        const header = tpl.querySelector('.accused-number');

        if (header) {
            header.appendChild(rm);
        }
    }

    container.appendChild(tpl);

    setTimeout(() => {
        initDatePickers(tpl);
        setupAccusedCard(tpl);
    }, 50);
}

// Witness Logic
function updateWitnessCounts() {
    const wContainer = document.getElementById('witnessTableBody');
    if (!wContainer) return;

    const rows = wContainer.querySelectorAll('tr');

    // Sirf un witnesses ko count karo jinke naam mein kuch likha hai
    const namedRows = Array.from(rows).filter(row => {
        const nameInput = row.querySelector('input[name="witness_name[]"]');
        return nameInput && nameInput.value.trim() !== '';
    });

    const total = namedRows.length;

    // Sirf named witnesses mein examined count karo
    const examined = namedRows.filter(row => {
        const checkbox = row.querySelector(
            'input[name="witness_examined[]"]'
        );
        return checkbox && checkbox.checked;
    }).length;

    const remaining = total - examined;

    const totalEl = document.getElementById('totalWitness');
    const examinedEl = document.getElementById('examinedWitness');
    const remainingEl = document.getElementById('leftWitness');

    if (totalEl) totalEl.value = total;
    if (examinedEl) examinedEl.value = examined;
    if (remainingEl) remainingEl.value = remaining;
}

document.getElementById('witnessTableBody')?.addEventListener('input', e => {
    if (e.target.name === 'witness_name[]') {
        updateWitnessCounts();
    }
});

document.getElementById('witnessTableBody')?.addEventListener('change', e => {
    if (e.target.name === 'witness_examined[]') {
        updateWitnessCounts();
    }
});

function setupWitnessRow(row) {
    const cb = row.querySelector('input[name="witness_examined[]"]');
    const exDate = row.querySelector('input[name="witness_examined_date[]"]');
    const removeBtn = row.querySelector('.remove-witness-btn');
    if (cb && exDate) {
        cb.addEventListener('change', () => {
            exDate.disabled = !cb.checked;
            if (!cb.checked) { exDate.value = ''; if (exDate._flatpickr) exDate._flatpickr.clear(); }
            updateWitnessCounts();
        });
    }
    if (removeBtn) removeBtn.addEventListener('click', () => { row.remove(); updateWitnessSerialNumbers(); updateWitnessCounts(); });
}
document.querySelectorAll('#witnessTableBody tr').forEach(setupWitnessRow);

function addWitnessRow() {
    const container = document.getElementById('witnessTableBody');
    if (!container) return;

    const rows = container.querySelectorAll('tr');
    if (rows.length === 0) return;

    // First row ko template ke liye clone karo
    const tpl = rows[0].cloneNode(true);

    // Fields reset karo
    resetWitnessRow(tpl);

    // Serial number
    const srNo = tpl.querySelector('.sr-no');
    if (srNo) {
        srNo.textContent = rows.length + 1;
    }

    // Action cell
    const actionTd = tpl.querySelector('.witness-action');

    if (actionTd) {
        actionTd.innerHTML = '';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-witness-btn icon-btn';
        removeBtn.textContent = '🗑';

        actionTd.appendChild(removeBtn);
    }

    // New row add karo
    container.appendChild(tpl);
    updateWitnessSerialNumbers();

    // Date picker + row events
    setTimeout(() => {
        initDatePickers(tpl);
        setupWitnessRow(tpl);
        updateWitnessCounts();
    }, 50);
}

function updateWitnessSerialNumbers() {
    const container = document.getElementById('witnessTableBody');
    if (!container) return;

    const rows = container.querySelectorAll('tr');

    rows.forEach((row, index) => {
        const srNo = row.querySelector('.sr-no');

        if (srNo) {
            srNo.textContent = index + 1;
        }
    });
}
document.addEventListener('click', e => {
    if (e.target.closest('#addWitness')) addWitnessRow();
    if (e.target.closest('#addAccused')) addAccusedCard();
});

document.getElementById('witnessTableBody')?.addEventListener('change', e => {
    if (e.target.name === 'witness_examined[]') updateWitnessCounts();
});

form?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
        const formData = new FormData(form);
        const rawData = Object.fromEntries(formData.entries());

        // Ensure firYear is recalculated
        const computedFirYear = (rawData.firdate) ? (rawData.firdate.split('/')[2] || '') : '';

        // Map Form to Firestore Schema
        const caseData = {
            status: String(rawData.casestatus || '').trim(),
            courtType: String(rawData.courttype || '').trim(),
            firNo: String(rawData.firno || '').trim(),
            firYear: String(computedFirYear || rawData.firyear || '').trim(),
            firDate: String(rawData.firdate || '').trim(),
            underSection: String(rawData.undersection || '').trim(),
            crimeHead: String(rawData.crimehead || '').trim(),
            policeStation: String(rawData.policestation || '').trim(),

            regPrefix: String(rawData.regprefix || '').trim(),
            regNo: String(rawData.regnumber || '').trim(),
            regYear: String(rawData.regyear || '').trim(),
            regDate: String(rawData.regdate || '').trim(),
            courtName: String(rawData.courtnan || '').trim(),
            challanDate: String(rawData.challandate || '').trim(),
            chargeDate: String(rawData.chargedate || '').trim(),
            nextDate: String(rawData.nextdate || '').trim(),
            trialStage: String(rawData.trial_stage || '').trim(),
            decisionDate: String(rawData.dod_date || '').trim(),

            ioRank: String(rawData.iorank || '').trim(),
            ioName: String(rawData.ioname || '').trim(),
            beltNo: String(rawData.beltno || '').trim(),
            mobileNo: String(rawData.iomobile || '').trim(),

            incidentDate: String(rawData.incident_date || '').trim(),
            incidentPlace: String(rawData.incident_place || '').trim(),
            complainantName: String(rawData.complainant_name || '').trim(),
            complainantFatherName: String(rawData.complainant_father_name || '').trim(),
            complainantMobile: String(rawData.complainant_mobile || '').trim(),
            complainantAddress: String(rawData.complainant_address || '').trim(),

            highlighted: Boolean(formData.get('highlightcase')),
            accused: [],
            witnesses: []
        };

        // Process Accused array
        const accusedNames = formData.getAll('accused_name[]');
        const accusedFathers = formData.getAll('accused_father_name[]');
        const accusedMobiles = formData.getAll('accused_mobile[]');
        const accusedArrestingDates = formData.getAll('arrestingdate[]');
        const accusedCustody = formData.getAll('custody_status[]');
        const accusedBailDates = formData.getAll('baildate[]');
        const accusedPoDates = formData.getAll('po_date[]');
        const accusedAddresses = formData.getAll('accused_address[]');

        const arrestedFlags = Array.from(document.querySelectorAll('input[name="arrested[]"]')).map(cb => cb.checked);
        const poFlags = Array.from(document.querySelectorAll('input[name="po_status[]"]')).map(cb => cb.checked);

        for (let i = 0; i < accusedNames.length; i++) {
            caseData.accused.push({
                name: String(accusedNames[i] || '').trim(),
                fatherName: String(accusedFathers[i] || '').trim(),
                mobile: String(accusedMobiles[i] || '').trim(),
                arrested: arrestedFlags[i] || false,
                arrestDate: String(accusedArrestingDates[i] || '').trim(),
                custodyStatus: String(accusedCustody[i] || '').trim(),
                bailDate: String(accusedBailDates[i] || '').trim(),
                poStatus: poFlags[i] || false,
                poDate: String(accusedPoDates[i] || '').trim(),
                address: String(accusedAddresses[i] || '').trim()
            });
        }

        // Process Witness array
        const witnessNames = formData.getAll('witness_name[]');
        const witnessStatus = formData.getAll('witness_status[]');
        const witnessExDates = formData.getAll('witness_examined_date[]');
        const exFlags = Array.from(document.querySelectorAll('input[name="witness_examined[]"]')).map(cb => cb.checked);

        for (let i = 0; i < witnessNames.length; i++) {
            caseData.witnesses.push({
                name: String(witnessNames[i] || '').trim(),
                status: String(witnessStatus[i] || '').trim(),
                examined: exFlags[i] || false,
                examinedDate: String(witnessExDates[i] || '').trim()
            });
        }

        const casesCollection = collection(db, 'cases');
        if (form.dataset.editId) {
            await updateDoc(doc(db, 'cases', form.dataset.editId), {
                ...caseData,
                updatedAt: serverTimestamp()
            });
        } else {
            await addDoc(casesCollection, {
                ...caseData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        window.dispatchEvent(new CustomEvent('caseAdded'));
        closeModal();
    } catch (err) {
        console.error('Error saving case:', err);
        alert('Failed to save case. Check console.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});
