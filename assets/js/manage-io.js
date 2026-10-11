import { db } from '@config/firebase-config.js';
import {
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    writeBatch
} from 'firebase/firestore';

const ioCollection = collection(db, 'investigatingOfficers');
const ioList = document.getElementById('ioList');
const ioStatus = document.getElementById('ioStatus');
const ioDialog = document.getElementById('ioDialog');
const ioForm = document.getElementById('ioForm');
const ioDialogTitle = document.getElementById('ioDialogTitle');
const ioFormStatus = document.getElementById('ioFormStatus');
const ioActiveField = document.getElementById('ioActiveField');
const saveIoButton = document.getElementById('saveIoButton');
const deleteIoButton = document.getElementById('deleteIoButton');
let officers = [];
let loadingError = false;
let legacyMigrationStarted = false;
const rankOrder = ['ACP', 'DSP', 'Insp', 'SI', 'LSI', 'PSI', 'LPSI', 'ASI', 'LASI', 'HC', 'LHC'];

function normalize(value) {
    return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function rankPriority(rank) {
    const index = rankOrder.findIndex(knownRank => normalize(knownRank) === normalize(rank));
    return index === -1 ? rankOrder.length : index;
}

function officerName(officer) {
    return [String(officer.ioRank || '').trim(), String(officer.ioName || '').trim()]
        .filter(Boolean)
        .join(' ');
}

function setStatus(message, isError = false) {
    ioStatus.textContent = message;
    ioStatus.classList.toggle('is-error', isError);
}

function setFormStatus(message, isError = false) {
    ioFormStatus.textContent = message;
    ioFormStatus.classList.toggle('is-error', isError);
}

function openForm(officer = null) {
    ioForm.reset();
    ioForm.dataset.editId = officer?.id || '';
    ioDialogTitle.textContent = officer ? 'Edit IO' : 'Add IO';
    saveIoButton.textContent = officer ? 'Update IO' : 'Save IO';
    deleteIoButton.hidden = !officer;
    ioActiveField.hidden = !officer;
    ioForm.elements.namedItem('ioRank').value = officer?.ioRank || '';
    ioForm.elements.namedItem('ioName').value = officer?.ioName || '';
    ioForm.elements.namedItem('ioBeltno').value = officer?.ioBeltno ?? officer?.beltNo ?? '';
    ioForm.elements.namedItem('iomobileNo').value = officer?.iomobileNo ?? officer?.mobileNo ?? '';
    ioForm.elements.namedItem('active').checked = officer?.active !== false;
    setFormStatus('');
    ioDialog.showModal();
}

function matchesOfficer(data, officer) {
    return normalize(data.ioName) === normalize(officer.ioName) &&
        normalize(data.ioRank) === normalize(officer.ioRank) &&
        normalize(data.ioBeltno ?? data.beltNo) === normalize(officer.ioBeltno ?? officer.beltNo) &&
        normalize(data.iomobileNo ?? data.mobileNo) === normalize(officer.iomobileNo ?? officer.mobileNo);
}

async function getLinkedCases(officer) {
    const casesSnapshot = await getDocs(collection(db, 'cases'));
    return casesSnapshot.docs.filter(caseDocument => {
        const data = caseDocument.data();
        return data.ioId === officer.id || (!data.ioId && matchesOfficer(data, officer));
    });
}

function isDuplicate(candidate, excludeId = '') {
    return officers.some(officer => {
        if (officer.id === excludeId) return false;
        return normalize(officer.ioName) === normalize(candidate.ioName) &&
            normalize(officer.ioRank) === normalize(candidate.ioRank) &&
            normalize(officer.ioBeltno ?? officer.beltNo) === normalize(candidate.ioBeltno) &&
            normalize(officer.iomobileNo ?? officer.mobileNo) === normalize(candidate.iomobileNo);
    });
}

function renderOfficers() {
    if (loadingError) return;
    if (!officers.length) {
        const empty = document.createElement('div');
        empty.className = 'io-empty-state';
        empty.textContent = 'No investigating officers registered yet.';
        ioList.replaceChildren(empty);
        return;
    }

    ioList.replaceChildren(...officers.map(officer => {
        const row = document.createElement('article');
        row.className = 'io-row';
        const content = document.createElement('div');
        content.className = 'io-row-content';
        content.tabIndex = 0;
        content.setAttribute('role', 'button');
        content.setAttribute('aria-label', `Edit ${officerName(officer)}`);
        const name = document.createElement('div');
        name.className = 'io-row-name';
        const officerIdentity = [officer.ioRank, officer.ioName].filter(Boolean).join(' ').trim();
        const mobileNo = officer.iomobileNo ?? officer.mobileNo;
        const beltNo = officer.ioBeltno ?? officer.beltNo;
        const beltAndMobile = beltNo && mobileNo
            ? `${beltNo} - ${mobileNo}`
            : beltNo || mobileNo || '';
        const officerDisplay = [officerIdentity, beltAndMobile].filter(Boolean).join(' ');
        name.textContent = officerDisplay || 'Unnamed officer';
        if (officer.active === false) {
            const inactive = document.createElement('span');
            inactive.className = 'io-row-status';
            inactive.textContent = 'Inactive';
            name.append(inactive);
        }
        content.append(name);
        content.addEventListener('click', () => openForm(officer));
        content.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openForm(officer);
            }
        });

        row.append(content);
        return row;
    }));
}

