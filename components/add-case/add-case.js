import { db, auth } from '@config/firebase-config.js';
import { collection, updateDoc, deleteDoc, doc, deleteField, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where, writeBatch } from 'firebase/firestore';
import { latestChargeDate, latestTrialStage } from '../../assets/js/charge-date.js';
import { normalizeTrialStage, populateTrialStageSelect, setTrialStageSelectValue } from '../../assets/js/trial-stages.js';
import { openIoDialog } from '../../assets/js/io-dialog.js';
import { findFirMasterMatches, findLegacyFirGroups, getCaseAccessContext, usesStationScopedAccess, LINKED_CASES_COLLECTION, loadCaseRecords, loadRecordsForFir, saveFirMaster } from '../../assets/js/fir-case-model.js';
import { normalizeProceedingFields, proceedingFieldsFromForm, proceedingPayload } from '../../assets/js/proceeding-fields.mjs';
import { deriveFirStatus } from '../../assets/js/fir-status.mjs';
import addCaseHtml from './add-case.html?raw';

const masterDefinitions = {
    crimeHead: {
        collectionName: 'crimeHeads',
        initialValues: [
            { value: 'murder', label: 'Murder' },
            { value: 'attempt to murder', label: 'Attempt to Murder' },
            { value: 'dowry', label: 'Dowry' },
            { value: 'snatching', label: 'Snatching' },
            { value: 'theft', label: 'Theft' }
        ]
    }
};
const masterValues = {
    crimeHead: [...masterDefinitions.crimeHead.initialValues]
};
const pendingMasterWrites = new Map();
let savedUnderSectionsLoad = null;

if (!document.getElementById('caseModal')) {
    document.body.insertAdjacentHTML('beforeend', addCaseHtml);
}
populateTrialStageSelect(document.getElementById('nextDateStageTrial'));

function normalizeMasterValue(value) {
    return value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
}

