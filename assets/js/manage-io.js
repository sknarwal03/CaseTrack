import { db } from '@config/firebase-config.js';
import {
    collection,
    onSnapshot
} from 'firebase/firestore';
import { normalize, officerName, openIoDialog } from './io-dialog.js';

const ioCollection = collection(db, 'investigatingOfficers');
const ioList = document.getElementById('ioList');
const ioStatus = document.getElementById('ioStatus');
let officers = [];
let loadingError = false;
const rankOrder = ['ACP', 'DSP', 'Insp', 'SI', 'LSI', 'PSI', 'LPSI', 'ASI', 'LASI', 'HC', 'LHC'];

function rankPriority(rank) {
    const index = rankOrder.findIndex(knownRank => normalize(knownRank) === normalize(rank));
    return index === -1 ? rankOrder.length : index;
}

function setStatus(message, isError = false) {
    ioStatus.textContent = message;
    ioStatus.classList.toggle('is-error', isError);
}

function openForm(officer = null) {
    openIoDialog({
        officer,
        getOfficers: () => officers,
        onSaved: ({ mode }) => setStatus(mode === 'edit' ? 'IO updated. Linked cases have been refreshed.' : 'IO added.'),
        onDeleted: ({ deactivated }) => setStatus(
            deactivated ? 'IO deactivated because existing cases reference this record.' : 'IO deleted.'
        )
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

document.getElementById('addIoButton').addEventListener('click', () => openForm());
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
