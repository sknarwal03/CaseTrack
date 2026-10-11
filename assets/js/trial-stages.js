export const TRIAL_STAGES = Object.freeze([
    'App',
    'Charge',
    'Reply',
    'PW',
    '313 Crpc',
    'DW',
    'Consid.',
    'Argu.',
    'Final Order',
    'Disposed'
]);

const LEGACY_TRIAL_STAGES = new Map([
    ['consideration', 'Consid.'],
    ['argument', 'Argu.']
]);

export function normalizeTrialStage(value) {
    const stage = String(value || '').trim();
    return LEGACY_TRIAL_STAGES.get(stage.toLowerCase()) || stage;
}

export function populateTrialStageSelect(select) {
    if (!select) return;
    const placeholder = select.querySelector('option[value=""]');
    select.replaceChildren();
    if (placeholder) {
        select.append(placeholder);
    } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Select Trial Stage';
        option.selected = true;
        select.append(option);
    }
    TRIAL_STAGES.forEach(stage => select.add(new Option(stage, stage)));
}

export function setTrialStageSelectValue(select, value) {
    if (!select) return;
    const stage = normalizeTrialStage(value);
    if (stage && !Array.from(select.options).some(option => option.value === stage)) {
        select.add(new Option(stage, stage));
    }
    select.value = stage;
}