function masterDocumentId(value) {
    const normalized = normalizeMasterValue(value);
    const bytes = new TextEncoder().encode(normalized);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return `v_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function loadMasterList(type) {
    const definition = masterDefinitions[type];
    const listRef = collection(db, definition.collectionName);
    const snapshot = await getDocs(listRef);
    const storedValues = snapshot.docs
        .map(masterDoc => {
            const data = masterDoc.data();
            return typeof data.value === 'string' && data.value.trim()
                ? { value: data.value.trim(), label: data.label || data.value.trim() }
                : null;
        })
        .filter(Boolean);
    const valuesByNormalized = new Map();
    [...definition.initialValues, ...storedValues]
        .forEach(item => {
            const normalized = normalizeMasterValue(item.value);
            if (!valuesByNormalized.has(normalized)) valuesByNormalized.set(normalized, item);
        });
    masterValues[type].splice(0, masterValues[type].length, ...valuesByNormalized.values());
    renderMasterList(type);
}

let masterListsError = null;
const masterListsReady = Promise.all(Object.keys(masterDefinitions).map(loadMasterList))
    .catch(error => {
        masterListsError = error;
        console.error('Error loading case master lists:', error);
    });

function persistMasterValue(type, value) {
    const trimmedValue = value.trim();
    const normalized = normalizeMasterValue(trimmedValue);
    if (!normalized) return Promise.resolve();

    const definition = masterDefinitions[type];
    const documentId = masterDocumentId(normalized);
    const writeKey = `${definition.collectionName}/${documentId}`;
    if (pendingMasterWrites.has(writeKey)) return pendingMasterWrites.get(writeKey);

    const write = (async () => {
        await masterListsReady;
        if (masterListsError) throw masterListsError;
        if (masterValues[type].some(item => normalizeMasterValue(item.value) === normalized)) return;

        const masterRef = doc(db, definition.collectionName, documentId);
        await runTransaction(db, async transaction => {
            const existing = await transaction.get(masterRef);
            if (!existing.exists()) {
                transaction.set(masterRef, {
                    value: trimmedValue,
                    label: trimmedValue,
                    normalized,
                    createdAt: serverTimestamp()
                });
            }
        });

        if (!masterValues[type].some(item => normalizeMasterValue(item.value) === normalized)) {
            masterValues[type].push({ value: trimmedValue, label: trimmedValue });
            renderMasterList(type);
        }
    })().finally(() => pendingMasterWrites.delete(writeKey));

    pendingMasterWrites.set(writeKey, write);
    return write;
}

const masterComboboxes = new Map();

function setupMasterCombobox(type) {
    const definition = masterDefinitions[type];
    const input = document.querySelector(`[data-master-list="${type}"] input`);
    const wrapper = input?.closest('.searchable-select');
    const toggle = wrapper?.querySelector('.searchable-select-toggle');
    const menu = wrapper?.querySelector('.searchable-select-options');
    const status = document.getElementById(`${type === 'crimeHead' ? 'crimeHead' : 'court'}MasterStatus`);
    if (!input || !wrapper || !menu || !status) {
        throw new Error(`Missing ${type} searchable list elements`);
    }

    const close = () => {
        menu.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-expanded', 'false');
    };

    const positionMenu = () => {
        if (menu.hidden) return;
        const bounds = input.getBoundingClientRect();
        const spaceBelow = window.innerHeight - bounds.bottom;
        const placeAbove = spaceBelow < 230 && bounds.top > spaceBelow;
        menu.style.left = `${bounds.left}px`;
        menu.style.width = `${bounds.width + (toggle?.getBoundingClientRect().width || 0)}px`;
        menu.style.top = placeAbove ? '' : `${bounds.bottom}px`;
        menu.style.bottom = placeAbove ? `${window.innerHeight - bounds.top}px` : '';
        menu.classList.toggle('opens-above', placeAbove);
    };

    const open = (showAll = true) => {
        menu.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        toggle?.setAttribute('aria-expanded', 'true');
        render(showAll ? '' : input.value);
        positionMenu();
    };

    const chooseValue = async (value, isNew) => {
        input.value = value;
        status.textContent = '';
        if (isNew) {
            try {
                await persistMasterValue(type, value);
                status.textContent = 'Saved to the shared list.';
            } catch (error) {
                console.error(`Error saving ${definition.collectionName} entry:`, error);
                status.textContent = 'Could not save to the shared list. Saving the case will retry.';
            }
        }
        input.focus();
        close();
    };

    const render = (searchValue = input.value) => {
        const search = normalizeMasterValue(searchValue);
        const matchingValues = masterValues[type].filter(item =>
            normalizeMasterValue(`${item.label} ${item.value}`).includes(search)
        );
        menu.replaceChildren();

        matchingValues.forEach(item => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'searchable-select-option';
            option.setAttribute('role', 'option');
            option.textContent = item.label;
            option.addEventListener('click', () => chooseValue(item.value, false));
            menu.appendChild(option);
        });

        if (search && !masterValues[type].some(item => normalizeMasterValue(item.value) === search)) {
            const addOption = document.createElement('button');
            addOption.type = 'button';
            addOption.className = 'searchable-select-option add-master-option';
            addOption.setAttribute('role', 'option');
            addOption.textContent = `Add "${input.value.trim()}"`;
            addOption.addEventListener('click', () => chooseValue(input.value, true));
            menu.appendChild(addOption);
        }

        if (matchingValues.length === 0 && !search) {
            const emptyOption = document.createElement('div');
            emptyOption.className = 'searchable-select-empty';
            emptyOption.textContent = 'No saved options yet.';
            menu.appendChild(emptyOption);
        }
        positionMenu();
    };

    input.addEventListener('focus', open);
    input.addEventListener('input', () => {
        status.textContent = '';
        if (!menu.hidden) render(input.value);
        else open();
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (menu.hidden) open();
            menu.querySelector('.searchable-select-option')?.focus();
        } else if (event.key === 'Enter' && !menu.hidden) {
            const search = normalizeMasterValue(input.value);
            if (!search) return;
            event.preventDefault();
            const exact = masterValues[type].find(value =>
                normalizeMasterValue(value.value) === normalizeMasterValue(input.value)
            );
            const firstMatch = masterValues[type].find(value =>
                normalizeMasterValue(`${value.label} ${value.value}`).includes(search)
            );
            if (exact || firstMatch) chooseValue((exact || firstMatch).value, false);
            else chooseValue(input.value.trim(), true);
        } else if (event.key === 'Escape') {
            close();
        }
    });
    toggle?.addEventListener('click', () => {
        if (menu.hidden) {
            input.focus();
            open(true);
        } else {
            close();
        }
    });
    menu.addEventListener('keydown', event => {
        const options = [...menu.querySelectorAll('.searchable-select-option')];
        const activeIndex = options.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            options[(activeIndex + direction + options.length) % options.length]?.focus();
        } else if (event.key === 'Escape') {
            close();
            input.focus();
        }
    });
    menu.addEventListener('pointerdown', event => event.preventDefault());
    const handleFocusLeave = () => {
        window.setTimeout(async () => {
            if (wrapper.contains(document.activeElement) || menu.contains(document.activeElement)) return;
            close();
            const value = input.value.trim();
            if (!value) return;
            try {
                await persistMasterValue(type, value);
            } catch (error) {
                console.error(`Error saving ${definition.collectionName} entry:`, error);
                status.textContent = 'Could not save to the shared list. Saving the case will retry.';
            }
        }, 0);
    };
    wrapper.addEventListener('focusout', handleFocusLeave);
    menu.addEventListener('focusout', handleFocusLeave);

    const combobox = { render, close, menu, wrapper };
    masterComboboxes.set(type, combobox);
    document.body.appendChild(menu);
    close();
    return combobox;
}

function renderMasterList(type) {
    masterComboboxes.get(type)?.render();
}

Object.keys(masterDefinitions).forEach(setupMasterCombobox);

document.addEventListener('click', event => {
    masterComboboxes.forEach(({ menu, wrapper }) => {
        if (!wrapper.contains(event.target) && !menu.contains(event.target)) {
            menu.hidden = true;
            const input = wrapper.querySelector('input');
            const toggle = wrapper.querySelector('.searchable-select-toggle');
            input.setAttribute('aria-expanded', 'false');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });
});

window.addEventListener('resize', () => {
    masterComboboxes.forEach(({ render }) => render());
});
document.querySelector('#caseModal .modal-body')?.addEventListener('scroll', () => {
    masterComboboxes.forEach(({ render }) => render());
});

const modal = document.getElementById('caseModal');
const form = document.getElementById('caseForm');
if (form) form.noValidate = true;
const caseRecordDrafts = [];
let selectedFirMasterId = '';
let editingFirMaster = false;
let selectedFirMasterData = null;
let activeCaseRecordIndex = -1;
let firStatusLoadSequence = 0;
let linkedFirStatusRecords = [];
const caseRecordList = document.getElementById('caseRecordList');
const caseRecordDetails = document.getElementById('caseRecordDetails');
const caseRecordStatus = document.getElementById('caseRecordStatus');
const caseRecordDetailTitle = document.getElementById('caseRecordDetailTitle');
let caseRecordLoadSequence = 0;
let policeStationLoadSequence = 0;

function refreshDerivedFirStatus(proceedings = null) {
    const statusSelect = document.getElementById('fir_Status');
    if (!statusSelect) return '';
    if (proceedings) linkedFirStatusRecords = proceedings;
    const draftRecords = caseRecordDrafts.map(record => ({
        id: record.id || record.localId,
        recordType: record.type,
        status: record.type === 'ucr' ? 'UCR' : record.fields.casestatus,
        report_type: record.fields.report_type,
        ucrNumber: record.fields.ucrNumber,
        predecessorCaseId: record.predecessorCaseId,
        successorCaseId: record.successorCaseId
    }));
    const draftIds = new Set(caseRecordDrafts.filter(record => record.id).map(record => record.id));
    const records = proceedings || [
        ...linkedFirStatusRecords.filter(record => !draftIds.has(record.id)),
        ...draftRecords
    ];
    const status = deriveFirStatus(selectedFirMasterData || {}, records);
    const statusLabels = {
        UI: 'Under Investigation',
        UT: 'Under Trial',
        Disposed: 'Disposed',
        UCR: 'Untraced',
        Cancelled: 'Cancelled'
    };
    statusSelect.value = statusLabels[status] || statusLabels.UI;
    return status;
}

async function loadDerivedFirStatusForMaster(masterId) {
    const sequence = ++firStatusLoadSequence;
    try {
        const records = await loadRecordsForFir(db, masterId);
        if (sequence !== firStatusLoadSequence || selectedFirMasterId !== masterId) return;
        refreshDerivedFirStatus(records);
    } catch (error) {
        console.error('Could not calculate FIR status from linked records:', error);
    }
}
const underSectionInput = document.getElementById('undersection');
const underSectionOptions = document.getElementById('underSectionOptions');
let savedUnderSections = [];
let underSectionMenuOpen = false;
let activeUnderSectionIndex = -1;

async function getAssignedPoliceStation(selectedStationId = '') {
    const user = auth.currentUser;
    if (!user) throw new Error('Your sign-in could not be verified. Sign in again or contact the administrator.');
    if (usesStationScopedAccess(db)) {
        const context = await getCaseAccessContext(db);
        if (context.role.role === 'operator') {
            const station = context.stations[0];
            return { policeStationId: station.id, policeStation: station.name };
        }
        const station = context.stations.find(item => item.id === selectedStationId);
        if (!station) throw new Error('Select an authorized police station before saving this FIR or proceeding.');
        return { policeStationId: station.id, policeStation: station.name };
    }
    let roleSnapshot;
    try {
        roleSnapshot = await getDoc(doc(db, 'userRoles', user.uid));
    } catch (error) {
        const assignmentError = new Error('Your police-station assignment could not be verified. Contact the administrator before saving.');
        assignmentError.cause = error;
        throw assignmentError;
    }

    const role = roleSnapshot.exists() ? roleSnapshot.data() : null;
    const policeStationId = String(role?.policeStationId || '').trim();
    if (!role || !['operator', 'admin'].includes(role.role) || role.status !== 'active' || !policeStationId) {
        throw new Error('No active police-station assignment was found for your account. Contact the administrator before saving.');
    }
    return {
        policeStationId,
        policeStation: String(role.policeStationName || role.policeStation || role.stationName || policeStationId).trim()
    };
}

async function preparePoliceStationSelector(caseItem) {
    const stationInput = document.getElementById('policestation');
    const stationSelect = document.getElementById('policeStationId');
    if (!stationInput || !stationSelect) return;
    if (!usesStationScopedAccess(db)) {
        stationSelect.hidden = true;
        const station = await getAssignedPoliceStation();
        stationInput.value = station.policeStation;
        return;
    }

    const context = await getCaseAccessContext(db);
    if (context.role.role === 'operator') {
        stationSelect.hidden = true;
        stationSelect.value = context.stations[0].id;
        stationInput.value = context.stations[0].name;
        return;
    }

    stationSelect.replaceChildren(new Option('Select a police station', ''));
    context.stations.forEach(station => stationSelect.add(new Option(station.name, station.id)));
    stationSelect.hidden = false;
    stationSelect.disabled = Boolean(caseItem?.id);
    stationSelect.value = context.stations.some(station => station.id === caseItem?.policeStationId)
        ? caseItem.policeStationId
        : '';
    stationInput.value = context.stations.find(station => station.id === stationSelect.value)?.name || '';
    stationSelect.onchange = () => {
        stationInput.value = context.stations.find(station => station.id === stationSelect.value)?.name || '';
    };
}

function refreshUcrActionState() {
    const button = document.getElementById('addUcrRecord');
    if (!button) return;
    const courtProceedingExists = caseRecordDrafts.some(record => record.type !== 'ucr')
        || linkedFirStatusRecords.some(record => record.recordType !== 'ucr' && !record.ucrNumber
            && !['ucr', 'untrace', 'untraced', 'cancelled', 'cancellation'].includes(String(record.status || '').toLowerCase()));
    const ucrExists = caseRecordDrafts.some(record => record.type === 'ucr');
    button.disabled = ucrExists || courtProceedingExists;
    button.title = ucrExists ? 'This FIR already has its single UCR report.'
        : courtProceedingExists ? 'A UCR report cannot be added after a court proceeding exists.' : '';
}

function closeUnderSectionSuggestions() {
    underSectionMenuOpen = false;
    activeUnderSectionIndex = -1;
    if (underSectionOptions) underSectionOptions.hidden = true;
    underSectionInput?.setAttribute('aria-expanded', 'false');
    underSectionInput?.removeAttribute('aria-activedescendant');
}

function positionUnderSectionSuggestions() {
    if (!underSectionInput || !underSectionOptions) return;
    const bounds = underSectionInput.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(bounds.width, window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min(bounds.left, window.innerWidth - width - viewportPadding));
    const spaceBelow = window.innerHeight - bounds.bottom;
    const placeAbove = spaceBelow < 230 && bounds.top > spaceBelow;
    const availableHeight = placeAbove ? bounds.top - viewportPadding : spaceBelow - viewportPadding;
    underSectionOptions.style.left = `${left}px`;
    underSectionOptions.style.width = `${width}px`;
    underSectionOptions.style.maxHeight = `${Math.max(60, Math.min(240, availableHeight))}px`;
    underSectionOptions.style.top = placeAbove ? '' : `${bounds.bottom + 4}px`;
    underSectionOptions.style.bottom = placeAbove ? `${window.innerHeight - bounds.top + 4}px` : '';
}

function appendUnderSectionLabel(option, value, query) {
    const lowerValue = value.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let fromIndex = 0;
    let matchIndex = lowerValue.indexOf(lowerQuery, fromIndex);

    while (matchIndex !== -1) {
        option.append(document.createTextNode(value.slice(fromIndex, matchIndex)));
        const match = document.createElement('mark');
        match.textContent = value.slice(matchIndex, matchIndex + query.length);
        option.append(match);
        fromIndex = matchIndex + query.length;
        matchIndex = lowerValue.indexOf(lowerQuery, fromIndex);
    }

    option.append(document.createTextNode(value.slice(fromIndex)));
}

function renderUnderSectionSuggestions() {
    if (!underSectionInput || !underSectionOptions) return;
    const query = underSectionInput.value;
    const matches = query
        ? savedUnderSections.filter(section => section.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
        : [];
    underSectionOptions.replaceChildren();
    activeUnderSectionIndex = Math.min(activeUnderSectionIndex, matches.length - 1);

    if (matches.length) {
        matches.forEach((section, index) => {
            const option = document.createElement('li');
            option.id = `underSectionOption${index}`;
            option.className = 'under-section-option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(index === activeUnderSectionIndex));
            appendUnderSectionLabel(option, section, query);
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => {
                underSectionInput.value = section;
                underSectionInput.dispatchEvent(new Event('input', { bubbles: true }));
                closeUnderSectionSuggestions();
                underSectionInput.focus();
            });
            underSectionOptions.appendChild(option);
        });
    } else if (query) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'under-section-empty';
        emptyMessage.setAttribute('role', 'presentation');
        emptyMessage.textContent = 'No matching saved sections';
        underSectionOptions.appendChild(emptyMessage);
    }

    underSectionOptions.hidden = !underSectionMenuOpen || !query;
    underSectionInput.setAttribute('aria-expanded', String(!underSectionOptions.hidden));
    underSectionInput.removeAttribute('aria-activedescendant');
    if (underSectionOptions.hidden) return;

    positionUnderSectionSuggestions();
    if (activeUnderSectionIndex >= 0 && matches[activeUnderSectionIndex]) {
        const activeOption = underSectionOptions.children[activeUnderSectionIndex];
        underSectionInput.setAttribute('aria-activedescendant', activeOption.id);
        activeOption.scrollIntoView({ block: 'nearest' });
    }
}

function loadSavedUnderSections() {
    if (savedUnderSectionsLoad) return;
    savedUnderSectionsLoad = loadCaseRecords(db).then(records => {
        const uniqueSections = new Map();
        records.forEach(record => {
            const value = record.underSection;
            if (typeof value !== 'string' || !value.trim()) return;
            const normalized = value.trim().toLowerCase();
            if (!uniqueSections.has(normalized)) uniqueSections.set(normalized, value);
        });
        savedUnderSections = [...uniqueSections.values()];
        if (underSectionMenuOpen) renderUnderSectionSuggestions();
    }).catch(error => {
        savedUnderSectionsLoad = null;
        console.error('Error loading saved case sections:', error);
    });
}

underSectionInput?.addEventListener('input', () => {
    loadSavedUnderSections();
    activeUnderSectionIndex = -1;
    underSectionMenuOpen = Boolean(underSectionInput.value);
    renderUnderSectionSuggestions();
});
underSectionInput?.addEventListener('focus', () => {
    loadSavedUnderSections();
    if (underSectionInput.value) {
        underSectionMenuOpen = true;
        renderUnderSectionSuggestions();
    }
});
underSectionInput?.addEventListener('keydown', event => {
    const query = underSectionInput.value;
    const matches = query
        ? savedUnderSections.filter(section => section.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
        : [];

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && query && matches.length) {
        event.preventDefault();
        if (!underSectionMenuOpen) {
            underSectionMenuOpen = true;
            activeUnderSectionIndex = event.key === 'ArrowDown' ? 0 : matches.length - 1;
        } else if (activeUnderSectionIndex < 0) {
            activeUnderSectionIndex = event.key === 'ArrowDown' ? 0 : matches.length - 1;
        } else {
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            activeUnderSectionIndex = (activeUnderSectionIndex + direction + matches.length) % matches.length;
        }
        renderUnderSectionSuggestions();
    } else if (event.key === 'Enter' && underSectionMenuOpen && activeUnderSectionIndex >= 0) {
        event.preventDefault();
        const option = underSectionOptions?.children[activeUnderSectionIndex];
        option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } else if (event.key === 'Escape' && underSectionMenuOpen) {
        event.preventDefault();
        closeUnderSectionSuggestions();
    } else if (event.key === 'Tab') {
        closeUnderSectionSuggestions();
    }
});

underSectionOptions?.addEventListener('click', event => {
    if (event.target === underSectionOptions) closeUnderSectionSuggestions();
});
if (underSectionOptions) document.body.appendChild(underSectionOptions);
document.addEventListener('click', event => {
    if (!underSectionInput?.contains(event.target)
        && !underSectionOptions?.contains(event.target)
        && !underSectionInput?.parentElement?.contains(event.target)) {
        closeUnderSectionSuggestions();
    }
});
window.addEventListener('resize', positionUnderSectionSuggestions);
document.querySelector('#caseModal .modal-body')?.addEventListener('scroll', positionUnderSectionSuggestions);
const registrationPrefixInput = document.getElementById('regprefix');
const registrationNumberInput = document.getElementById('regnumber');
const registrationYearInput = document.getElementById('regyear');
const registrationPrefixSuggestions = document.getElementById('regprefixSuggestions');
const registrationPrefixStorageKey = 'smartFirPrefixes';
const defaultRegistrationPrefixes = ['CHA', 'CHI', 'SC', 'NDPS', 'PC', 'ELC', 'UCR', 'JJB', 'FIR', 'DDR', 'CR', 'GD'];

function getRegistrationPrefixes() {
    try {
        const saved = JSON.parse(localStorage.getItem(registrationPrefixStorageKey) || '[]');
        return [...new Set([...defaultRegistrationPrefixes, ...(Array.isArray(saved) ? saved : [])]
            .map(value => String(value).trim().toUpperCase()).filter(Boolean))].sort();
    } catch {
        return [...defaultRegistrationPrefixes];
    }
}

function saveRegistrationPrefix(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return;
    try {
        localStorage.setItem(registrationPrefixStorageKey, JSON.stringify(
            [...new Set([...getRegistrationPrefixes(), normalized])]
        ));
    } catch { /* Prefix suggestions remain available from the built-in list. */ }
}

function closeRegistrationPrefixSuggestions() {
    if (!registrationPrefixSuggestions) return;
    registrationPrefixSuggestions.hidden = true;
    registrationPrefixInput?.setAttribute('aria-expanded', 'false');
}

function showRegistrationPrefixSuggestions() {
    if (!registrationPrefixInput || !registrationPrefixSuggestions) return;
    const query = registrationPrefixInput.value.trim().toUpperCase();
    const matches = getRegistrationPrefixes().filter(prefix => !query || prefix.includes(query)).slice(0, 12);
    registrationPrefixSuggestions.replaceChildren();
    const choosePrefix = value => {
        registrationPrefixInput.value = value;
        saveRegistrationPrefix(value);
        closeRegistrationPrefixSuggestions();
        registrationNumberInput?.focus();
    };
    matches.forEach(prefix => {
        const option = document.createElement('li');
        option.textContent = prefix;
        option.setAttribute('role', 'option');
        option.addEventListener('mousedown', event => {
            event.preventDefault();
            choosePrefix(prefix);
        });
        registrationPrefixSuggestions.appendChild(option);
    });
    if (query && !getRegistrationPrefixes().includes(query)) {
        const option = document.createElement('li');
        option.textContent = `+ Add "${query}"`;
        option.className = 'active';
        option.addEventListener('mousedown', event => {
            event.preventDefault();
            choosePrefix(query);
        });
        registrationPrefixSuggestions.appendChild(option);
    }
    registrationPrefixSuggestions.hidden = registrationPrefixSuggestions.children.length === 0;
    registrationPrefixInput.setAttribute('aria-expanded', String(!registrationPrefixSuggestions.hidden));
}

function setRegistrationNumberFromPaste(text) {
    if (!String(text).includes('/')) return false;
    const [prefix = '', number = '', year = ''] = String(text).trim().split('/');
    registrationPrefixInput.value = prefix.trim().toUpperCase().slice(0, 12);
    registrationNumberInput.value = number.replace(/\D/g, '').slice(0, 4);
    registrationYearInput.value = year.replace(/\D/g, '').slice(0, 4);
    saveRegistrationPrefix(registrationPrefixInput.value);
    closeRegistrationPrefixSuggestions();
    registrationYearInput.focus();
    return true;
}

registrationPrefixInput?.addEventListener('focus', showRegistrationPrefixSuggestions);
registrationPrefixInput?.addEventListener('input', () => {
    registrationPrefixInput.value = registrationPrefixInput.value.replace(/[\/\s]/g, '').toUpperCase().slice(0, 12);
    showRegistrationPrefixSuggestions();
});
registrationPrefixInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeRegistrationPrefixSuggestions();
    if (event.key === 'Enter' && !registrationPrefixSuggestions?.hidden) {
        const firstOption = registrationPrefixSuggestions.querySelector('li');
        if (firstOption) {
            event.preventDefault();
            firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
    }
    if (event.key === '/') {
        event.preventDefault();
        closeRegistrationPrefixSuggestions();
        registrationNumberInput?.focus();
    }
});
registrationPrefixInput?.addEventListener('blur', () => {
    window.setTimeout(() => {
        closeRegistrationPrefixSuggestions();
        registrationPrefixInput.value = registrationPrefixInput.value.trim().toUpperCase();
        saveRegistrationPrefix(registrationPrefixInput.value);
    }, 120);
});
registrationNumberInput?.addEventListener('input', () => {
    registrationNumberInput.value = registrationNumberInput.value.replace(/\D/g, '').slice(0, 4);
    if (registrationNumberInput.value.length === 4) registrationYearInput?.focus();
});
registrationNumberInput?.addEventListener('keydown', event => {
    if (event.key === '/' || (event.key === 'ArrowRight' &&
        registrationNumberInput.selectionStart === registrationNumberInput.value.length &&
        registrationNumberInput.value.length > 0)) {
        event.preventDefault();
        registrationYearInput?.focus();
    }
});
registrationYearInput?.addEventListener('input', () => {
    registrationYearInput.value = registrationYearInput.value.replace(/\D/g, '').slice(0, 4);
});
registrationYearInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        form?.requestSubmit();
    }
});
[registrationPrefixInput, registrationNumberInput, registrationYearInput].forEach(input => {
    input?.addEventListener('paste', event => {
        const pastedText = (event.clipboardData || window.clipboardData)?.getData('text') || '';
        if (setRegistrationNumberFromPaste(pastedText)) event.preventDefault();
    });
});

const judgeSelect = document.getElementById('caseJudgeSelect');
const judgeSelectStatus = document.getElementById('judgeSelectStatus');
const judgeIdInput = document.getElementById('caseJudgeId');
const courtNumberInput = document.getElementById('caseCourtNumber');
const judgeCourtTypeInput = document.getElementById('caseJudgeCourtType');
const judgeNameInput = document.getElementById('caseJudgeName');
const courtNameInput = document.getElementById('courtnan');
let caseJudgeRecords = new Map();
let judgeLoadSequence = 0;
const caseIoSelect = document.getElementById('caseIoSelect');
const ioSelectStatus = document.getElementById('ioSelectStatus');
const caseIoIdInput = document.getElementById('caseIoId');
const ioRankInput = document.getElementById('iorank');
const ioNameInput = document.getElementById('ioname');
const ioBeltInput = document.getElementById('ioBeltno');
const ioMobileInput = document.getElementById('iomobileNo');
let caseIoRecords = new Map();
let ioLoadSequence = 0;
let stopIoListener = null;
let caseIoSelectionTouched = false;
let resettingFormForModalOpen = false;

function normalizeJudgeValue(value) {
    return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function getJudgePrefix(judge) {
    return judge.namePrefix === 'Other'
        ? String(judge.customPrefix || '').trim()
        : String(judge.namePrefix || '').trim();
}

function getJudgeDesignation(judge) {
    return String(judge.designation || judge.judicialDesignation || judge.courtType || '').trim();
}

function getEligibleCaseJudges() {
    const courtType = normalizeJudgeValue(document.getElementById('courttype')?.value);
    const allowedDesignations = courtType === 'session court'
        ? ['dj', 'asj']
        : courtType === 'jjb'
            ? ['acj']
            : courtType === 'lower court'
                ? ['cjm', 'acjm', 'jmic']
                : [];
    return [...caseJudgeRecords.values()].filter(judge =>
        allowedDesignations.includes(normalizeJudgeValue(getJudgeDesignation(judge)))
    );
}

function populateCaseJudgeOptions(selectedId = '') {
    if (!judgeSelect) return;
    const eligibleJudges = getEligibleCaseJudges();
    judgeSelect.replaceChildren(new Option('', '', true, true));
    eligibleJudges.forEach(judge => {
        judgeSelect.add(new Option(getJudgeDisplayName(judge), judge.id));
    });
    if (selectedId && eligibleJudges.some(judge => judge.id === selectedId)) {
        judgeSelect.value = selectedId;
    }
}

function getJudgeDisplayName(judge) {
    const name = String(judge.judgeName || '').trim();
    const court = [String(judge.courtNumber || '').trim(), getJudgeDesignation(judge)]
        .filter(Boolean)
        .join(' ');
    const judgeName = [getJudgePrefix(judge), name].filter(Boolean).join(' ');
    return [court, judgeName].filter(Boolean).join(' -- ');
}

function getCaseCourtName(judge) {
    const name = [getJudgePrefix(judge), String(judge.judgeName || '').trim()].filter(Boolean).join(' ');
    const court = [String(judge.courtNumber || '').trim(), getJudgeDesignation(judge)]
        .filter(Boolean)
        .join(' ');
    return [court, name].filter(Boolean).join(' -- ');
}

function judgeSnapshotFromCase(caseItem) {
    const courtName = String(caseItem.courtName || '').trim();
    const segments = courtName.split(/\s*\|\s*|\s+[—–]\s+/);
    const firstSegment = segments[0] || '';
    const legacyCourt = /^Court\s+No\.\s*/i.test(firstSegment)
        ? firstSegment.replace(/^Court\s+No\.\s*/i, '')
        : firstSegment;
    const courtTypes = '(ACJM|ACJ|ASJ|CJM|DJ|JMIC|JMFC)';
    const pipeDisplay = new RegExp(`^Court\\s+No\\.\\s*(.*?)\\s*\\|\\s*${courtTypes}\\s*\\|\\s*(.+)$`, 'i')
        .exec(courtName);
    const typeMatch = new RegExp(`^(.+?)\\s+${courtTypes}\\b`, 'i').exec(legacyCourt);
    const courtNumber = String(caseItem.courtNumber || (pipeDisplay ? pipeDisplay[1] : typeMatch ? typeMatch[1] : '')).trim();
    const courtType = String(caseItem.judgeCourtType || (pipeDisplay ? pipeDisplay[2] : typeMatch ? typeMatch[2] : '')).trim();
    const nameFromDisplay = pipeDisplay
        ? pipeDisplay[3]
        : segments.length > 1
            ? segments[segments.length - 1]
            : courtName.replace(new RegExp(`^.*?\\b${courtTypes}\\s*[—–-]\\s*`, 'i'), '');
    const parsedName = /^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*(.+)$/i.exec(nameFromDisplay);
    const judgeName = String(caseItem.judgeName || (parsedName ? parsedName[2] : '')).trim();
    const namePrefix = String(caseItem.judgeNamePrefix || (parsedName ? parsedName[1] : '')).trim();
    return {
        judgeId: String(caseItem.judgeId || ''),
        courtNumber,
        courtType,
        judgeName,
        namePrefix,
        customPrefix: String(caseItem.customPrefix || ''),
        courtName,
        judgeDisplayName: String(caseItem.judgeDisplayName || '')
    };
}

function applyJudgeSnapshot(judge, judgeId) {
    courtNumberInput.value = String(judge.courtNumber || '');
    judgeCourtTypeInput.value = getJudgeDesignation(judge);
    judgeNameInput.value = String(judge.judgeName || '');
    courtNameInput.value = String(judge.courtName || getCaseCourtName(judge));
    judgeIdInput.value = judgeId || '';
    document.getElementById('caseJudgeDisplayName').value =
        String(judge.judgeDisplayName ||
            (judge.courtNumber && getJudgeDesignation(judge) && judge.judgeName
                ? getJudgeDisplayName(judge)
                : judge.courtName || ''));
}

function selectJudge(judgeId) {
    if (!judgeId) {
        applyJudgeSnapshot({}, '');
        return;
    }
    if (judgeId === '__legacy__') {
        return;
    }
    const judge = caseJudgeRecords.get(judgeId);
    if (!judge) return;
    applyJudgeSnapshot({
        ...judge,
        courtName: getCaseCourtName(judge),
        judgeDisplayName: getJudgeDisplayName(judge)
    }, judgeId);
}

async function loadCaseJudges(caseItem, loadId) {
    if (!judgeSelect || !judgeSelectStatus) return;
    judgeSelect.disabled = true;
    judgeSelect.replaceChildren(new Option('Loading judges…', ''));
    judgeSelectStatus.textContent = 'Loading judges…';
    caseJudgeRecords = new Map();
    try {
        const snapshot = await getDocs(collection(db, 'judges'));
        if (loadId !== judgeLoadSequence) return;
        const judges = snapshot.docs.map(judgeDoc => ({
            id: judgeDoc.id,
            ...judgeDoc.data()
        })).filter(judge =>
            String(judge.courtNumber || '').trim() &&
            getJudgeDesignation(judge) &&
            String(judge.judgeName || '').trim()
        ).sort((left, right) =>
            String(left.courtNumber).localeCompare(String(right.courtNumber), undefined, { numeric: true }) ||
            getJudgeDesignation(left).localeCompare(getJudgeDesignation(right)) ||
            String(left.judgeName).localeCompare(String(right.judgeName))
        );
        caseJudgeRecords = new Map(judges.map(judge => [judge.id, judge]));
        populateCaseJudgeOptions();
        const eligibleJudges = getEligibleCaseJudges();

        const caseJudge = judgeSnapshotFromCase(caseItem || {});
        const selectedJudge = (caseJudge.judgeId && eligibleJudges.find(judge => judge.id === caseJudge.judgeId))
            ? eligibleJudges.find(judge => judge.id === caseJudge.judgeId)
            : eligibleJudges.find(judge =>
                caseJudge.courtNumber &&
                normalizeJudgeValue(judge.courtNumber) === normalizeJudgeValue(caseJudge.courtNumber) &&
                normalizeJudgeValue(getJudgeDesignation(judge)) === normalizeJudgeValue(caseJudge.courtType) &&
                normalizeJudgeValue(judge.judgeName) === normalizeJudgeValue(caseJudge.judgeName)
            );

        if (selectedJudge) {
            judgeSelect.value = selectedJudge.id;
            if (caseItem && (caseJudge.courtName || caseJudge.judgeName || caseJudge.judgeId)) {
                applyJudgeSnapshot({
                    ...caseJudge,
                    courtNumber: caseJudge.courtNumber || selectedJudge.courtNumber,
                    courtType: caseJudge.courtType || getJudgeDesignation(selectedJudge),
                    judgeName: caseJudge.judgeName || selectedJudge.judgeName,
                    namePrefix: caseJudge.namePrefix || getJudgePrefix(selectedJudge),
                    judgeDisplayName: caseJudge.judgeDisplayName || getJudgeDisplayName(caseJudge.judgeName
                        ? caseJudge
                        : selectedJudge),
                    courtName: caseJudge.courtName || getCaseCourtName(selectedJudge)
                }, selectedJudge.id);
            } else {
                selectJudge(selectedJudge.id);
            }
        } else if (!caseItem || !(caseJudge.courtName || caseJudge.judgeId || caseJudge.judgeName)) {
            selectJudge('');
        }

        judgeSelect.disabled = false;
        judgeSelectStatus.textContent = eligibleJudges.length
            ? ''
            : 'No judges match this court type. Check All Judges designations.';
    } catch (error) {
        if (loadId !== judgeLoadSequence) return;
        console.error('Error loading judges for case form:', error);
        judgeSelect.replaceChildren(new Option('Could not load judges', ''));
        const caseJudge = judgeSnapshotFromCase(caseItem || {});
        if (caseItem && (caseJudge.courtName || caseJudge.judgeId || caseJudge.judgeName)) {
            judgeSelect.add(new Option(
                `Saved case (legacy): ${caseJudge.courtName || 'Judge no longer in register'}`,
                '__legacy__'
            ));
            judgeSelect.value = '__legacy__';
            applyJudgeSnapshot(caseJudge, caseJudge.judgeId);
        }
        judgeSelect.disabled = false;
        judgeSelectStatus.textContent = 'Could not load judges. Check your connection and permissions, then reopen the form to retry.';
    }
}

judgeSelect?.addEventListener('change', () => selectJudge(judgeSelect.value));
document.getElementById('courttype')?.addEventListener('change', () => {
    const activeDraft = caseRecordDrafts[activeCaseRecordIndex];
    const selectedCourtType = String(document.getElementById('courttype')?.value || '').trim();
    const isJjbCourt = selectedCourtType.toLowerCase() === 'jjb';
    if (registrationPrefixInput) {
        if (isJjbCourt) {
            if (!registrationPrefixInput.disabled && registrationPrefixInput.value.trim().toUpperCase() !== 'JJB') {
                if (activeDraft) activeDraft.nonJjbRegPrefix = registrationPrefixInput.value.trim() || 'CHI';
            }
            registrationPrefixInput.value = 'JJB';
            registrationPrefixInput.disabled = true;
            closeRegistrationPrefixSuggestions();
        } else {
            if (registrationPrefixInput.disabled && registrationPrefixInput.value.trim().toUpperCase() === 'JJB') {
                registrationPrefixInput.value = activeDraft?.nonJjbRegPrefix || 'CHI';
            }
            registrationPrefixInput.disabled = false;
        }
    }
    if (activeDraft?.courtTypeDrivesType && activeDraft.type !== 'ucr') {
        const courtType = selectedCourtType.toLowerCase();
        if (courtType) {
            activeDraft.type = courtType.includes('session')
                ? 'session'
                : courtType.includes('jjb')
                    ? 'jjb'
                    : 'lower';
            renderCaseRecordList();
        }
    }
    populateCaseJudgeOptions();
    selectJudge('');
    if (judgeSelectStatus) {
        judgeSelectStatus.textContent = getEligibleCaseJudges().length
            ? ''
            : 'No judges match this court type. Check All Judges designations.';
    }
});

function caseIoSnapshot(caseItem = {}) {
    return {
        ioId: String(caseItem.ioId || '').trim(),
        ioRank: String(caseItem.ioRank || '').trim(),
        ioName: String(caseItem.ioName || '').trim(),
        ioBeltno: String(caseItem.ioBeltno ?? caseItem.beltNo ?? '').trim(),
        iomobileNo: String(caseItem.iomobileNo ?? caseItem.mobileNo ?? '').trim()
    };
}

function applyCaseIoSnapshot(officer = {}, ioId = '') {
    caseIoIdInput.value = ioId;
    ioRankInput.value = String(officer.ioRank || '');
    ioNameInput.value = String(officer.ioName || '');
    ioBeltInput.value = String(officer.ioBeltno ?? officer.beltNo ?? '');
    ioMobileInput.value = String(officer.iomobileNo ?? officer.mobileNo ?? '');
}

function formatCaseIo(officer) {
    const identity = [officer.ioRank, officer.ioName].filter(Boolean).join(' ').trim();
    const mobileNo = officer.iomobileNo ?? officer.mobileNo;
    const beltNo = officer.ioBeltno ?? officer.beltNo;
    const beltAndMobile = beltNo && mobileNo
        ? `${beltNo} - ${mobileNo}`
        : beltNo || mobileNo || '';
    return [identity, beltAndMobile].filter(Boolean).join(' ');
}

function matchesCaseIo(officer, savedIo) {
    return normalizeJudgeValue(officer.ioName) === normalizeJudgeValue(savedIo.ioName) &&
        normalizeJudgeValue(officer.ioRank) === normalizeJudgeValue(savedIo.ioRank) &&
        normalizeJudgeValue(officer.ioBeltno ?? officer.beltNo) === normalizeJudgeValue(savedIo.ioBeltno) &&
        normalizeJudgeValue(officer.iomobileNo ?? officer.mobileNo) === normalizeJudgeValue(savedIo.iomobileNo);
}

function populateCaseIoOptions(caseItem = {}) {
    if (!caseIoSelect) return;
    const savedIo = caseIoSelectionTouched
        ? caseIoSnapshot({
            ioId: caseIoIdInput.value,
            ioRank: ioRankInput.value,
            ioName: ioNameInput.value,
            ioBeltno: ioBeltInput.value,
            iomobileNo: ioMobileInput.value
        })
        : caseIoSnapshot(caseItem);
    const currentId = caseIoIdInput.value || savedIo.ioId;
    const options = [...caseIoRecords.values()].filter(officer =>
        officer.active !== false || officer.id === currentId
    );
    caseIoSelect.replaceChildren(new Option('Select Investigating Officer', '', true, true));
    options.forEach(officer => {
        caseIoSelect.add(new Option(
            formatCaseIo(officer),
            officer.id
        ));
    });
    const selectedById = currentId && caseIoRecords.get(currentId);
    const matchingLegacyRecords = !savedIo.ioId && savedIo.ioName
        ? [...caseIoRecords.values()].filter(officer => matchesCaseIo(officer, savedIo))
        : [];
    const selectedOfficer = selectedById || (matchingLegacyRecords.length === 1 ? matchingLegacyRecords[0] : null);

    if (selectedOfficer) {
        caseIoSelect.value = selectedOfficer.id;
        applyCaseIoSnapshot(selectedOfficer, selectedOfficer.id);
        if (selectedOfficer.active === false) {
            ioSelectStatus.textContent = 'This saved IO is inactive; it remains selected for this existing case.';
        } else {
            ioSelectStatus.textContent = '';
        }
    } else if (savedIo.ioName || savedIo.ioId) {
        caseIoSelect.add(new Option(
            `Saved case IO: ${formatCaseIo(savedIo) || 'no longer in register'}`,
            '__legacy__'
        ));
        caseIoSelect.value = '__legacy__';
        applyCaseIoSnapshot(savedIo, savedIo.ioId);
        ioSelectStatus.textContent = 'Saved IO details are preserved; no unique register match was found.';
    } else {
        applyCaseIoSnapshot({});
        if (!options.length) {
            ioSelectStatus.textContent = 'Add officers from Settings → Manage IO.';
        } else {
            ioSelectStatus.textContent = '';
        }
    }
    syncIoEditButton();
    syncUcrIoControls();
}

function syncUcrIoControls() {
    const ucrSelect = document.getElementById('ucrIoSelect');
    if (!ucrSelect || !caseIoSelect) return;
    ucrSelect.replaceChildren(...Array.from(caseIoSelect.options, option => option.cloneNode(true)));
    ucrSelect.value = caseIoSelect.value;
    ucrSelect.disabled = caseIoSelect.disabled;
    const status = document.getElementById('ucrIoSelectStatus');
    if (status) status.textContent = ioSelectStatus?.textContent || '';
    const editButton = document.getElementById('editUcrIO');
    if (editButton) editButton.hidden = !caseIoRecords.has(ucrSelect.value);
}

function syncIoEditButton() {
    const editButton = document.getElementById('editManageIO');
    if (editButton) editButton.hidden = !caseIoRecords.has(caseIoSelect?.value);
}

function subscribeCaseIOs(caseItem, loadId) {
    if (!caseIoSelect || !ioSelectStatus) return;
    if (stopIoListener) stopIoListener();
    caseIoSelect.disabled = true;
    caseIoSelectionTouched = false;
    caseIoSelect.replaceChildren(new Option('Loading IO register…', '', true, true));
    caseIoSelect.options[0].disabled = true;
    ioSelectStatus.textContent = 'Loading investigating officers…';
    caseIoRecords = new Map();
    stopIoListener = onSnapshot(collection(db, 'investigatingOfficers'), snapshot => {
        if (loadId !== ioLoadSequence) return;
        caseIoRecords = new Map(snapshot.docs.map(officerDocument => [
            officerDocument.id,
            { id: officerDocument.id, active: true, ...officerDocument.data() }
        ]));
        populateCaseIoOptions(caseItem || {});
        caseIoSelect.disabled = false;
        syncUcrIoControls();
    }, error => {
        if (loadId !== ioLoadSequence) return;
        console.error('Error loading IO register for case form:', error);
        const savedIo = caseIoSnapshot(caseItem || {});
        caseIoSelect.replaceChildren(new Option('Could not load IO register', '', true, true));
        caseIoSelect.options[0].disabled = true;
        if (savedIo.ioName || savedIo.ioId) {
            caseIoSelect.add(new Option(
                `Saved case IO: ${formatCaseIo(savedIo) || 'unavailable'}`,
                '__legacy__'
            ));
            caseIoSelect.value = '__legacy__';
            applyCaseIoSnapshot(savedIo, savedIo.ioId);
        }
        caseIoSelect.disabled = false;
        syncUcrIoControls();
        ioSelectStatus.textContent = 'Could not load IOs. Saved case details have been preserved; reopen the form to retry.';
        syncUcrIoControls();
    });
}

caseIoSelect?.addEventListener('change', () => {
    caseIoSelectionTouched = true;
    const selectedId = caseIoSelect.value;
    if (selectedId === '__legacy__') return;
    const officer = caseIoRecords.get(selectedId);
    applyCaseIoSnapshot(officer || {}, officer?.id || '');
    ioSelectStatus.textContent = '';
    syncIoEditButton();
    syncUcrIoControls();
});

document.getElementById('ucrIoSelect')?.addEventListener('change', event => {
    if (!caseIoSelect) return;
    caseIoSelect.value = event.currentTarget.value;
    caseIoSelect.dispatchEvent(new Event('change'));
});

function openCaseIoDialog(officer = null) {
    if (caseIoSelect.disabled) {
        ioSelectStatus.textContent = 'Please wait while the IO register loads.';
        return;
    }
    openIoDialog({
        officer,
        caseModal: true,
        getOfficers: () => [...caseIoRecords.values()],
        onSaved: ({ mode, id, data }) => {
            caseIoRecords.set(id, { ...caseIoRecords.get(id), id, ...data });
            caseIoSelectionTouched = true;
            if (mode === 'add') caseIoIdInput.value = id;
            populateCaseIoOptions();
            if (mode === 'add') ioSelectStatus.textContent = 'IO saved and selected.';
        },
        onDeleted: ({ id, deactivated }) => {
            const wasSelected = caseIoIdInput.value === id;
            if (deactivated) caseIoRecords.set(id, { ...caseIoRecords.get(id), id, active: false });
            else caseIoRecords.delete(id);
            caseIoSelectionTouched = true;
            if (wasSelected && !deactivated) applyCaseIoSnapshot({});
            populateCaseIoOptions();
        }
    });
}

document.getElementById('openManageIO')?.addEventListener('click', () => openCaseIoDialog());
document.getElementById('editManageIO')?.addEventListener('click', () => {
    const officer = caseIoRecords.get(caseIoSelect.value);
    if (officer) openCaseIoDialog(officer);
});
document.getElementById('openManageUcrIO')?.addEventListener('click', () => openCaseIoDialog());
document.getElementById('editUcrIO')?.addEventListener('click', () => {
    const officer = caseIoRecords.get(document.getElementById('ucrIoSelect')?.value);
    if (officer) openCaseIoDialog(officer);
});

form.addEventListener('reset', () => {
    if (resettingFormForModalOpen) return;
    setTimeout(() => {
        caseIoSelectionTouched = true;
        caseIoSelect.selectedIndex = 0;
        applyCaseIoSnapshot({});
        ioSelectStatus.textContent = '';
        syncIoEditButton();
    }, 0);
});

function initDatePickers(container = document) {
    const dateInputs = container.querySelectorAll('input[type="date"], input.flatpickr-date');
    dateInputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.readOnly = true;
        if (input.getAttribute('type') === 'date') {
            input.setAttribute('type', 'text');
            input.classList.add('flatpickr-date');
        }
    });
    if (window.flatpickr) {
        dateInputs.forEach(input => {
            if (!input._flatpickr) {
                window.flatpickr(input, {
                    dateFormat: 'd/m/Y',
                    allowInput: false,
                    clickOpens: true,
                    disableMobile: true
                });
            }
            input.readOnly = true;
            input.addEventListener('click', () => {
                if (!input.disabled) input._flatpickr?.open();
            });
        });
    }
}
setTimeout(() => initDatePickers(modal), 50);

// Helper for resetting form state
function resetForm() {
    resettingFormForModalOpen = true;
    closePoliceReportMenu();
    caseRecordLoadSequence += 1;
    form.reset();
    resettingFormForModalOpen = false;
    caseRecordDrafts.length = 0;
    linkedFirStatusRecords = [];
    selectedFirMasterId = '';
    editingFirMaster = false;
    selectedFirMasterData = null;
    document.getElementById('fir_Status').value = 'Under Investigation';
    firStatusLoadSequence += 1;
    setFirMasterFieldsLocked(false);
    setFirMasterEditingMode(false);
    activeCaseRecordIndex = -1;
    if (caseRecordDetails) caseRecordDetails.hidden = true;
    if (caseRecordStatus) caseRecordStatus.textContent = '';
    renderCaseRecordList();
    setCaseRecordEditorVisibility(null);
    resetHearingRecords();
    masterComboboxes.forEach(({ close }) => close());
    closeUnderSectionSuggestions();
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

// =========================================================
// CONDITIONAL VISIBILITY (Case Status)
// =========================================================
function updateCaseStatusFields() {
    const statusSelect = document.getElementById('casestatus');
    if (!statusSelect) return;

    const activeDraft = caseRecordDrafts[activeCaseRecordIndex];
    if (activeDraft) {
        setCaseRecordEditorVisibility(activeDraft);
        if (activeDraft.type === 'ucr') return;
    }

    const status = statusSelect.value;

    const els = {
        courtTypeWrap: document.getElementById('courttypeWrap'),
        courtReg: document.getElementById('sectionCourtReg'),
        chargeDate: document.getElementById('fieldChargedate'),
        nextDate: document.getElementById('sectionNextDate'),
        accused: document.getElementById('sectionAccused'),
        witness: document.getElementById('sectionWitness')
    };

    // Reset all to visible first
    Object.values(els).forEach(el => {
        if (el) el.style.display = '';
    });

    // Reset required attributes for conditionally hidden fields
    const courtTypeInput = document.getElementById('courttype');
    if (courtTypeInput) courtTypeInput.required = true;

    // Helper to hide and manage validation
    const hide = (...elements) => {
        elements.forEach(el => {
            if (el) el.style.display = 'none';
            if (el === els.courtTypeWrap && courtTypeInput) {
                courtTypeInput.required = false;
            }
        });
    };

    switch (status) {
        case 'UCR': // Untrace
        case 'Cancellation':
            hide(els.chargeDate, els.nextDate, els.accused, els.witness, els.other);
            break;
        case 'Disposed':
            hide(els.nextDate);
            break;
        case 'UI': // Under Investigation
            hide(els.courtTypeWrap, els.courtReg, els.nextDate, els.accused, els.witness, els.other);
            break;
        case 'UT': // Under Trial
        default:
            // Show all (already reset above)
            break;
    }
}

document.getElementById('casestatus')?.addEventListener('change', updateCaseStatusFields);
document.getElementById('caseForm')?.addEventListener('reset', () => {
    setTimeout(() => {
        updateCaseStatusFields();
        renderNextDateStage();
    }, 10);
});

const nextDateStageDate = document.getElementById('nextDateStageDate');
const nextDateStageTrial = document.getElementById('nextDateStageTrial');
const hearingMarkAsInput = document.getElementById('hearingMarkAs');
const nextDateValue = document.getElementById('caseNextDateValue');
const trialStageValue = document.getElementById('caseTrialStageValue');
const hearingRecordList = document.getElementById('hearingRecordList');
const hearingRecordStatus = document.getElementById('hearingRecordStatus');
const addHearingRecordButton = document.getElementById('addHearingRecord');
const cancelHearingEditButton = document.getElementById('cancelHearingEdit');
const deleteHearingRecordButton = document.getElementById('deleteHearingRecord');
const HEARING_RECORD_STORAGE_KEY = 'register-diary-file-statuses';
let hearingDateRecords = [];
let editingHearingRecordId = null;

function getHearingMarkAs(stage) {
    const normalizedStage = normalizeTrialStage(stage).trim().toLowerCase();
    if (normalizedStage === 'charge') return 'Date of Charge';
    if (normalizedStage === 'committed' || normalizedStage === 'disposed') return 'Date of Disposed';
    return 'Hearing';
}

function updateHearingMarkAs(stage = nextDateStageTrial?.value) {
    if (hearingMarkAsInput) hearingMarkAsInput.value = getHearingMarkAs(stage);
}

function parseHearingDate(value) {
    const trimmed = String(value || '').trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        || trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    const [, first, second, third] = match;
    const [year, month, day] = trimmed.includes('-')
        ? [Number(first), Number(second), Number(third)]
        : [Number(third), Number(second), Number(first)];
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatHearingDate(dateKey) {
    const parsed = parseHearingDate(dateKey);
    if (!parsed) return String(dateKey || '');
    const [year, month, day] = parsed.split('-');
    return `${day}/${month}/${year}`;
}

function hearingDateKind(dateKey) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateKey > todayKey ? 'next' : 'previous';
}

function resetHearingRecords() {
    hearingDateRecords = [];
    editingHearingRecordId = null;
    if (hearingRecordStatus) hearingRecordStatus.textContent = '';
    if (addHearingRecordButton) addHearingRecordButton.textContent = 'Add Hearing';
    updateHearingMarkAs('');
    if (cancelHearingEditButton) cancelHearingEditButton.hidden = true;
    if (deleteHearingRecordButton) deleteHearingRecordButton.hidden = true;
    if (hearingRecordList) hearingRecordList.replaceChildren();
    updateChargeDate();
}

function updateChargeDate() {
    const chargeDateInput = document.getElementById('chargedate');
    if (chargeDateInput) chargeDateInput.value = latestChargeDate(hearingDateRecords);
}

function renderHearingRecords() {
    if (!hearingRecordList) return;
    hearingRecordList.replaceChildren();
    if (hearingDateRecords.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hearing-record-empty';
        empty.textContent = 'No hearing dates saved.';
        hearingRecordList.append(empty);
        return;
    }

    [...hearingDateRecords]
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach(record => {
            const row = document.createElement('div');
            row.className = 'hearing-record-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            const displayStage = normalizeTrialStage(record.trialStage);
            row.setAttribute('aria-label', `Edit hearing ${formatHearingDate(record.date)}${displayStage ? `, ${displayStage}` : ''}`);
            const details = document.createElement('span');
            details.className = 'hearing-record-details';
            details.textContent = `${formatHearingDate(record.date)}${displayStage ? ` — ${displayStage}` : ''}`;

            const beginEdit = () => {
                editingHearingRecordId = record.id;
                if (nextDateStageDate?._flatpickr) {
                    nextDateStageDate._flatpickr.setDate(record.date, false, 'Y-m-d');
                } else if (nextDateStageDate) {
                    nextDateStageDate.value = formatHearingDate(record.date);
                }
                setTrialStageSelectValue(nextDateStageTrial, record.trialStage);
                updateHearingMarkAs(record.trialStage);
                if (addHearingRecordButton) addHearingRecordButton.textContent = 'Update Hearing';
                if (cancelHearingEditButton) cancelHearingEditButton.hidden = false;
                if (deleteHearingRecordButton) deleteHearingRecordButton.hidden = false;
                if (hearingRecordStatus) hearingRecordStatus.textContent = '';
            };
            row.addEventListener('click', beginEdit);
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                beginEdit();
            });
            const markAs = document.createElement('span');
            markAs.className = 'hearing-record-mark-as';
            markAs.textContent = record.markAs || getHearingMarkAs(record.trialStage);
            row.append(details, markAs);
            hearingRecordList.append(row);
        });
}

function cancelHearingRecordEdit() {
    editingHearingRecordId = null;
    if (addHearingRecordButton) addHearingRecordButton.textContent = 'Add Hearing';
    if (cancelHearingEditButton) cancelHearingEditButton.hidden = true;
    if (deleteHearingRecordButton) deleteHearingRecordButton.hidden = true;
    updateHearingMarkAs('');
    if (nextDateStageDate?._flatpickr) nextDateStageDate._flatpickr.clear(false);
    else if (nextDateStageDate) nextDateStageDate.value = '';
    if (nextDateStageTrial) nextDateStageTrial.value = '';
    if (hearingRecordStatus) hearingRecordStatus.textContent = '';
}

function updateHearingDateSnapshot() {
    updateChargeDate();
    if (!nextDateValue || !trialStageValue) return;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const nextRecord = hearingDateRecords
        .filter(record => record.date > todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    nextDateValue.value = nextRecord ? formatHearingDate(nextRecord.date) : '';
    const activeDraft = caseRecordDrafts[activeCaseRecordIndex];
    trialStageValue.value = activeDraft?.successorCaseId
        ? 'Committed'
        : (nextRecord?.trialStage || '');
    renderNextDateStage();
    const latestStage = activeDraft?.successorCaseId
        ? 'Committed'
        : latestTrialStage(hearingDateRecords, trialStageValue.value);
    syncCaseStatusFromTrialStage(latestStage);
}

function getCaseStatusFromTrialStage(stage) {
    const normalizedStage = normalizeTrialStage(stage).trim().toLowerCase();
    if (normalizedStage === 'committed' || normalizedStage === 'committed to sessions court') return 'Committed';
    if (normalizedStage === 'disposed') return 'Disposed';
    return 'UT';
}

function syncCaseStatusFromTrialStage(stage) {
    const activeDraft = caseRecordDrafts[activeCaseRecordIndex];
    if (activeDraft?.type === 'ucr') return;
    const statusSelect = document.getElementById('casestatus');
    if (!statusSelect) return;
    const status = getCaseStatusFromTrialStage(stage);
    statusSelect.value = status;
    if (activeDraft) activeDraft.fields.casestatus = status;
    updateCaseStatusFields();
}

nextDateStageTrial?.addEventListener('change', () => {
    updateHearingMarkAs(nextDateStageTrial.value);
    syncCaseStatusFromTrialStage(nextDateStageTrial.value);
});

function loadHearingRecords(caseItem) {
    resetHearingRecords();
    if (!caseItem) return;

    try {
        const saved = localStorage.getItem(HEARING_RECORD_STORAGE_KEY);
        const allCases = saved ? JSON.parse(saved) : {};
        if (!allCases || typeof allCases !== 'object' || Array.isArray(allCases)) {
            throw new Error('Saved hearing records have an invalid format.');
        }
        const firestoreRecords = Array.isArray(caseItem.hearingDateRecord)
            ? caseItem.hearingDateRecord
            : Array.isArray(caseItem.registerDiaryDaterecords)
                ? caseItem.registerDiaryDaterecords
                : Array.isArray(caseItem.registerDiaryDateRecords)
                    ? caseItem.registerDiaryDateRecords
                    : null;
        const savedRecords = firestoreRecords || allCases[caseItem.id]?.dateRecords;
        if (Array.isArray(savedRecords)) {
            hearingDateRecords = savedRecords
                .filter(record => record && typeof record.id === 'string'
                    && ['previous', 'next'].includes(record.kind)
                    && parseHearingDate(record.date))
                .map(record => ({
                    id: record.id,
                    kind: record.kind,
                    date: parseHearingDate(record.date),
                    trialStage: String(record.trialStage || '').trim(),
                    markAs: getHearingMarkAs(record.trialStage)
                }));
        }

        const legacyDate = parseHearingDate(caseItem.nextDate);
        if (legacyDate && !hearingDateRecords.some(record => record.date === legacyDate)
            && !hearingDateRecords.some(record => record.kind === 'next')) {
            hearingDateRecords.push({
                id: `case-next-${legacyDate}`,
                kind: hearingDateKind(legacyDate),
                date: legacyDate,
                trialStage: String(caseItem.trialStage || '').trim(),
                markAs: getHearingMarkAs(caseItem.trialStage)
            });
        }
        updateChargeDate();
        renderHearingRecords();
        updateHearingDateSnapshot();
    } catch (error) {
        console.error('Could not load hearing records:', error);
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'Saved hearing records could not be loaded.';
    }
}

function persistHearingRecords(caseId) {
    try {
        const saved = localStorage.getItem(HEARING_RECORD_STORAGE_KEY);
        const allCases = saved ? JSON.parse(saved) : {};
        if (!allCases || typeof allCases !== 'object' || Array.isArray(allCases)) {
            throw new Error('Saved hearing records have an invalid format.');
        }
        const previousCase = allCases[caseId] && typeof allCases[caseId] === 'object'
            ? allCases[caseId]
            : {};
        allCases[caseId] = {
            ...previousCase,
            dateRecords: hearingDateRecords.map(record => ({
                id: record.id,
                kind: record.kind,
                date: record.date,
                trialStage: record.trialStage,
                markAs: getHearingMarkAs(record.trialStage)
            }))
        };
        localStorage.setItem(HEARING_RECORD_STORAGE_KEY, JSON.stringify(allCases));
    } catch (error) {
        console.error('Could not save hearing records for Register Diary:', error);
        alert('The case was saved, but its hearing records could not be synced with Register Diary in this browser.');
    }
}

function renderNextDateStage() {
    if (!nextDateStageDate || !nextDateStageTrial || !nextDateValue || !trialStageValue) return;
    const savedDate = nextDateValue.value.trim();
    if (nextDateStageDate._flatpickr) {
        if (savedDate) nextDateStageDate._flatpickr.setDate(savedDate, false, 'd/m/Y');
        else nextDateStageDate._flatpickr.clear(false);
    } else {
        nextDateStageDate.value = savedDate;
    }
    setTrialStageSelectValue(nextDateStageTrial, trialStageValue.value.trim());
    updateHearingMarkAs(nextDateStageTrial.value);
}

function syncNextDateStage() {
    updateHearingDateSnapshot();
}

addHearingRecordButton?.addEventListener('click', () => {
    const dateKey = parseHearingDate(nextDateStageDate?.value);
    if (!dateKey) {
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'Select a valid hearing date first.';
        return;
    }
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const editedRecord = hearingDateRecords.find(record => record.id === editingHearingRecordId);
    const trialStage = String(nextDateStageTrial?.value || '').trim();
    if (!trialStage) {
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'Select a Trial Stage.';
        return;
    }
    const stageKey = normalizeTrialStage(trialStage).toLocaleLowerCase();
    const isTerminalStage = stageKey === 'committed' || stageKey === 'disposed';
    const currentCommitted = hearingDateRecords.some(record => normalizeTrialStage(record.trialStage).toLocaleLowerCase() === 'committed');
    if (currentCommitted && stageKey !== 'committed') {
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'A Committed proceeding cannot be changed to another Trial Stage.';
        return;
    }
    if (isTerminalStage && dateKey > todayKey) {
        if (hearingRecordStatus) hearingRecordStatus.textContent = `${trialStage} must be recorded on a hearing date that has arrived.`;
        return;
    }
    if (!isTerminalStage && dateKey === todayKey && editedRecord?.date !== dateKey) {
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'A next hearing date must be later than today.';
        return;
    }
    if (isTerminalStage && hearingDateRecords.some(record => record.date > todayKey && record.id !== editingHearingRecordId)) {
        if (hearingRecordStatus) hearingRecordStatus.textContent = 'Remove the next hearing date before recording a final Trial Stage.';
        return;
    }
    const id = editingHearingRecordId || `hearing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const updatedRecord = {
        id,
        kind: hearingDateKind(dateKey),
        date: dateKey,
        trialStage,
        markAs: getHearingMarkAs(trialStage)
    };
    hearingDateRecords = hearingDateRecords.filter(record =>
        record.id !== editingHearingRecordId
        && !(updatedRecord.kind === 'next' && record.kind === 'next')
        && record.date !== dateKey
    );
    hearingDateRecords.push(updatedRecord);
    editingHearingRecordId = null;
    if (addHearingRecordButton) addHearingRecordButton.textContent = 'Add Hearing';
    if (cancelHearingEditButton) cancelHearingEditButton.hidden = true;
    if (deleteHearingRecordButton) deleteHearingRecordButton.hidden = true;
    if (hearingRecordStatus) hearingRecordStatus.textContent = '';
    updateHearingDateSnapshot();
    renderHearingRecords();
});

