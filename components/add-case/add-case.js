import { db } from '@config/firebase-config.js';
import { collection, addDoc, updateDoc, doc, getDocs, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
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

if (!document.getElementById('caseModal')) {
    document.body.insertAdjacentHTML('beforeend', addCaseHtml);
}

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
    const storedIds = new Set(snapshot.docs.map(masterDoc => masterDoc.id));

    await Promise.all(definition.initialValues.map(({ value, label }) => {
        const id = masterDocumentId(value);
        if (storedIds.has(id)) return Promise.resolve();
        return setDoc(doc(db, definition.collectionName, id), {
            value,
            label,
            normalized: normalizeMasterValue(value),
            createdAt: serverTimestamp()
        });
    }));

    const refreshedSnapshot = await getDocs(listRef);
    const valuesByNormalized = new Map();
    const refreshedValues = refreshedSnapshot.docs
        .map(masterDoc => {
            const data = masterDoc.data();
            return typeof data.value === 'string' && data.value.trim()
                ? { value: data.value.trim(), label: data.label || data.value.trim() }
                : null;
        })
        .filter(Boolean);
    [...definition.initialValues, ...storedValues, ...refreshedValues]
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
    if (!input || !wrapper || !toggle || !menu || !status) {
        throw new Error(`Missing ${type} searchable list elements`);
    }

    const close = () => {
        menu.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-expanded', 'false');
    };

    const positionMenu = () => {
        if (menu.hidden) return;
        const bounds = input.getBoundingClientRect();
        const spaceBelow = window.innerHeight - bounds.bottom;
        const placeAbove = spaceBelow < 230 && bounds.top > spaceBelow;
        menu.style.left = `${bounds.left}px`;
        menu.style.width = `${bounds.width + toggle.getBoundingClientRect().width}px`;
        menu.style.top = placeAbove ? '' : `${bounds.bottom}px`;
        menu.style.bottom = placeAbove ? `${window.innerHeight - bounds.top}px` : '';
        menu.classList.toggle('opens-above', placeAbove);
    };

    const open = (showAll = true) => {
        menu.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-expanded', 'true');
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
    toggle.addEventListener('click', () => {
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
            toggle.setAttribute('aria-expanded', 'false');
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
    judgeSelect.replaceChildren(new Option('--Select Court--', ''));
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
    populateCaseJudgeOptions();
    selectJudge('');
    if (judgeSelectStatus) {
        judgeSelectStatus.textContent = getEligibleCaseJudges().length
            ? ''
            : 'No judges match this court type. Check All Judges designations.';
    }
});

function initDatePickers(container = document) {
    const dateInputs = container.querySelectorAll('input[type="date"], input.flatpickr-date');
    dateInputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
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
    masterComboboxes.forEach(({ close }) => close());
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

    const status = statusSelect.value;

    const els = {
        courtTypeWrap: document.getElementById('courttypeWrap'),
        courtReg: document.getElementById('sectionCourtReg'),
        chargeDate: document.getElementById('fieldChargedate'),
        nextDate: document.getElementById('fieldNextdate'),
        trialStage: document.getElementById('fieldTrialStage'),
        accused: document.getElementById('sectionAccused'),
        witness: document.getElementById('sectionWitness'),
        other: document.getElementById('sectionOther')
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
            hide(els.chargeDate, els.nextDate, els.trialStage, els.accused, els.witness, els.other);
            break;
        case 'Disposed':
            hide(els.nextDate, els.trialStage);
            break;
        case 'UI': // Under Investigation
            hide(els.courtTypeWrap, els.courtReg, els.accused, els.witness, els.other);
            break;
        case 'UT': // Under Trial
        default:
            // Show all (already reset above)
            break;
    }
}

document.getElementById('casestatus')?.addEventListener('change', updateCaseStatusFields);
document.getElementById('caseForm')?.addEventListener('reset', () => {
    setTimeout(updateCaseStatusFields, 10);
});

window.openAddCaseModal = (caseItem = null) => {
    resetForm();

    const title = document.getElementById('modalTitle');
    if (title) title.textContent = caseItem ? 'Edit Case' : 'Add New Case';
    const stateLabel = document.getElementById('caseModalStateLabel');
    if (stateLabel) stateLabel.textContent = caseItem ? 'EDITING CASE' : 'NEW CASE';

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
            courtNumber: 'courtNumber',
            judgeCourtType: 'judgeCourtType',
            judgeName: 'judgeName',
            judgeId: 'judgeId',
            judgeDisplayName: 'judgeDisplayName',
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

    const policeStationInput = document.getElementById('policestation');
    if (policeStationInput) policeStationInput.value = 'OSM';

    const loadId = ++judgeLoadSequence;
    void loadCaseJudges(caseItem, loadId);
    updateCaseStatusFields();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    masterComboboxes.forEach(({ close }) => close());
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
        await persistMasterValue('crimeHead', String(rawData.crimehead || ''));

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
            courtNumber: String(rawData.courtNumber || '').trim(),
            judgeCourtType: String(rawData.judgeCourtType || '').trim(),
            judgeName: String(rawData.judgeName || '').trim(),
            judgeId: String(rawData.judgeId || '').trim(),
            judgeDisplayName: String(rawData.judgeDisplayName || '').trim(),
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