async function safelyDeleteOfficer(officer) {
    deleteIoButton.disabled = true;
    try {
        const linkedCases = await getLinkedCases(officer);
        if (linkedCases.length) {
            const confirmed = window.confirm(
                `${officerName(officer)} is linked to ${linkedCases.length} case(s). Deactivate this IO instead of deleting the record? Existing case details will be preserved.`
            );
            if (!confirmed) return;
            await updateDoc(doc(db, 'investigatingOfficers', officer.id), {
                active: false,
                updatedAt: serverTimestamp()
            });
            ioDialog.close();
            setStatus('IO deactivated because existing cases reference this record.');
            return;
        }

        if (!window.confirm(`Permanently delete ${officerName(officer)}? This IO is not referenced by any case.`)) return;
        await deleteDoc(doc(db, 'investigatingOfficers', officer.id));
        ioDialog.close();
        setStatus('IO deleted.');
    } catch (error) {
        console.error('Error deleting IO:', error);
        setFormStatus('Could not delete or deactivate this IO. Check your connection and permissions, then try again.', true);
    } finally {
        deleteIoButton.disabled = false;
    }
}

async function saveOfficer(data, editingId) {
    const now = serverTimestamp();
    if (!editingId) {
        await addDoc(ioCollection, {
            ...data,
            createdAt: now,
            updatedAt: now
        });
        return;
    }

    const previous = officers.find(officer => officer.id === editingId);
    if (!previous) throw new Error('The IO record is no longer available. Refresh the page and try again.');
    const linkedCases = await getLinkedCases(previous);
    const caseSnapshot = {
        ioId: editingId,
        ioRank: data.ioRank,
        ioName: data.ioName,
        ioBeltno: data.ioBeltno,
        beltNo: deleteField(),
        iomobileNo: data.iomobileNo,
        mobileNo: deleteField(),
        updatedAt: now
    };

    for (let start = 0; start < linkedCases.length; start += 449) {
        const batch = writeBatch(db);
        linkedCases.slice(start, start + 449).forEach(caseDocument => {
            batch.update(caseDocument.ref, caseSnapshot);
        });
        if (start + 449 >= linkedCases.length) {
            batch.update(doc(db, 'investigatingOfficers', editingId), {
                ...data,
                beltNo: deleteField(),
                mobileNo: deleteField(),
                updatedAt: now
            });
        }
        await batch.commit();
    }
    if (!linkedCases.length) {
        await updateDoc(doc(db, 'investigatingOfficers', editingId), {
            ...data,
            beltNo: deleteField(),
            mobileNo: deleteField(),
            updatedAt: now
        });
    }
}

ioForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ioForm.reportValidity()) return;
    const data = {
        ioRank: String(ioForm.elements.namedItem('ioRank').value).trim(),
        ioName: String(ioForm.elements.namedItem('ioName').value).trim(),
        ioBeltno: String(ioForm.elements.namedItem('ioBeltno').value).trim(),
        iomobileNo: String(ioForm.elements.namedItem('iomobileNo').value).trim(),
        active: ioForm.elements.namedItem('active').checked
    };
    const editingId = ioForm.dataset.editId || '';
    if (!data.ioName) return;
    if (isDuplicate(data, editingId)) {
        setFormStatus('An IO with these same details is already registered.', true);
        return;
    }

    saveIoButton.disabled = true;
    deleteIoButton.disabled = true;
    setFormStatus('');
    try {
        await saveOfficer(data, editingId);
        ioDialog.close();
        setStatus(editingId ? 'IO updated. Linked cases have been refreshed.' : 'IO added.');
    } catch (error) {
        console.error('Error saving IO:', error);
        setFormStatus(error.message === 'The IO record is no longer available. Refresh the page and try again.'
            ? error.message
            : 'Could not save this IO. Check your connection and permissions, then try again.', true);
    } finally {
        saveIoButton.disabled = false;
        deleteIoButton.disabled = false;
    }
});