cancelHearingEditButton?.addEventListener('click', cancelHearingRecordEdit);
deleteHearingRecordButton?.addEventListener('click', () => {
    const record = hearingDateRecords.find(item => item.id === editingHearingRecordId);
    if (!record) return;
    if (!window.confirm(`Delete hearing date ${formatHearingDate(record.date)}?`)) return;
    hearingDateRecords = hearingDateRecords.filter(item => item.id !== record.id);
    cancelHearingRecordEdit();
    updateHearingDateSnapshot();
    renderHearingRecords();
});

const caseRecordFieldIds = [
    'casestatus', 'courttype', 'regprefix', 'regnumber', 'regyear', 'regdate',
    'caseJudgeSelect', 'caseJudgeId', 'caseJudgeDisplayName', 'caseCourtNumber',
    'caseJudgeCourtType', 'caseJudgeName', 'courtnan', 'challandate', 'chargedate',
    'caseNextDateValue', 'caseTrialStageValue', 'ucrNumber', 'ucrSerial', 'ucrYear', 'report_type', 'ucr_dod'
];
const caseRecordLabels = {
    ucr: 'UCR Report',
    chargesheet: 'Chargesheet',
    lower: 'Lower Case Record',
    session: 'Session Case Record',
    jjb: 'JJB Case Record'
};
const caseRecordCourtTypes = {
    lower: 'Lower Court',
    session: 'Session Court',
    jjb: 'JJB'
};

