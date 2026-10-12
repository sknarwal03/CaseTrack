import { db } from '@config/firebase-config.js';
import {
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
    writeBatch
} from 'firebase/firestore';
import ioDialogHtml from '../../components/io-dialog/io-dialog.html?raw';
import '../css/all-judges.css';
import '../css/manage-io.css';

const ioCollection = collection(db, 'investigatingOfficers');

let elements = null;
let session = {};

export function normalize(value) {
    return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function officerName(officer) {
    return [String(officer.ioRank || '').trim(), String(officer.ioName || '').trim()]
        .filter(Boolean)
        .join(' ');
}

function setFormStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', isError);
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
    return (session.getOfficers?.() || []).some(officer => {
        if (officer.id === excludeId) return false;
        return normalize(officer.ioName) === normalize(candidate.ioName) &&
            normalize(officer.ioRank) === normalize(candidate.ioRank) &&
            normalize(officer.ioBeltno ?? officer.beltNo) === normalize(candidate.ioBeltno) &&
            normalize(officer.iomobileNo ?? officer.mobileNo) === normalize(candidate.iomobileNo);
    });
}

async function safelyDeleteOfficer(officer) {
    const { onDeleted } = session;
    elements.deleteButton.disabled = true;
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
            elements.dialog.close();
            onDeleted?.({ id: officer.id, deactivated: true });
            return;
        }

        if (!window.confirm(`Permanently delete ${officerName(officer)}? This IO is not referenced by any case.`)) return;
        await deleteDoc(doc(db, 'investigatingOfficers', officer.id));
        elements.dialog.close();
        onDeleted?.({ id: officer.id, deactivated: false });
    } catch (error) {
        console.error('Error deleting IO:', error);
        setFormStatus('Could not delete or deactivate this IO. Check your connection and permissions, then try again.', true);
    } finally {
        elements.deleteButton.disabled = false;
    }
}

async function saveOfficer(data, editingId) {
    const now = serverTimestamp();
    if (!editingId) {
        const created = await addDoc(ioCollection, {
            ...data,
            createdAt: now,
            updatedAt: now
        });
        return created.id;
    }

    const previous = (session.getOfficers?.() || []).find(officer => officer.id === editingId);
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
    return editingId;
}

async function handleSubmit(event) {
    event.preventDefault();
    const { form, saveButton, deleteButton, dialog } = elements;
    if (!form.reportValidity()) return;
    const data = {
        ioRank: String(form.elements.namedItem('ioRank').value).trim(),
        ioName: String(form.elements.namedItem('ioName').value).trim(),
        ioBeltno: String(form.elements.namedItem('ioBeltno').value).trim(),
        iomobileNo: String(form.elements.namedItem('iomobileNo').value).trim(),
        active: form.elements.namedItem('active').checked
    };
    const editingId = form.dataset.editId || '';
    if (!data.ioName) return;
    if (isDuplicate(data, editingId)) {
        setFormStatus('An IO with these same details is already registered.', true);
        return;
    }

    const { onSaved } = session;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    setFormStatus('');
    try {
        const id = await saveOfficer(data, editingId);
        dialog.close();
        onSaved?.({ mode: editingId ? 'edit' : 'add', id, data });
    } catch (error) {
        console.error('Error saving IO:', error);
        setFormStatus(error.message === 'The IO record is no longer available. Refresh the page and try again.'
            ? error.message
            : 'Could not save this IO. Check your connection and permissions, then try again.', true);
    } finally {
        saveButton.disabled = false;
        deleteButton.disabled = false;
    }
}

function ensureDialog() {
    if (elements) return elements;
    if (!document.getElementById('ioDialog')) {
        document.body.insertAdjacentHTML('beforeend', ioDialogHtml);
    }
    const dialog = document.getElementById('ioDialog');
    elements = {
        dialog,
        form: document.getElementById('ioForm'),
        title: document.getElementById('ioDialogTitle'),
        status: document.getElementById('ioFormStatus'),
        activeField: document.getElementById('ioActiveField'),
        saveButton: document.getElementById('saveIoButton'),
        deleteButton: document.getElementById('deleteIoButton')
    };

    elements.form.addEventListener('submit', handleSubmit);
    elements.deleteButton.addEventListener('click', () => {
        const officer = (session.getOfficers?.() || []).find(item => item.id === elements.form.dataset.editId);
        if (officer) void safelyDeleteOfficer(officer);
    });
    document.getElementById('closeIoDialog').addEventListener('click', () => dialog.close());
    document.getElementById('cancelIoButton').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    // Escape must only dismiss this dialog, not a host modal that listens on document.
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    return elements;
}

/**
 * Opens the shared Add/Edit IO dialog.
 * @param {object} options
 * @param {object|null} [options.officer] Existing officer (with `id`) to edit; omit to add.
 * @param {() => object[]} options.getOfficers Current officer list, used for duplicate checks and edits.
 * @param {(result: {mode: 'add'|'edit', id: string, data: object}) => void} [options.onSaved]
 * @param {(result: {id: string, deactivated: boolean}) => void} [options.onDeleted]
 */
export function openIoDialog({ officer = null, getOfficers, onSaved, onDeleted } = {}) {
    const { dialog, form, title, activeField, saveButton, deleteButton } = ensureDialog();
    if (dialog.open) return;
    session = { getOfficers, onSaved, onDeleted };

    form.reset();
    form.dataset.editId = officer?.id || '';
    title.textContent = officer ? 'Edit IO' : 'Add IO';
    saveButton.textContent = officer ? 'Update IO' : 'Save IO';
    deleteButton.hidden = !officer;
    activeField.hidden = !officer;
    form.elements.namedItem('ioRank').value = officer?.ioRank || '';
    form.elements.namedItem('ioName').value = officer?.ioName || '';
    form.elements.namedItem('ioBeltno').value = officer?.ioBeltno ?? officer?.beltNo ?? '';
    form.elements.namedItem('iomobileNo').value = officer?.iomobileNo ?? officer?.mobileNo ?? '';
    form.elements.namedItem('active').checked = officer?.active !== false;
    setFormStatus('');
    dialog.showModal();
}
