
export function parseCaseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
            return new Date(parts[2], parseInt(parts[1], 10) - 1, parts[0]);
        }
    }
    return new Date(dateStr);
}

export function setupCustomModalFocus(modal, { initialFocusSelector = null, fallbackFocusSelector = null, onEscape = null } = {}) {
    if (!modal) return { open() {}, close() {}, destroy() {} };

    const dialog = modal.querySelector('[role="dialog"]') || modal;
    if (!modal.classList.contains('show')) modal.setAttribute('aria-hidden', 'true');
    const focusableSelector = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    let active = false;
    let opener = null;
    let lastFocused = null;

    const isVisible = element => Boolean(element?.isConnected
        && !element.matches(':disabled,[hidden],[aria-hidden="true"]')
        && !element.closest('[hidden],[aria-hidden="true"]')
        && (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0));
    const getFocusable = () => [...modal.querySelectorAll(focusableSelector)].filter(isVisible);
    const resolve = candidate => {
        if (typeof candidate === 'string') return modal.querySelector(candidate);
        return candidate;
    };
    const focusInside = candidate => {
        const focusables = getFocusable();
        const requested = resolve(candidate) || resolve(initialFocusSelector);
        const target = requested && isVisible(requested)
            ? requested
            : focusables[0] || dialog;
        if (!target.hasAttribute('tabindex') && target === dialog) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        lastFocused = target;
    };
    const restoreFocus = () => {
        const canRestore = element => element && element !== document.body && isVisible(element);
        let target = canRestore(opener) ? opener : resolve(fallbackFocusSelector);
        if (!canRestore(target)) target = document.querySelector('[data-open-add-case], .case-filter.active');
        if (!canRestore(target)) return;
        target.focus({ preventScroll: true });
    };
    const onKeydown = event => {
        if (!active || !modal.classList.contains('show')) return;
        if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            onEscape?.();
            return;
        }
        if (event.key !== 'Tab') return;
        if (document.querySelector('dialog[open]')) return;

        const focusables = getFocusable();
        if (!focusables.length) {
            event.preventDefault();
            focusInside(dialog);
            return;
        }
        const first = focusables[0];
        const last = focusables.at(-1);
        if (!modal.contains(document.activeElement)) {
            event.preventDefault();
            focusInside(event.shiftKey ? last : first);
        } else {
            const currentIndex = focusables.indexOf(document.activeElement);
            if (event.shiftKey && currentIndex <= 0) {
                event.preventDefault();
                focusInside(last);
            } else if (!event.shiftKey && currentIndex === focusables.length - 1) {
                event.preventDefault();
                focusInside(first);
            }
        }
    };
    const onFocusIn = event => {
        if (!active || !modal.classList.contains('show')) return;
        if (document.querySelector('dialog[open]')) return;
        if (modal.contains(event.target)) {
            lastFocused = event.target;
            return;
        }
        focusInside(isVisible(lastFocused) ? lastFocused : null);
    };

    function open({ openerElement = document.activeElement, initialFocus = null } = {}) {
        if (!active) opener = openerElement;
        active = true;
        modal.setAttribute('aria-hidden', 'false');
        modal.addEventListener('keydown', onKeydown);
        document.addEventListener('focusin', onFocusIn, true);
        focusInside(initialFocus);
    }

    function close() {
        if (!active) {
            modal.setAttribute('aria-hidden', 'true');
            return;
        }
        active = false;
        modal.removeEventListener('keydown', onKeydown);
        document.removeEventListener('focusin', onFocusIn, true);
        modal.setAttribute('aria-hidden', 'true');
        restoreFocus();
        opener = null;
        lastFocused = null;
    }

    function destroy() {
        close();
        modal.removeEventListener('keydown', onKeydown);
        document.removeEventListener('focusin', onFocusIn, true);
    }

    return { open, close, destroy };
}

export function setupModal(modalSelector, openTriggerSelector = null, closeSelectors = [".close", "[data-close-modal]", "[data-close-detail-modal]"], focusOptions = {}) {
    const modal = typeof modalSelector === "string" ? document.querySelector(modalSelector) : modalSelector;
    if (!modal) return;
    const focusManager = setupCustomModalFocus(modal, focusOptions);

    const openModal = () => {
        modal.classList.add("show");
        document.body.style.overflow = "hidden";
        focusManager.open({ openerElement: document.activeElement });
    };

    const closeModal = () => {
        modal.classList.remove("show");
        document.body.style.overflow = "";
        focusManager.close();
    };

    if (openTriggerSelector) {
        document.querySelectorAll(openTriggerSelector).forEach(btn => {
            btn.addEventListener("click", e => {
                e.preventDefault();
                openModal();
            });
        });
    }

    closeSelectors.forEach(sel => {
        modal.querySelectorAll(sel).forEach(btn => {
            btn.addEventListener("click", closeModal);
        });
    });

    modal.addEventListener("click", e => {
        if (e.target === modal || e.target.classList.contains("modal-backdrop")) {
            closeModal();
        }
    });

    return { openModal, closeModal, destroy: focusManager.destroy };
}

export function setupDropdown(triggerSelector, panelSelector, openClass = "show-dropdown") {
    const trigger = typeof triggerSelector === "string" ? document.querySelector(triggerSelector) : triggerSelector;
    const panel = typeof panelSelector === "string" ? document.querySelector(panelSelector) : panelSelector;
    if (!trigger || !panel) return;

    const toggle = (e) => {
        if (e) e.stopPropagation();
        const isOpen = panel.classList.toggle(openClass);
        if (isOpen && panel.style.display === "none") panel.style.display = "";
        else if (!isOpen && panel.classList.contains("pc-range-panel")) panel.style.display = "none";
    };

    trigger.addEventListener("click", toggle);
    trigger.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(e);
        }
    });

    document.addEventListener("click", e => {
        if (!panel.contains(e.target) && !trigger.contains(e.target)) {
            panel.classList.remove(openClass);
            if(panel.classList.contains("pc-range-panel")) panel.style.display = "none";
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && panel.classList.contains(openClass)) {
            panel.classList.remove(openClass);
            if(panel.classList.contains("pc-range-panel")) panel.style.display = "none";
        }
    });

    return { toggle };
}