function createCaseRecordDraft(type, caseItem = null) {
    const draft = {
        type,
        id: caseItem?.id || null,
        isPersisted: Boolean(caseItem?.id),
        createdAt: caseItem?.createdAt || null,
        collectionName: caseItem?._collectionName || LINKED_CASES_COLLECTION,
        policeStationId: caseItem?.policeStationId || '',
        policeStation: caseItem?.policeStation || '',
        firMasterId: caseItem?.firMasterId || caseItem?.firId || '',
        predecessorCaseId: caseItem?.predecessorCaseId || '',
        successorCaseId: caseItem?.successorCaseId || '',
        localId: caseItem?.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        courtTypeDrivesType: type === 'chargesheet',
        fields: {},
        courtFields: normalizeProceedingFields(caseItem || {}),
        hearingDateRecord: Array.isArray(caseItem?.hearingDateRecord) ? caseItem.hearingDateRecord : []
    };
    const firestoreFields = {
        casestatus: 'status',
        courttype: 'courtType',
        regprefix: 'regPrefix',
        regnumber: 'regNo',
        regyear: 'regYear',
        regdate: 'regDate',
        caseJudgeSelect: 'judgeId',
        caseJudgeId: 'judgeId',
        caseJudgeDisplayName: 'judgeDisplayName',
        caseCourtNumber: 'courtNumber',
        caseJudgeCourtType: 'judgeCourtType',
        caseJudgeName: 'judgeName',
        courtnan: 'courtName',
        challandate: 'challanDate',
        chargedate: 'chargeDate',
        caseNextDateValue: 'nextDate',
        caseTrialStageValue: 'trialStage',
        ucrNumber: 'ucrNumber',
        report_type: 'report_type',
        ucr_dod: 'ucr_dod'
    };
    caseRecordFieldIds.forEach(id => {
        const key = firestoreFields[id];
        const legacyKey = id === 'report_type' ? 'ucrType' : id === 'ucr_dod' ? 'ucrDisposedDate' : '';
        const value = caseItem && key ? (caseItem[key] ?? (legacyKey ? caseItem[legacyKey] : '')) : '';
        draft.fields[id] = String(value ?? '');
    });
    const ucrNumberParts = String(draft.fields.ucrNumber || '').trim().match(/^(?:UCR\/)?(\d+)\/(\d{4})$/i);
    if (ucrNumberParts) {
        draft.fields.ucrSerial = ucrNumberParts[1];
        draft.fields.ucrYear = ucrNumberParts[2];
    } else if (/^\d+$/.test(String(draft.fields.ucrNumber || '').trim())) {
        draft.fields.ucrSerial = String(draft.fields.ucrNumber).trim();
    }
    if (!caseItem) {
        draft.fields.casestatus = type === 'ucr' ? 'UCR' : 'UT';
        draft.fields.courttype = caseRecordCourtTypes[type] || '';
        draft.fields.regprefix = 'CHI';
    }
    draft.nonJjbRegPrefix = draft.fields.regprefix && draft.fields.regprefix.toUpperCase() !== 'JJB'
        ? draft.fields.regprefix
        : 'CHI';
    return draft;
}

