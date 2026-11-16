import { normalizeFirStatus } from './fir-status.mjs';

export const FIR_STATUS_PRESENTATION = Object.freeze({
    UI: Object.freeze({ category: 'ui', label: 'Under Investigation', color: '#5B8DEF' }),
    UCR: Object.freeze({ category: 'ucr', label: 'UCR — Untraced / Cancellation', color: '#E6B84A' }),
    Cancelled: Object.freeze({ category: 'ucr', label: 'Cancelled', color: '#E6B84A' }),
    UT: Object.freeze({ category: 'ut', label: 'Under Trial', color: '#E66A73' }),
    Disposed: Object.freeze({ category: 'disposed', label: 'Disposed', color: '#42B883' })
});

export function firStatusPresentation(value) {
    const raw = String(value ?? '').trim();
    const normalized = normalizeFirStatus(raw);
    if (normalized && FIR_STATUS_PRESENTATION[normalized]) {
        return { ...FIR_STATUS_PRESENTATION[normalized], status: normalized };
    }
    return { category: 'other', label: raw || 'Status not recorded', color: null, status: normalized };
}