document.getElementById('addIoButton').addEventListener('click', () => openForm());
deleteIoButton.addEventListener('click', () => {
    const officer = officers.find(item => item.id === ioForm.dataset.editId);
    if (officer) void safelyDeleteOfficer(officer);
});
document.getElementById('closeIoDialog').addEventListener('click', () => ioDialog.close());
document.getElementById('cancelIoButton').addEventListener('click', () => ioDialog.close());
ioDialog.addEventListener('click', event => {
    if (event.target === ioDialog) ioDialog.close();
});
document.getElementById('closeIoPage').addEventListener('click', () => {
    const hasSameOriginPreviousPage = window.history.length > 1 && document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
    if (hasSameOriginPreviousPage) {
        window.history.back();
    } else {
        window.location.href = 'settings.html';
    }
});

setStatus('Loading investigating officers…');
onSnapshot(ioCollection, snapshot => {
    officers = snapshot.docs.map(officerDocument => ({
        id: officerDocument.id,
        active: true,
        ...officerDocument.data(),
        ioBeltno: officerDocument.data().ioBeltno ?? officerDocument.data().beltNo ?? '',
        iomobileNo: officerDocument.data().iomobileNo ?? officerDocument.data().mobileNo ?? ''
    })).sort((left, right) =>
        rankPriority(left.ioRank) - rankPriority(right.ioRank) ||
        normalize(left.ioName).localeCompare(normalize(right.ioName))
    );
    loadingError = false;
    renderOfficers();
    setStatus('');
    if (!legacyMigrationStarted) {
        legacyMigrationStarted = true;
        void migrateLegacyIoFields(snapshot);
    }
}, error => {
    console.error('Error loading IO register:', error);
    loadingError = true;
    const errorState = document.createElement('div');
    errorState.className = 'io-empty-state';
    errorState.setAttribute('role', 'alert');
    errorState.textContent = 'Investigating officers could not be loaded. Check your connection and permissions, then refresh the register.';
    ioList.replaceChildren(errorState);
    setStatus('Could not load investigating officers.', true);
});

async function migrateLegacyIoFields(officerSnapshot) {
    const updates = [];
    officerSnapshot.docs.forEach(officerDocument => {
        const data = officerDocument.data();
        if (Object.hasOwn(data, 'mobileNo') || Object.hasOwn(data, 'beltNo')) {
            updates.push({
                ref: officerDocument.ref,
                fields: {
                    ioBeltno: data.ioBeltno ?? data.beltNo ?? '',
                    iomobileNo: data.iomobileNo ?? data.mobileNo ?? '',
                    beltNo: deleteField(),
                    mobileNo: deleteField()
                }
            });
        }
    });

    try {
        const casesSnapshot = await getDocs(collection(db, 'cases'));
        casesSnapshot.docs.forEach(caseDocument => {
            const data = caseDocument.data();
            if (Object.hasOwn(data, 'mobileNo') || Object.hasOwn(data, 'beltNo')) {
                updates.push({
                    ref: caseDocument.ref,
                    fields: {
                        ioBeltno: data.ioBeltno ?? data.beltNo ?? '',
                        iomobileNo: data.iomobileNo ?? data.mobileNo ?? '',
                        beltNo: deleteField(),
                        mobileNo: deleteField()
                    }
                });
            }
        });

        for (let start = 0; start < updates.length; start += 450) {
            const batch = writeBatch(db);
            updates.slice(start, start + 450).forEach(({ ref, fields }) => batch.update(ref, fields));
            await batch.commit();
        }
    } catch (error) {
        console.error('Error migrating legacy IO fields:', error);
        setStatus('IO data loaded, but legacy IO fields could not be migrated. Check connection and Firestore permissions.', true);
    }
}