function inferCaseRecordType(caseItem) {
    if (['ucr', 'lower', 'session', 'jjb'].includes(caseItem?.recordType)) return caseItem.recordType;
    if (['UCR', 'UNTRACE', 'UNTRACED', 'CANCELLATION', 'CANCELLED', 'CANCELED']
        .includes(String(caseItem?.status || '').trim().toUpperCase()) || caseItem?.ucrNumber) return 'ucr';
    const courtType = String(caseItem?.courtType || '').toLowerCase();
    if (courtType.includes('session')) return 'session';
    if (courtType.includes('jjb')) return 'jjb';
    return 'lower';
}

function setProceedingDate(input, value) {
    if (!input) return;
    if (input._flatpickr) {
        if (value) input._flatpickr.setDate(value, false, 'd/m/Y');
        else input._flatpickr.clear(false);
    } else {
        input.value = value || '';
    }
}

function applyProceedingFields(fields) {
    const values = normalizeProceedingFields(fields);
    caseIoSelectionTouched = false;
    applyCaseIoSnapshot(values, values.ioId);
    populateCaseIoOptions(values);

    const highlighted = form.elements.namedItem('highlightcase');
    if (highlighted) highlighted.checked = values.highlighted;

    const accusedContainer = document.getElementById('accusedContainer');
    if (accusedContainer) {
        let cards = [...accusedContainer.querySelectorAll('.accused-card')];
        const requiredCount = Math.max(values.accused.length, 1);
        while (cards.length > requiredCount) {
            cards.pop().remove();
        }
        while (cards.length < requiredCount) {
            addAccusedCard();
            cards = [...accusedContainer.querySelectorAll('.accused-card')];
        }
        cards.forEach((card, index) => {
            resetAccusedCard(card);
            const accused = values.accused[index];
            if (!accused) return;
            card.querySelector('input[name="accused_name[]"]').value = accused.name;
            card.querySelector('input[name="accused_father_name[]"]').value = accused.fatherName;
            card.querySelector('input[name="accused_mobile[]"]').value = accused.mobile;
            card.querySelector('textarea[name="accused_address[]"]').value = accused.address;
            const arrested = card.querySelector('input[name="arrested[]"]');
            const arrestDate = card.querySelector('input[name="arrestingdate[]"]');
            const custody = card.querySelector('select[name="custody_status[]"]');
            const bailDate = card.querySelector('input[name="baildate[]"]');
            arrested.checked = accused.arrested;
            arrestDate.disabled = !accused.arrested;
            custody.disabled = !accused.arrested;
            arrestDate.closest('.input-group')?.style.setProperty('display', accused.arrested ? '' : 'none');
            custody.closest('.input-group')?.style.setProperty('display', accused.arrested ? '' : 'none');
            setProceedingDate(arrestDate, accused.arrestDate);
            custody.value = accused.custodyStatus;
            const needsBailDate = accused.arrested
                && ['bailed_police', 'bailed_court'].includes(accused.custodyStatus);
            bailDate.disabled = !needsBailDate;
            bailDate.closest('.input-group')?.style.setProperty('display', needsBailDate ? '' : 'none');
            setProceedingDate(bailDate, accused.bailDate);
            const poStatus = card.querySelector('input[name="po_status[]"]');
            const poDate = card.querySelector('input[name="po_date[]"]');
            poStatus.checked = accused.poStatus;
            poDate.disabled = !accused.poStatus;
            poDate.closest('.input-group')?.style.setProperty('display', accused.poStatus ? '' : 'none');
            setProceedingDate(poDate, accused.poDate);
        });
    }

    const witnessContainer = document.getElementById('witnessTableBody');
    if (witnessContainer) {
        let rows = [...witnessContainer.querySelectorAll('tr')];
        const requiredCount = Math.max(values.witnesses.length, 1);
        while (rows.length > requiredCount) {
            rows.pop().remove();
        }
        while (rows.length < requiredCount) {
            addWitnessRow();
            rows = [...witnessContainer.querySelectorAll('tr')];
        }
        rows.forEach((row, index) => {
            resetWitnessRow(row);
            const witness = values.witnesses[index];
            if (!witness) return;
            row.querySelector('input[name="witness_name[]"]').value = witness.name;
            row.querySelector('select[name="witness_status[]"]').value = witness.status;
            const examined = row.querySelector('input[name="witness_examined[]"]');
            const examinedDate = row.querySelector('input[name="witness_examined_date[]"]');
            examined.checked = witness.examined;
            examinedDate.disabled = !witness.examined;
            setProceedingDate(examinedDate, witness.examinedDate);
        });
        updateWitnessCounts();
    }
}

function captureActiveCaseRecord() {
    const draft = caseRecordDrafts[activeCaseRecordIndex];
    if (!draft) return;
    if (draft.type !== 'ucr') syncNextDateStage();
    caseRecordFieldIds.forEach(id => {
        const field = document.getElementById(id);
        if (field) draft.fields[id] = field.value;
    });
    draft.courtFields = proceedingFieldsFromForm(form);
    if (draft.type === 'ucr') {
        const serial = String(draft.fields.ucrSerial || '').trim();
        const year = String(draft.fields.ucrYear || '').trim();
        draft.fields.ucrNumber = serial && year ? `UCR/${serial}/${year}` : '';
    }
    draft.hearingDateRecord = hearingDateRecords.map(record => ({ ...record }));
    refreshDerivedFirStatus();
    refreshUcrActionState();
}

