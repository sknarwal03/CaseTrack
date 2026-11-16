import { setupModal } from './shared-utils.js';
import { downloadExport } from './data-export.mjs';

export function configureExportDialog({ trigger, dialog, title, filenamePrefix, getData }) {
    const openButton = document.querySelector(trigger);
    const modal = document.querySelector(dialog);
    if (!openButton || !modal) return null;

    let helper;
    helper = setupModal(modal, null, ['[data-export-close]'], {
        initialFocusSelector: 'input[name="export-format"]',
        fallbackFocusSelector: trigger,
        onEscape: () => helper?.closeModal()
    });
    const form = modal.querySelector('form');
    const count = modal.querySelector('[data-export-count]');
    const status = modal.querySelector('[data-export-status]');
    const submit = modal.querySelector('[data-export-submit]');
    const fields = modal.querySelectorAll('input[name="export-scope"]');
    let exporting = false;

    const selected = (name, fallback) => modal.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
    const refreshCount = () => {
        try {
            const data = getData(selected('export-scope', 'filtered'));
            count.textContent = data
                ? data.countLabel || `${data.rows?.length ?? 0} rows will be exported.`
                : 'Loading records…';
        } catch {
            count.textContent = 'Record count is unavailable until data finishes loading.';
        }
    };

    openButton.addEventListener('click', () => {
        status.textContent = '';
        refreshCount();
        helper.openModal();
    });
    fields.forEach(field => field.addEventListener('change', refreshCount));
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (exporting) return;
        exporting = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'Preparing your export…';
        try {
            const scope = selected('export-scope', 'filtered');
            const format = selected('export-format', 'csv');
            const data = getData(scope);
            if (!data) throw new Error('The records are not ready yet. Please try again.');
            const date = new Date();
            const dateStamp = date.toISOString().slice(0, 10);
            await downloadExport({
                ...data,
                format,
                filename: `${filenamePrefix}-${scope}-${dateStamp}`,
                title,
                exportedAt: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
            });
            status.textContent = 'Export prepared. Your download should begin shortly.';
        } catch (error) {
            status.textContent = error?.message === 'The records are not ready yet. Please try again.'
                ? error.message
                : 'Export failed. Check your connection and try again.';
        } finally {
            exporting = false;
            submit.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
    return { refreshCount, close: helper.closeModal, destroy: helper.destroy };
}
