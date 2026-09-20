
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

export function setupModal(modalSelector, openTriggerSelector = null, closeSelectors = [".close", "[data-close-modal]", "[data-close-detail-modal]"]) {
    const modal = typeof modalSelector === "string" ? document.querySelector(modalSelector) : modalSelector;
    if (!modal) return;

    const openModal = () => {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    };

    const closeModal = () => {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
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

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && modal.classList.contains("show")) {
            closeModal();
        }
    });

    return { openModal, closeModal };
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