function renderCaseRecordList() {
    if (!caseRecordList) return;
    caseRecordList.replaceChildren();
    caseRecordDrafts.forEach((draft, index) => {
        const item = document.createElement('div');
        item.className = 'case-record-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'case-record-select';
        button.textContent = `${index + 1}. ${caseRecordLabels[draft.type] || 'Case Record'}`;
        button.setAttribute('aria-pressed', String(index === activeCaseRecordIndex));
        button.addEventListener('click', () => activateCaseRecord(index));
        item.append(button);
        caseRecordList.append(item);
    });
    const activeDraft = caseRecordDrafts[activeCaseRecordIndex];
    if (caseRecordDetailTitle) {
        caseRecordDetailTitle.textContent = activeDraft
            ? `${caseRecordLabels[activeDraft.type] || 'Case Record'} Details`
            : 'Case Record Details';
    }
    const removeActiveButton = document.getElementById('removeActiveCaseRecord');
    if (removeActiveButton) removeActiveButton.hidden = !activeDraft;
    const commitButton = document.getElementById('commitToSessions');
    if (commitButton) {
        commitButton.hidden = !activeDraft || activeDraft.type !== 'lower' || !activeDraft.id
            || !selectedFirMasterId || Boolean(activeDraft.successorCaseId);
    }
    refreshUcrActionState();
}

async function removeCaseRecord(index) {
    const draft = caseRecordDrafts[index];
    if (!draft) return;
    if (activeCaseRecordIndex === index) captureActiveCaseRecord();
    if (draft.id) {
        const confirmed = window.confirm(`Remove this ${caseRecordLabels[draft.type] || 'case record'}? Only this proceeding will be deleted; its linked FIR Master and other proceedings will remain.`);
        if (!confirmed) return;
        caseRecordLoadSequence += 1;
        const removeButton = document.getElementById('removeActiveCaseRecord');
        if (removeButton) removeButton.disabled = true;
        try {
            const recordStationId = draft.policeStationId || selectedFirMasterData?.policeStationId || '';
            const recordStationName = String(draft.policeStation || selectedFirMasterData?.policeStation || '').trim();
            const assignedStation = await getAssignedPoliceStation(recordStationId);
            if (recordStationId
                ? recordStationId !== assignedStation.policeStationId
                : recordStationName.toLocaleLowerCase() !== assignedStation.policeStation.toLocaleLowerCase()) {
                throw new Error('This proceeding is not assigned to your police station. Contact the administrator before removing it.');
            }
            const counterpartId = draft.successorCaseId || draft.predecessorCaseId;
            if (counterpartId) {
                const linkedRecords = await loadRecordsForFir(db, selectedFirMasterId || draft.firMasterId || draft.firId);
                const counterpart = linkedRecords.find(record => record.id === counterpartId);
                if (counterpart) {
                    await updateDoc(doc(db, counterpart._collectionName || LINKED_CASES_COLLECTION, counterpart.id), {
                        ...(draft.successorCaseId ? { predecessorCaseId: '' } : { successorCaseId: '' }),
                        updatedAt: serverTimestamp()
                    });
                    const counterpartDraft = caseRecordDrafts.find(record => record.id === counterpart.id);
                    if (counterpartDraft) {
                        if (draft.successorCaseId) counterpartDraft.predecessorCaseId = '';
                        else counterpartDraft.successorCaseId = '';
                    }
                }
            }
            await deleteDoc(doc(db, draft.collectionName || 'cases', draft.id));
        } catch (error) {
            console.error('Could not remove case record:', error);
            if (caseRecordStatus) caseRecordStatus.textContent = error?.message || 'Could not remove the saved record. Please try again.';
            renderCaseRecordList();
            return;
        }
        try {
            const saved = localStorage.getItem(HEARING_RECORD_STORAGE_KEY);
            const allCases = saved ? JSON.parse(saved) : {};
            if (!allCases || typeof allCases !== 'object' || Array.isArray(allCases)) {
                throw new Error('Saved hearing records have an invalid format.');
            }
            delete allCases[draft.id];
            localStorage.setItem(HEARING_RECORD_STORAGE_KEY, JSON.stringify(allCases));
        } catch (error) {
            console.error('Could not remove deleted case hearing records from local storage:', error);
            if (caseRecordStatus) caseRecordStatus.textContent = 'Record removed, but old hearing data could not be cleaned up from this browser.';
        }
    }

    caseRecordDrafts.splice(index, 1);
    linkedFirStatusRecords = linkedFirStatusRecords.filter(record => record.id !== draft.id);
    if (draft.id && selectedFirMasterId) {
        try {
            const remainingRecords = await loadRecordsForFir(db, selectedFirMasterId);
            linkedFirStatusRecords = remainingRecords;
            const status = deriveFirStatus(selectedFirMasterData || {}, remainingRecords);
            await updateDoc(doc(db, 'firMasters', selectedFirMasterId), { firStatus: status, updatedAt: serverTimestamp() });
            selectedFirMasterData = { ...selectedFirMasterData, firStatus: status };
        } catch (error) {
            console.error('Could not refresh FIR status after proceeding deletion:', error);
            if (caseRecordStatus) caseRecordStatus.textContent = 'Proceeding removed, but FIR Status could not be refreshed. Retry saving or ask an administrator to review it.';
        }
    }
    refreshDerivedFirStatus();
    if (draft.id) window.dispatchEvent(new CustomEvent('caseAdded'));
    if (caseRecordDrafts.length === 0) {
        activeCaseRecordIndex = -1;
        if (caseRecordDetails) caseRecordDetails.hidden = true;
        renderCaseRecordList();
        if (caseRecordStatus) caseRecordStatus.textContent = 'Proceeding removed. Save to keep the FIR Master without a proceeding, or add another record.';
        return;
    }
    const nextIndex = index < activeCaseRecordIndex
        ? activeCaseRecordIndex - 1
        : Math.min(index, caseRecordDrafts.length - 1);
    activateCaseRecord(nextIndex, false);
}

function setCaseRecordEditorVisibility(draft) {
    const isUcr = draft?.type === 'ucr';
    const isMasterOnly = !draft;
    const statusSection = document.querySelector('.case-section-status');
    const courtStatusSection = document.getElementById('sectionCourtStatus');
    const courtSection = document.getElementById('sectionCourtReg');
    const hearingSection = document.getElementById('sectionNextDate');
    const ucrSection = document.getElementById('ucrRecordFields');
    const statusSelect = document.getElementById('casestatus');
    const courtTypeSelect = document.getElementById('courttype');
    const accusedSection = document.getElementById('sectionAccused');
    const witnessSection = document.getElementById('sectionWitness');

    if (statusSection) statusSection.hidden = isUcr || isMasterOnly;
    if (courtStatusSection) courtStatusSection.hidden = isUcr || isMasterOnly;
    if (courtSection) courtSection.hidden = isUcr || isMasterOnly;
    if (hearingSection) hearingSection.hidden = isUcr || isMasterOnly;
    if (ucrSection) ucrSection.hidden = !isUcr;
    if (accusedSection) accusedSection.hidden = isUcr || isMasterOnly;
    if (witnessSection) witnessSection.hidden = isUcr || isMasterOnly;
    if (statusSelect) statusSelect.disabled = isUcr || isMasterOnly;
    if (courtTypeSelect) {
        courtTypeSelect.disabled = isUcr || isMasterOnly;
        courtTypeSelect.required = !isUcr && !isMasterOnly;
    }
    ['ucrNumber', 'ucrSerial', 'ucrYear', 'report_type', 'ucr_dod'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.disabled = !isUcr;
        field.required = isUcr && ['ucrSerial', 'ucrYear', 'report_type', 'ucr_dod'].includes(id);
    });
}

async function loadLinkedCaseRecords(caseItem, loadSequence) {
    const firLinkId = caseItem?.firMasterId || caseItem?.firId;
    if (!firLinkId) return;
    try {
        const linkedRecords = await loadRecordsForFir(db, firLinkId);
        if (loadSequence !== caseRecordLoadSequence || form.dataset.editId !== caseItem.id) return;
        linkedFirStatusRecords = linkedRecords;
        if (!editingFirMaster && linkedRecords.length < 2) return;

        captureActiveCaseRecord();
        const currentDraftsById = new Map(
            caseRecordDrafts.filter(record => record.id).map(record => [`${record.collectionName}:${record.id}`, record])
        );
        const localDrafts = caseRecordDrafts.filter(record => !record.id);
        const activeLocalId = caseRecordDrafts[activeCaseRecordIndex]?.id
            ? null
            : caseRecordDrafts[activeCaseRecordIndex]?.localId;
        const loadedDrafts = linkedRecords.map(record => {
            const loadedDraft = createCaseRecordDraft(inferCaseRecordType(record), record);
            const currentDraft = currentDraftsById.get(`${record._collectionName}:${record.id}`);
            if (!currentDraft) return loadedDraft;
            loadedDraft.fields = { ...loadedDraft.fields, ...currentDraft.fields };
            loadedDraft.courtFields = normalizeProceedingFields(currentDraft.courtFields);
            loadedDraft.hearingDateRecord = currentDraft.hearingDateRecord.map(hearing => ({ ...hearing }));
            return loadedDraft;
        });
        caseRecordDrafts.splice(
            0,
            caseRecordDrafts.length,
            ...loadedDrafts,
            ...localDrafts
        );
        const selectedIndex = activeLocalId
            ? caseRecordDrafts.findIndex(record => record.localId === activeLocalId)
            : caseRecordDrafts.findIndex(record => record.id === caseItem.id
                && record.collectionName === (caseItem._collectionName || 'cases'));
        activeCaseRecordIndex = selectedIndex >= 0 ? selectedIndex : 0;
        renderCaseRecordList();
        if (activeCaseRecordIndex >= 0) activateCaseRecord(activeCaseRecordIndex, false);
        refreshDerivedFirStatus();
    } catch (error) {
        console.error('Could not load linked case records:', error);
        if (loadSequence === caseRecordLoadSequence && caseRecordStatus) {
            caseRecordStatus.textContent = 'Could not load all linked records. Reopen the form to retry.';
        }
    }
}

function activateCaseRecord(index, capture = true) {
    if (capture && activeCaseRecordIndex >= 0) captureActiveCaseRecord();
    const draft = caseRecordDrafts[index];
    if (!draft) return;
    activeCaseRecordIndex = index;
    if (caseRecordDetails) caseRecordDetails.hidden = false;

    caseRecordFieldIds.forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        const value = draft.fields[id] || '';
        if (field._flatpickr) {
            if (value) field._flatpickr.setDate(value, false, 'd/m/Y');
            else field._flatpickr.clear(false);
        } else {
            field.value = value;
        }
    });
    applyProceedingFields(draft.courtFields);

    const courtTypeSelect = document.getElementById('courttype');
    if (draft.type !== 'ucr' && caseRecordCourtTypes[draft.type] && !draft.id) {
        courtTypeSelect.value = caseRecordCourtTypes[draft.type];
    }
    courtTypeSelect?.dispatchEvent(new Event('change', { bubbles: true }));
    const judgeSelect = document.getElementById('caseJudgeSelect');
    if (judgeSelect && draft.fields.caseJudgeSelect) {
        populateCaseJudgeOptions(draft.fields.caseJudgeSelect);
    }
    ['caseJudgeId', 'caseJudgeDisplayName', 'caseCourtNumber', 'caseJudgeCourtType', 'caseJudgeName', 'courtnan']
        .forEach(id => {
            const field = document.getElementById(id);
            if (field) field.value = draft.fields[id] || '';
        });

    setCaseRecordEditorVisibility(draft);
    if (draft.type === 'ucr') {
        resetHearingRecords();
    } else {
        loadHearingRecords({
            id: draft.id || draft.localId,
            hearingDateRecord: draft.hearingDateRecord
        });
        updateHearingDateSnapshot();
    }
    updateCaseStatusFields();
    refreshDerivedFirStatus();
    if (caseRecordStatus) caseRecordStatus.textContent = '';
    renderCaseRecordList();
}

const policeReportMenu = document.getElementById('policeReportMenu');
const policeReportKinds = document.getElementById('policeReportKinds');
const addPoliceReportButton = document.getElementById('addPoliceReport');

function closePoliceReportMenu() {
    if (!policeReportMenu) return;
    policeReportMenu.hidden = true;
    addPoliceReportButton?.setAttribute('aria-expanded', 'false');
}

addPoliceReportButton?.addEventListener('click', () => {
    const opening = policeReportMenu?.hidden === true;
    if (opening) {
        policeReportMenu.hidden = false;
        addPoliceReportButton.setAttribute('aria-expanded', 'true');
        policeReportKinds.querySelector('button:not(:disabled)')?.focus();
    } else {
        closePoliceReportMenu();
    }
});

document.getElementById('chooseChargesheet')?.addEventListener('click', () => {
    if (activeCaseRecordIndex >= 0) captureActiveCaseRecord();
    closePoliceReportMenu();
    caseRecordDrafts.push(createCaseRecordDraft('chargesheet'));
    activateCaseRecord(caseRecordDrafts.length - 1, false);
});

document.addEventListener('click', event => {
    if (!event.target.closest('.case-record-menu-host')) closePoliceReportMenu();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && policeReportMenu && !policeReportMenu.hidden) {
        closePoliceReportMenu();
        addPoliceReportButton?.focus();
    }
});

document.querySelectorAll('[data-add-case-record]').forEach(button => {
    button.addEventListener('click', async () => {
        if (activeCaseRecordIndex >= 0) captureActiveCaseRecord();
        const type = button.dataset.addCaseRecord;
        if (type === 'ucr') {
            const currentRecords = selectedFirMasterId
                ? await loadRecordsForFir(db, selectedFirMasterId).catch(() => linkedFirStatusRecords)
                : linkedFirStatusRecords;
            const courtExists = caseRecordDrafts.some(record => record.type !== 'ucr')
                || currentRecords.some(record => record.recordType !== 'ucr' && !record.ucrNumber
                    && !['ucr', 'untrace', 'untraced', 'cancelled', 'cancellation'].includes(String(record.status || '').toLowerCase()));
            if (caseRecordDrafts.some(record => record.type === 'ucr') || courtExists) {
                if (caseRecordStatus) caseRecordStatus.textContent = courtExists
                    ? 'A UCR report cannot be added after a court proceeding exists.'
                    : 'This FIR already has its single UCR report.';
                refreshUcrActionState();
                return;
            }
        }
        closePoliceReportMenu();
        caseRecordDrafts.push(createCaseRecordDraft(type));
        activateCaseRecord(caseRecordDrafts.length - 1, false);
    });
});

function setFirMasterEditingMode(editing) {
    if (editing && caseRecordDetails) caseRecordDetails.hidden = true;
    const deleteButton = document.getElementById('deleteFirMaster');
    if (deleteButton) deleteButton.hidden = !editing;
}

function setFirMasterFieldsLocked(locked) {
    const alwaysReadOnly = new Set(['firdate', 'firyear', 'policestation', 'incident_date']);
    ['firno', 'firdate', 'firyear', 'undersection', 'crimehead', 'policestation', 'incident_date',
        'incident_place', 'beatDetails', 'complainant_name', 'complainant_father_name', 'complainant_mobile', 'complainant_address']
        .forEach(name => {
            const field = form.elements.namedItem(name);
            if (field) field.readOnly = locked || alwaysReadOnly.has(name);
        });
    const status = document.getElementById('fir_Status');
    if (status) status.readOnly = true;
}

async function linkLegacyFirGroup(group, existingMaster = null) {
    const description = group.records.map(record =>
        `${record.courtType || 'Court'} ${record.regNo || record.courtNumber || ''} (${record.status || 'status unknown'})`
    ).join('\n');
    const confirmed = window.confirm(
        `Verify this legacy FIR before linking ${group.records.length} existing record(s):\n\n`
        + `FIR ${group.firNo}/${group.firYear} · ${group.policeStation}\n${description}\n\n`
        + 'This adds a FIR Master link and preserves every existing document ID and hearing history.'
    );
    if (!confirmed) return null;
    let firMasterId = existingMaster?.id || '';
    if (!firMasterId) {
        firMasterId = await saveFirMaster(db, { ...group, firStatus: deriveFirStatus(group, group.records) }, '', { allowLegacyMatch: true });
    }
    const masterFields = existingMaster || group;
    const initialStatus = deriveFirStatus(existingMaster || group, group.records);
    for (let start = 0; start < group.records.length; start += 450) {
        const batch = writeBatch(db);
        group.records.slice(start, start + 450).forEach(record => {
            batch.update(doc(db, 'cases', record.id), {
                firMasterId,
                fileNo: group.fileNo,
                firNo: masterFields.firNo || record.firNo || '',
                firYear: masterFields.firYear || record.firYear || '',
                firDate: masterFields.firDate || record.firDate || '',
                policeStation: masterFields.policeStation || record.policeStation || '',
                policeStationId: masterFields.policeStationId || group.policeStationId || record.policeStationId || '',
                underSection: masterFields.underSection || record.underSection || '',
                crimeHead: masterFields.crimeHead || record.crimeHead || '',
                incidentDate: masterFields.incidentDate || record.incidentDate || '',
                incidentPlace: masterFields.incidentPlace || record.incidentPlace || '',
                beatDetails: masterFields.beatDetails || record.beatDetails || '',
                complainantName: masterFields.complainantName || record.complainantName || '',
                complainantFatherName: masterFields.complainantFatherName || record.complainantFatherName || '',
                complainantMobile: masterFields.complainantMobile || record.complainantMobile || '',
                complainantAddress: masterFields.complainantAddress || record.complainantAddress || '',
                legacyFirId: group.legacyFirId || record.firId || '',
                firId: firMasterId,
                firStatus: initialStatus,
                updatedAt: serverTimestamp()
            });
        });
        await batch.commit();
    }
    const linkedRecords = await loadRecordsForFir(db, firMasterId);
    const status = deriveFirStatus(existingMaster || group, linkedRecords);
    await updateDoc(doc(db, 'firMasters', firMasterId), {
        fileNo: group.fileNo,
        firStatus: status,
        updatedAt: serverTimestamp()
    });
    for (let start = 0; start < group.records.length; start += 450) {
        const batch = writeBatch(db);
        group.records.slice(start, start + 450).forEach(record => {
            batch.update(doc(db, 'cases', record.id), { firStatus: status, updatedAt: serverTimestamp() });
        });
        await batch.commit();
    }
    window.dispatchEvent(new CustomEvent('caseAdded'));
    return {
        ...(existingMaster || group),
        id: firMasterId,
        fileNo: group.fileNo,
        firStatus: status
    };
}

document.getElementById('removeActiveCaseRecord')?.addEventListener('click', () => {
    if (activeCaseRecordIndex >= 0) void removeCaseRecord(activeCaseRecordIndex);
});

document.getElementById('deleteFirMaster')?.addEventListener('click', async event => {
    if (!editingFirMaster || !selectedFirMasterId) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const linkedRecords = await loadRecordsForFir(db, selectedFirMasterId);
        if (linkedRecords.length) {
            if (caseRecordStatus) caseRecordStatus.textContent = 'This FIR Master has linked court proceedings or a UCR report. Remove those records before deleting the master.';
            return;
        }
        const firNo = String(selectedFirMasterData?.firNo || document.getElementById('firno')?.value || '—');
        const firYear = String(selectedFirMasterData?.firYear || document.getElementById('firyear')?.value || '—');
        const station = String(selectedFirMasterData?.policeStation || document.getElementById('policestation')?.value || '—');
        if (!window.confirm(`Delete this FIR Master?\n\nFIR Number: ${firNo}\nFIR Year: ${firYear}\nPolice Station: ${station}\n\nThis action cannot be undone.`)) return;
        const assignedStation = await getAssignedPoliceStation(selectedFirMasterData?.policeStationId || '');
        if (selectedFirMasterData?.policeStationId
            ? selectedFirMasterData.policeStationId !== assignedStation.policeStationId
            : station.trim().toLocaleLowerCase() !== assignedStation.policeStation.toLocaleLowerCase()) {
            throw new Error('This FIR Master is not assigned to your police station. Contact the administrator before deleting it.');
        }
        await deleteDoc(doc(db, 'firMasters', selectedFirMasterId));
        window.dispatchEvent(new CustomEvent('caseAdded'));
        closeModal();
    } catch (error) {
        console.error('Could not delete FIR Master:', error);
        if (caseRecordStatus) caseRecordStatus.textContent = error?.message || 'The FIR Master could not be deleted. Check your access and try again.';
    } finally {
        button.disabled = false;
    }
});

document.getElementById('commitToSessions')?.addEventListener('click', () => {
    if (activeCaseRecordIndex < 0) return;
    captureActiveCaseRecord();
    const source = caseRecordDrafts[activeCaseRecordIndex];
    if (!source?.id || source.type !== 'lower' || !selectedFirMasterId || source.successorCaseId) return;
    source.fields.casestatus = 'Committed';
    source.fields.caseTrialStageValue = 'Committed';
    const successor = createCaseRecordDraft('session');
    successor.predecessorCaseId = source.id;
    successor.collectionName = LINKED_CASES_COLLECTION;
    successor.fields.casestatus = 'UT';
    successor.fields.courttype = 'Session Court';
    caseRecordDrafts.push(successor);
    activateCaseRecord(caseRecordDrafts.length - 1, false);
    if (caseRecordStatus) caseRecordStatus.textContent = 'Sessions Court successor added. Complete its registration details and save both records.';
});

window.openAddCaseModal = (caseItem = null) => {
    resetForm();

    const title = document.getElementById('modalTitle');
    if (title) title.textContent = caseItem ? 'Edit Case' : 'Add New Case';
    const stateLabel = document.getElementById('caseModalStateLabel');
    if (stateLabel) stateLabel.textContent = caseItem ? 'EDITING CASE' : 'NEW CASE';
    document.getElementById('caseModalState')?.classList.toggle('is-editing', Boolean(caseItem));
    editingFirMaster = caseItem?.recordType === 'fir_master' || caseItem?._collectionName === 'firMasters';
    setFirMasterEditingMode(editingFirMaster);
    selectedFirMasterId = editingFirMaster
        ? caseItem.id
        : (caseItem?._collectionName === LINKED_CASES_COLLECTION ? (caseItem.firMasterId || caseItem.firId || '') : (caseItem?.firMasterId || ''));
    if (selectedFirMasterId && caseItem) {
        selectedFirMasterData = { ...caseItem };
        if (!editingFirMaster) setFirMasterFieldsLocked(true);
    }
    if (caseItem && caseItem.id) {
        form.dataset.editId = caseItem.id;

        // Map Firestore to Form Fields
        const mapping = {
            status: 'casestatus',
            fileNo: 'fileNo',
            firStatus: 'fir_Status',
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
            courtNumber: 'courtNumber',
            judgeCourtType: 'judgeCourtType',
            judgeName: 'judgeName',
            judgeId: 'judgeId',
            judgeDisplayName: 'judgeDisplayName',
            challanDate: 'challandate',
            chargeDate: 'chargedate',
            nextDate: 'nextdate',
            trialStage: 'trial_stage',
            ioId: 'ioId',
            ioRank: 'iorank',
            ioName: 'ioname',
            ioBeltno: 'ioBeltno',
            iomobileNo: 'iomobileNo',
            incidentDate: 'incident_date',
            incidentPlace: 'incident_place',
            beatDetails: 'beatDetails',
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
        updateFileNo();
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
    if (caseItem && !editingFirMaster) {
        caseRecordDrafts.push(createCaseRecordDraft(inferCaseRecordType(caseItem), caseItem));
        activeCaseRecordIndex = 0;
        if (caseRecordDetails) caseRecordDetails.hidden = false;
    }
    loadHearingRecords(caseItem);
    renderNextDateStage();
    if (caseItem && !editingFirMaster) {
        caseRecordDrafts[0].hearingDateRecord = hearingDateRecords.map(record => ({ ...record }));
        setCaseRecordEditorVisibility(caseRecordDrafts[0]);
    } else if (editingFirMaster) {
        setCaseRecordEditorVisibility(null);
    }
    renderCaseRecordList();

    const policeStationInput = document.getElementById('policestation');
    const stationLoadId = ++policeStationLoadSequence;
    if (policeStationInput && !caseItem) policeStationInput.value = 'OSM';
    void preparePoliceStationSelector(caseItem).then(() => {
        if (stationLoadId !== policeStationLoadSequence || !modal.classList.contains('show')) return;
    }).catch(error => {
        if (stationLoadId !== policeStationLoadSequence || !modal.classList.contains('show')) return;
        if (caseRecordStatus) caseRecordStatus.textContent = error.message;
    });

    const loadId = ++judgeLoadSequence;
    void loadCaseJudges(caseItem, loadId);
    const ioLoadId = ++ioLoadSequence;
    subscribeCaseIOs(caseItem, ioLoadId);
    const caseRecordLoadId = ++caseRecordLoadSequence;
    if (caseItem && selectedFirMasterId) void loadLinkedCaseRecords(caseItem, caseRecordLoadId);
    if (selectedFirMasterId) void loadDerivedFirStatusForMaster(selectedFirMasterId);
    else refreshDerivedFirStatus();
    updateCaseStatusFields();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    masterComboboxes.forEach(({ close }) => close());
    ioLoadSequence += 1;
    if (stopIoListener) {
        stopIoListener();
        stopIoListener = null;
    }
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
const firNumber = document.getElementById('firno');
const fileNoInput = document.getElementById('fileNo');

function updateFileNo() {
    if (!fileNoInput) return;
    const number = String(firNumber?.value || '').trim();
    const year = String(firYear?.value || '').trim();
    fileNoInput.value = number && year.length >= 2 ? `${number}/${year.slice(-2)}` : '';
}

function updateFirYear() {
    if (!firDate || !firYear) return;
    if (!firDate.value) {
        firYear.value = '';
        updateFileNo();
        return;
    }

    let year = '';
    if (firDate._flatpickr && firDate._flatpickr.selectedDates.length > 0) {
        year = String(firDate._flatpickr.selectedDates[0].getFullYear());
    } else {
        const isoDate = firDate.value.match(/^(\d{4})-\d{2}-\d{2}$/);
        const legacyDate = firDate.value.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
        year = isoDate?.[1] || legacyDate?.[1] || '';
    }

    if (year) {
        firYear.value = year;
        clearRequiredFieldError(firYear);
    }
    updateFileNo();
}

firDate?.addEventListener('change', updateFirYear);
firNumber?.addEventListener('input', updateFileNo);
firYear?.addEventListener('input', updateFileNo);

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

function getValidationContainer(field) {
    return field.closest('.input-group, .top-field') || field.parentElement;
}

function setRequiredFieldError(field, isInvalid) {
    const container = getValidationContainer(field);
    const label = container?.querySelector(':scope > label');

    field.classList.toggle('validation-error', isInvalid);
    field.setAttribute('aria-invalid', String(isInvalid));
    container?.classList.toggle('validation-error', isInvalid);
    label?.classList.toggle('validation-error', isInvalid);
}

function validateRequiredFields() {
    const requiredFields = Array.from(form.querySelectorAll('[required]'))
        .filter(field => !field.disabled);
    let firstInvalidField = null;

    requiredFields.forEach(field => {
        const isInvalid = String(field.value || '').trim() === '';
        setRequiredFieldError(field, isInvalid);
        if (isInvalid && !firstInvalidField) firstInvalidField = field;
    });

    if (firstInvalidField) {
        firstInvalidField.focus();
        return false;
    }

    return true;
}

function clearRequiredFieldError(field) {
    if (String(field.value || '').trim() !== '') {
        setRequiredFieldError(field, false);
    }
}

form?.addEventListener('input', event => {
    const field = event.target.closest('[required]');
    if (field && form.contains(field)) clearRequiredFieldError(field);
});

form?.addEventListener('change', event => {
    const field = event.target.closest('[required]');
    if (field && form.contains(field)) clearRequiredFieldError(field);
    if (caseRecordFieldIds.includes(event.target.id) && activeCaseRecordIndex >= 0) {
        captureActiveCaseRecord();
    }
});

form?.addEventListener('input', event => {
    if (caseRecordFieldIds.includes(event.target.id) && activeCaseRecordIndex >= 0) {
        captureActiveCaseRecord();
    }
});

form?.addEventListener('reset', () => {
    form.querySelectorAll('.validation-error').forEach(element => {
        element.classList.remove('validation-error');
        if (element.matches('[required]')) element.setAttribute('aria-invalid', 'false');
    });
});

form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (activeCaseRecordIndex >= 0) captureActiveCaseRecord();
    if (editingFirMaster && selectedFirMasterId) {
        try {
            const linkedRecords = await loadRecordsForFir(db, selectedFirMasterId);
            linkedFirStatusRecords = linkedRecords;
            const loadedKeys = new Set(caseRecordDrafts.filter(record => record.id)
                .map(record => `${record.collectionName}:${record.id}`));
            linkedRecords.forEach(linkedRecord => {
                const key = `${linkedRecord._collectionName}:${linkedRecord.id}`;
                if (!loadedKeys.has(key)) caseRecordDrafts.push(createCaseRecordDraft(inferCaseRecordType(linkedRecord), linkedRecord));
            });
            refreshUcrActionState();
        } catch (error) {
            if (caseRecordStatus) caseRecordStatus.textContent = 'Linked proceedings and UCR could not be loaded, so the FIR Master was not saved. Reopen the modal and retry.';
            return;
        }
    }
    if (selectedFirMasterId && !editingFirMaster && !caseRecordDrafts.length) {
        if (caseRecordStatus) caseRecordStatus.textContent = 'Add a proceeding before saving changes to the selected FIR.';
        document.querySelector('.case-record-options')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    for (const [index, record] of caseRecordDrafts.entries()) {
        const fields = record.fields;
        if (record.type === 'ucr') {
            const missingUcrField = ['ucrSerial', 'ucrYear', 'report_type', 'ucr_dod']
                .find(id => !String(fields[id] || '').trim());
            if (missingUcrField) {
                activateCaseRecord(index, false);
                if (caseRecordStatus) caseRecordStatus.textContent = `Complete UCR details for record ${index + 1}.`;
                document.getElementById(missingUcrField)?.focus();
                return;
            }
            if (!/^\d{4}$/.test(String(fields.ucrYear || '').trim())) {
                activateCaseRecord(index, false);
                if (caseRecordStatus) caseRecordStatus.textContent = `Enter a four-digit UCR year for record ${index + 1}.`;
                document.getElementById('ucrYear')?.focus();
                return;
            }
        } else if (!String(fields.casestatus || '').trim() || !String(fields.courttype || '').trim()) {
            activateCaseRecord(index, false);
            if (caseRecordStatus) caseRecordStatus.textContent = `Complete case status and court type for record ${index + 1}.`;
            return;
        }
    }
    if (!validateRequiredFields()) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
        const formData = new FormData(form);
        captureActiveCaseRecord();
        const rawData = Object.fromEntries(formData.entries());
        const assignedStation = await getAssignedPoliceStation(document.getElementById('policeStationId')?.value || '');
        if (selectedFirMasterData?.policeStationId
            && selectedFirMasterData.policeStationId !== assignedStation.policeStationId) {
            throw new Error('This FIR belongs to a different police station. Ask the administrator to assign the correct station before editing it.');
        }
        if (selectedFirMasterData && !selectedFirMasterData.policeStationId
            && String(selectedFirMasterData.policeStation || '').trim().toLocaleLowerCase() !== assignedStation.policeStation.toLocaleLowerCase()) {
            throw new Error('This FIR has no verifiable police-station ID. Ask the administrator to reconcile its station before editing it.');
        }
        // Ensure firYear is recalculated
        const computedFirYear = (rawData.firdate) ? (rawData.firdate.split('/')[2] || '') : '';

        // Map Form to Firestore Schema
        const enteredMasterData = {
            firNo: String(rawData.firno || '').trim(),
            firYear: String(computedFirYear || rawData.firyear || '').trim(),
            fileNo: String(rawData.fileNo || '').trim(),
            firDate: String(rawData.firdate || '').trim(),
            firStatus: String(document.getElementById('fir_Status')?.value || 'Under Investigation').trim(),
            underSection: String(rawData.undersection || '').trim(),
            crimeHead: String(rawData.crimehead || '').trim(),
            policeStation: assignedStation.policeStation,
            policeStationId: assignedStation.policeStationId,
            incidentDate: String(rawData.incident_date || '').trim(),
            incidentPlace: String(rawData.incident_place || '').trim(),
            beatDetails: String(rawData.beatDetails || '').trim(),
            complainantName: String(rawData.complainant_name || '').trim(),
            complainantFatherName: String(rawData.complainant_father_name || '').trim(),
            complainantMobile: String(rawData.complainant_mobile || '').trim(),
            complainantAddress: String(rawData.complainant_address || '').trim()
        };
        let masterData = selectedFirMasterId && !editingFirMaster
            ? { ...selectedFirMasterData, fileNo: String(rawData.fileNo || '').trim() }
            : enteredMasterData;
        const ucrDrafts = caseRecordDrafts.filter(record => record.type === 'ucr');
        if (ucrDrafts.length > 1) throw new Error('Only one UCR report can be linked to an FIR. Remove the duplicate draft before saving.');
        const existingRecords = selectedFirMasterId ? await loadRecordsForFir(db, selectedFirMasterId) : [];
        const existingCourtProceedings = existingRecords.filter(record => record.recordType !== 'ucr' && !record.ucrNumber
            && !['ucr', 'untrace', 'untraced', 'cancelled', 'cancellation'].includes(String(record.status || '').toLowerCase()));
        const addingUcr = ucrDrafts.some(record => !record.id);
        if (addingUcr && existingCourtProceedings.length) {
            throw new Error('A UCR report cannot be added after a court proceeding already exists.');
        }

        let isEditingLegacyRecord = Boolean(form.dataset.editId && !selectedFirMasterId && !editingFirMaster);
        let firMasterId = selectedFirMasterId;
        let createdFirMasterInThisAttempt = false;
        const hasNewProceedingDraft = caseRecordDrafts.some(record => !record.id);
        if (!firMasterId && (!isEditingLegacyRecord || hasNewProceedingDraft)) {
            const identity = {
                firNo: enteredMasterData.firNo,
                firYear: enteredMasterData.firYear,
                policeStation: enteredMasterData.policeStation,
                policeStationId: enteredMasterData.policeStationId
            };
            const [matches, legacyGroups] = await Promise.all([
                findFirMasterMatches(db, identity),
                findLegacyFirGroups(db, identity)
            ]);
            if (matches.length > 1) {
                throw new Error('More than one FIR Master has this FIR number, year and police station. Resolve the duplicate records before saving.');
            }
            if (legacyGroups.length > 1) {
                throw new Error('More than one unlinked legacy FIR group matches these details. Resolve the legacy records before saving.');
            }

            let matchedMaster = matches[0] || null;
            if (addingUcr && legacyGroups.length === 1 && legacyGroups[0].records.some(record => inferCaseRecordType(record) !== 'ucr')) {
                throw new Error('A UCR report cannot be added after a court proceeding already exists in the matching legacy FIR.');
            }
            if (addingUcr && legacyGroups.length === 1 && legacyGroups[0].records.some(record => inferCaseRecordType(record) === 'ucr')) {
                throw new Error('The matching legacy FIR already has a UCR report. Link and edit that report instead.');
            }
            if (addingUcr && matchedMaster) {
                const candidateRecords = await loadRecordsForFir(db, matchedMaster.id);
                const hasCourtProceeding = candidateRecords.some(record => inferCaseRecordType(record) !== 'ucr');
                const hasUcr = candidateRecords.some(record => inferCaseRecordType(record) === 'ucr');
                if (hasCourtProceeding) throw new Error('A UCR report cannot be added after a court proceeding already exists.');
                if (hasUcr) throw new Error('This FIR already has its single UCR report. Edit the saved report instead.');
            }
            if (legacyGroups.length === 1) {
                const linkedExistingMaster = Boolean(matchedMaster);
                matchedMaster = await linkLegacyFirGroup({
                    ...legacyGroups[0],
                    policeStation: assignedStation.policeStation,
                    policeStationId: assignedStation.policeStationId
                }, matchedMaster);
                if (!matchedMaster) return;
                createdFirMasterInThisAttempt = !linkedExistingMaster;
            } else if (matchedMaster) {
                if (!caseRecordDrafts.length) {
                    const shouldOpenMaster = window.confirm(
                        `An FIR Master already exists for FIR ${matchedMaster.firNo}/${matchedMaster.firYear} · ${matchedMaster.policeStation}.\n\nOpen that FIR Master instead of creating a duplicate?`
                    );
                    if (shouldOpenMaster) window.openAddCaseModal({ ...matchedMaster, id: matchedMaster.id, recordType: 'fir_master', _collectionName: 'firMasters' });
                    return;
                }
                const confirmed = window.confirm(
                    `An FIR Master already exists for FIR ${matchedMaster.firNo}/${matchedMaster.firYear} · ${matchedMaster.policeStation}.\n\n`
                    + 'Add these proceeding records to that FIR? Existing FIR Master details will be retained.'
                );
                if (!confirmed) return;
                masterData = { ...matchedMaster, fileNo: String(rawData.fileNo || matchedMaster.fileNo || '').trim() };
            }

            if (matchedMaster) {
                firMasterId = matchedMaster.id;
                isEditingLegacyRecord = false;
            } else if (!isEditingLegacyRecord) {
                firMasterId = await saveFirMaster(db, masterData);
                createdFirMasterInThisAttempt = true;
            }
        } else if (editingFirMaster && firMasterId) {
            firMasterId = await saveFirMaster(db, enteredMasterData, firMasterId);
        }
        if (firMasterId && !isEditingLegacyRecord && !selectedFirMasterId) {
            selectedFirMasterId = firMasterId;
            selectedFirMasterData = { ...masterData, id: firMasterId };
            if (createdFirMasterInThisAttempt) {
                editingFirMaster = true;
                setFirMasterEditingMode(true);
            }
        }
        await persistMasterValue('crimeHead', String(rawData.crimehead || ''));
        const masterFieldsToPropagate = {
            firNo: masterData.firNo || '',
            firYear: masterData.firYear || '',
            firDate: masterData.firDate || '',
            policeStation: masterData.policeStation || assignedStation.policeStation,
            policeStationId: masterData.policeStationId || assignedStation.policeStationId,
            underSection: masterData.underSection || '',
            crimeHead: masterData.crimeHead || '',
            incidentDate: masterData.incidentDate || '',
            incidentPlace: masterData.incidentPlace || '',
            beatDetails: masterData.beatDetails || '',
            complainantName: masterData.complainantName || '',
            complainantFatherName: masterData.complainantFatherName || '',
            complainantMobile: masterData.complainantMobile || '',
            complainantAddress: masterData.complainantAddress || ''
        };
        const linkedCasesCollection = collection(db, LINKED_CASES_COLLECTION);
        const saveFailures = [];
        for (const [recordIndex, record] of caseRecordDrafts.entries()) {
          try {
            const fields = record.fields;
            const recordHearings = record.hearingDateRecord.map(hearing => ({ ...hearing }));
            const proceedingFields = proceedingPayload(masterFieldsToPropagate, record.courtFields);
            const legacyProceedingFields = proceedingPayload({
                ...masterFieldsToPropagate,
                ...masterData,
                fileNo: String(rawData.fileNo || '').trim()
            }, record.courtFields);
            const caseData = {
                ...(record.collectionName === 'cases' ? legacyProceedingFields : proceedingFields),
                fileNo: String(rawData.fileNo || '').trim(),
                predecessorCaseId: record.predecessorCaseId || '',
                successorCaseId: record.successorCaseId || '',
                recordType: record.type,
                status: record.type === 'ucr' ? 'UCR' : getCaseStatusFromTrialStage(
                    record.successorCaseId
                        ? 'Committed'
                        : [...recordHearings]
                            .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
                            .find(hearing => String(hearing.trialStage || '').trim())?.trialStage
                            || fields.caseTrialStageValue
                ),
                courtType: record.type === 'ucr' ? '' : String(fields.courttype || '').trim(),
                regPrefix: String(fields.regprefix || '').trim(),
                regNo: String(fields.regnumber || '').trim(),
                regYear: String(fields.regyear || '').trim(),
                regDate: String(fields.regdate || '').trim(),
                courtName: String(fields.courtnan || '').trim(),
                courtNumber: String(fields.caseCourtNumber || '').trim(),
                judgeCourtType: String(fields.caseJudgeCourtType || '').trim(),
                judgeName: String(fields.caseJudgeName || '').trim(),
                judgeId: String(fields.caseJudgeId || '').trim(),
                judgeDisplayName: String(fields.caseJudgeDisplayName || '').trim(),
                challanDate: String(fields.challandate || '').trim(),
                chargeDate: latestChargeDate(recordHearings),
                nextDate: String(fields.caseNextDateValue || '').trim(),
                trialStage: String(fields.caseTrialStageValue || '').trim(),
                hearingDateRecord: recordHearings,
                ucrNumber: record.type === 'ucr' ? String(fields.ucrNumber || '').trim() : '',
                report_type: record.type === 'ucr' ? String(fields.report_type || '').trim() : '',
                ucr_dod: record.type === 'ucr' ? String(fields.ucr_dod || '').trim() : ''
            };
            if (record.collectionName === 'cases' && record.id) {
                delete caseData.firId;
                delete caseData.firMasterId;
            } else {
                caseData.firId = firMasterId || String(rawData.fileNo || '').trim();
                caseData.firMasterId = firMasterId || '';
            }

            let recordId = record.id;
            if (!recordId) {
                recordId = doc(linkedCasesCollection).id;
                record.id = recordId;
                record.collectionName = LINKED_CASES_COLLECTION;
                record.createdAt = Timestamp.now();
            }
            const recordReference = doc(db, record.collectionName || LINKED_CASES_COLLECTION, recordId);
            const batch = writeBatch(db);
            if (record.isPersisted) {
                batch.update(recordReference, {
                    ...caseData,
                    updatedAt: serverTimestamp()
                });
            } else {
                record.createdAt = record.createdAt || Timestamp.now();
                batch.set(recordReference, {
                    ...caseData,
                    createdAt: record.createdAt,
                    updatedAt: serverTimestamp()
                });
            }
            if (record.predecessorCaseId) {
                const source = caseRecordDrafts.find(item => item.id === record.predecessorCaseId);
                if (!source?.id) throw new Error('The predecessor proceeding is unavailable. Reload the FIR before saving this transfer.');
                batch.update(doc(db, source.collectionName || 'cases', source.id), {
                    status: 'Committed',
                    successorCaseId: recordId,
                    updatedAt: serverTimestamp()
                });
            }
            await batch.commit();
            record.isPersisted = true;
            if (record.predecessorCaseId) {
                const source = caseRecordDrafts.find(item => item.id === record.predecessorCaseId);
                source.successorCaseId = recordId;
                source.fields.casestatus = 'Committed';
            }
            hearingDateRecords = recordHearings;
            persistHearingRecords(recordId);
          } catch (error) {
            saveFailures.push({ recordIndex, record, error });
          }
        }

        let statusRefreshFailure = null;
        try {
            const linkedRecords = firMasterId
                ? await loadRecordsForFir(db, firMasterId)
                : (isEditingLegacyRecord ? await loadRecordsForFir(db, String(rawData.fileNo || '').trim()) : []);
            const firStatus = deriveFirStatus(masterData, linkedRecords);
            const firStatusField = document.getElementById('fir_Status');
            if (firStatusField) {
                const statusLabels = { UI: 'Under Investigation', UT: 'Under Trial', Disposed: 'Disposed', UCR: 'Untraced', Cancelled: 'Cancelled' };
                firStatusField.value = statusLabels[firStatus] || statusLabels.UI;
            }
            if (firMasterId && !isEditingLegacyRecord) {
                await saveFirMaster(db, {
                    ...masterData,
                    fileNo: String(rawData.fileNo || '').trim(),
                    policeStationId: assignedStation.policeStationId,
                    firStatus
                }, firMasterId);
            } else if (isEditingLegacyRecord) {
                const legacyRecords = linkedRecords.filter(item => item._collectionName === 'cases');
                await Promise.all(legacyRecords.map(item => updateDoc(doc(db, 'cases', item.id), {
                    firStatus,
                    updatedAt: serverTimestamp()
                })));
            }
        } catch (error) {
            statusRefreshFailure = error;
        }
        if (saveFailures.length || statusRefreshFailure) {
            const details = saveFailures.map(({ recordIndex, record, error }) =>
                `${caseRecordLabels[record.type] || 'Record'} ${recordIndex + 1}: ${error?.message || 'Save failed.'}`
            );
            if (statusRefreshFailure) {
                details.push(`FIR status refresh failed: ${statusRefreshFailure?.message || 'The status could not be refreshed.'} Proceeding writes that already succeeded are retained; retry after correcting the issue.`);
            }
            if (caseRecordStatus) caseRecordStatus.textContent = `Saved ${caseRecordDrafts.length - saveFailures.length} record(s); ${saveFailures.length} proceeding save(s) failed.${details.length ? `\n${details.join('\n')}` : ''}`;
            else if (details.length) alert(details.join('\n'));
            return;
        }
        window.dispatchEvent(new CustomEvent('caseAdded'));
        closeModal();
        window.alert('FIR and case records saved successfully.');
    } catch (err) {
        console.error('Error saving FIR or proceeding:', err);
        alert(err instanceof Error && err.message ? err.message : 'Failed to save FIR or proceeding. Check console.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});
