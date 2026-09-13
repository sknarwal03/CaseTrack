import { db } from "../../firebase/firebase-config.js";
import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp
} from "firebase/firestore";

const modal = document.querySelector("#caseModal");
const form = document.querySelector("#caseForm");
const themeToggle = document.querySelector("#themeToggle");
const notificationToggle = document.querySelector("#notificationToggle");
const notificationPanel = document.querySelector("#notificationPanel");

let casesCache = [];
let activePcRange = "thisMonth";

/* =========================
   FIRESTORE
========================= */

const casesCollection = collection(db, "cases");

const loadCases = async () => {
    try {
        const snapshot = await getDocs(query(casesCollection, orderBy("createdAt", "desc")));
        casesCache = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        // If createdAt does not exist on older documents, load without orderBy.
        try {
            const snapshot = await getDocs(casesCollection);
            casesCache = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (fallbackError) {
            console.error("Failed to load cases from Firestore:", fallbackError);
            casesCache = [];
        }
    }

    renderDashboard();
};

const saveCaseToFirestore = async caseData => {
    const docRef = await addDoc(casesCollection, {
        ...caseData,
        createdAt: serverTimestamp()
    });

    return docRef.id;
};

/* =========================
   NOTIFICATIONS
========================= */

const toggleNotifications = () => {
    if (!notificationPanel) return;
    const isOpen = notificationPanel.classList.toggle("show");
    notificationToggle?.setAttribute("aria-expanded", String(isOpen));
};

const closeNotifications = () => {
    if (!notificationPanel) return;
    notificationPanel.classList.remove("show");
    notificationToggle?.setAttribute("aria-expanded", "false");
};

notificationToggle?.addEventListener("click", event => {
    event.stopPropagation();
    toggleNotifications();
});

document.addEventListener("click", event => {
    if (!notificationPanel?.contains(event.target) &&
        !notificationToggle?.contains(event.target)) {
        closeNotifications();
    }
});

/* =========================
   FORM CALCULATIONS
========================= */

const syncFirYearFromDate = () => {
    if (!form) return;

    const firDateField = form.elements.namedItem("firDate");
    const firYearField = form.elements.namedItem("firYear");

    if (!firDateField || !firYearField) return;

    const setYearFromDate = () => {
        const dateValue = String(firDateField.value || "").trim();

        if (!dateValue) {
            firYearField.value = "";
            return;
        }

        const year = new Date(`${dateValue}T00:00:00`).getFullYear();
        firYearField.value = Number.isFinite(year) ? String(year) : "";
    };

    firDateField.addEventListener("change", setYearFromDate);
    setYearFromDate();
};

const getListEntries = value =>
    String(value || "")
        .split(/\r?\n/)
        .map(line => String(line || "").replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);

const syncWitnessCounter = () => {
    if (!form) return;

    const witnessNamesField = form.elements.namedItem("witnessNames");
    const totalWitnessField = form.elements.namedItem("totalWitness");

    if (!witnessNamesField || !totalWitnessField) return;

    totalWitnessField.value = String(getListEntries(witnessNamesField.value).length);
    syncWitnessBalance();
};

const syncWitnessBalance = () => {
    if (!form) return;

    const totalWitnessField = form.elements.namedItem("totalWitness");
    const witnessExaminedField = form.elements.namedItem("witnessExamined");
    const witnessLeftField = form.elements.namedItem("witnessLeft");

    if (!totalWitnessField || !witnessExaminedField || !witnessLeftField) return;

    const total = Number.parseInt(totalWitnessField.value, 10);
    const examined = Number.parseInt(witnessExaminedField.value, 10);

    const safeTotal = Number.isFinite(total) ? total : 0;
    const safeExamined = Number.isFinite(examined) ? examined : 0;

    witnessLeftField.value = String(Math.max(safeTotal - safeExamined, 0));
};

const syncListCounter = (fieldName, defaultValue = "1. ") => {
    if (!form) return;

    const field = form.elements.namedItem(fieldName);
    const badge = document.querySelector(`[data-counter-for="${fieldName}"]`);

    if (!field || !badge) return;

    const update = () => {
        badge.textContent = String(getListEntries(field.value).length);
    };

    field.addEventListener("focus", () => {
        if (!String(field.value || "").trim()) {
            field.value = defaultValue;
        }
        update();
    });

    field.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();

            const currentValue = String(field.value || "");
            const nextNumber = getListEntries(currentValue).length + 1;

            const nextValue =
                `${currentValue}${currentValue && !currentValue.endsWith("\n") ? "\n" : ""}${nextNumber}. `;

            field.value = nextValue;

            const end = field.value.length;
            field.setSelectionRange?.(end, end);

            update();
            return;
        }

        if (
            (event.key === "Backspace" || event.key === "Delete") &&
            String(field.value || "") === defaultValue
        ) {
            field.value = "";
            update();
        }
    });

    field.addEventListener("input", () => {
        update();

        if (fieldName === "witnessNames") {
            syncWitnessCounter();
        }
    });

    update();
};

/* =========================
   MODAL
========================= */

const openModal = () => {
    syncFirYearFromDate();
    syncWitnessCounter();
    syncWitnessBalance();

    modal?.classList.add("show");
    document.body.style.overflow = "hidden";
};

const closeModal = () => {
    modal?.classList.remove("show");
    document.body.style.overflow = "";
};

document.querySelector("#openModal")?.addEventListener("click", openModal);
document.querySelector("#closeModal")?.addEventListener("click", closeModal);
document.querySelector("#cancelModal")?.addEventListener("click", closeModal);

modal?.addEventListener("click", event => {
    if (event.target === modal) closeModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
});

/* =========================
   DASHBOARD HELPERS
========================= */

const getCases = () => casesCache;

const getRegistrationDateValue = caseItem =>
    caseItem?.registrationDate ||
    caseItem?.putInCourtDate ||
    "";

const formatDate = value =>
    value
        ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short"
        })
        : "—";

const updateTodayDate = () => {
    const dateEl = document.querySelector("#todayDate");
    if (!dateEl) return;

    dateEl.textContent = new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date());
};

const getDimensionSummary = (cases, fieldKey) => {
    const counts = {};

    cases.forEach(caseItem => {
        const value = String(caseItem[fieldKey] || "").trim();
        const key = value || "Unspecified";
        counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
};

const getDimensionKey = selectedValue => {
    const map = {
        "FIR Year": "firYear",
        "Court Type": "courtType",
        "Court Name": "courtNumber",
        "Case Stage": "caseStage"
    };

    return map[selectedValue] || "firYear";
};

const getPcCaseRange = range => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const ranges = {
        thisMonth: {
            label: "This Month",
            start: new Date(currentYear, currentMonth, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        lastMonth: {
            label: "Last Month",
            start: new Date(currentYear, currentMonth - 1, 1),
            end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
        },
        last6Months: {
            label: "Last 6 Months",
            start: new Date(currentYear, currentMonth - 5, 1),
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        },
        thisYear: {
            label: "This Year",
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 31, 23, 59, 59, 999)
        }
    };

    return ranges[range] || ranges.thisMonth;
};

const matchesPcRange = (dateValue, range) => {
    if (!dateValue) return false;

    const date = new Date(`${dateValue}T00:00:00`);
    const bounds = getPcCaseRange(range);

    return date >= bounds.start && date <= bounds.end;
};

const togglePanelViewAll = (panelId, visibleCount, totalCount) => {
    const button = document.querySelector(
        `.panel-view-all[data-panel="${panelId}"]`
    );

    if (!button) return;

    button.classList.toggle("visible", totalCount > visibleCount);
};

const navigateToCasesPage = (panelId, range) => {
    const params = new URLSearchParams();

    if (panelId === "pc-this-month" && range) {
        params.set("range", range);
    }

    window.location.href =
        `cases.html${params.toString() ? `?${params.toString()}` : ""}`;
};

/* =========================
   PUT IN COURT
========================= */

const renderPcList = (range = "thisMonth") => {
    activePcRange = range;

    const cases = getCases();
    const list = document.querySelector("#pcThisMonthList");
    const trigger = document.querySelector(".pc-range-trigger");
    const options = document.querySelectorAll(".pc-range-option");

    if (!list) return;

    const bounds = getPcCaseRange(range);

    const filtered = cases
        .map(c => ({
            ...c,
            _registrationDate: getRegistrationDateValue(c)
        }))
        .filter(c => c._registrationDate)
        .filter(c => {
            const date = new Date(`${c._registrationDate}T00:00:00`);
            return date >= bounds.start && date <= bounds.end;
        })
        .sort(
            (a, b) =>
                new Date(`${b._registrationDate}T00:00:00`) -
                new Date(`${a._registrationDate}T00:00:00`)
        )
        .slice(0, 5);

    if (trigger) {
        trigger.innerHTML = `${bounds.label} <span>▾</span>`;
    }

    const totalInRange = cases.filter(c =>
        getRegistrationDateValue(c) &&
        matchesPcRange(getRegistrationDateValue(c), range)
    ).length;

    togglePanelViewAll("pc-this-month", 5, totalInRange);

    options.forEach(option => {
        option.classList.toggle(
            "active",
            option.dataset.range === range
        );
    });

    list.innerHTML = filtered.length
        ? filtered.map(c => `
            <div class="case-row">
                <div class="case-doc">▧</div>
                <div class="case-info">
                    <b>FIR-${c.firNo || "—"}/${c.firYear || "—"}</b>
                    <small>${c._registrationDate
                        ? formatDate(c._registrationDate)
                        : (c.underSection || "Case details")}</small>
                </div>
                <span class="badge ${
                    c.caseStatus === "Disposed"
                        ? "closed"
                        : c.caseStatus === "UT"
                            ? "pending"
                            : ""
                }">${c.caseStatus || "Unspecified"}</span>
            </div>
        `).join("")
        : '<p class="empty">No cases found for this range.</p>';
};

/* =========================
   DONUT + DASHBOARD
========================= */

function renderDashboard() {
    const cases = getCases();
    const total = cases.length;

    const donut = document.querySelector(".donut");
    const tooltip = document.querySelector(".donut-tooltip");
    const legendList = document.querySelector(".legend");
    const statusFilter = document.querySelector(".status-filter");

    const selectedField = statusFilter?.value || "FIR Year";
    const fieldKey = getDimensionKey(selectedField);
    const summary = getDimensionSummary(cases, fieldKey);

    const palette = [
        "#3994ff",
        "#19d49b",
        "#8854f4",
        "#ff9f43",
        "#2ec4b6",
        "#f472b6",
        "#60a5fa",
        "#94a3b8"
    ];

    renderPcList(activePcRange);

    document.querySelector("#totalCases").textContent = total;

    document.querySelector("#activeCases").textContent =
        cases.filter(c =>
            !["Disposed", "Cancellation", "UI", "UT", "Untrace"]
                .includes(String(c.caseStatus || "").trim())
        ).length;

    document.querySelector("#pendingHearings").textContent =
        cases.filter(c => c.nextDate).length;

    document.querySelector("#closedCases").textContent =
        cases.filter(c =>
            String(c.caseStatus || "").trim() === "Disposed"
        ).length;

    document.querySelector("#donutTotal").textContent = total;

    if (legendList) {
        legendList.innerHTML = summary.length
            ? summary.map((item, index) => `
                <li>
                    <i style="background:${palette[index % palette.length]}"></i>
                    <span>${item.label}</span>
                    <b>${item.count}</b>
                </li>
            `).join("")
            : '<li><i style="background:#94a3b8"></i><span>No data</span><b>0</b></li>';
    }

    if (donut) {
        let current = 0;

        const gradient = summary.length
            ? summary.map((item, index) => {
                const start = current;
                const end =
                    current +
                    (total ? (item.count / total) * 100 : 0);

                current = end;

                return `${palette[index % palette.length]} ${start}% ${end}%`;
            }).join(", ")
            : "#94a3b8 0 100%";

        donut.style.background = `conic-gradient(${gradient})`;

        const segmentMeta = summary.map((item, index) => ({
            label: item.label,
            count: item.count,
            percentage: total
                ? ((item.count / total) * 100).toFixed(1)
                : "0.0",
            color: palette[index % palette.length]
        }));

        donut.onmousemove = event => {
            if (!segmentMeta.length) {
                tooltip?.classList.remove("show");
                donut.classList.remove("is-hovered");
                return;
            }

            const rect = donut.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const dx = x - cx;
            const dy = y - cy;
            const radius = Math.sqrt(dx * dx + dy * dy);

            const angle =
                (Math.atan2(dy, dx) * 180 / Math.PI) + 90;

            const normalized = (angle + 360) % 360;

            if (radius < 18 || radius > rect.width / 2 - 12) {
                tooltip?.classList.remove("show");
                donut.classList.remove("is-hovered");
                return;
            }

            let cumulative = 0;
            let hovered = null;

            for (const item of segmentMeta) {
                const segmentAngle =
                    total ? (item.count / total) * 360 : 0;

                const start = cumulative;
                const end = cumulative + segmentAngle;

                cumulative = end;

                if (normalized >= start && normalized < end) {
                    hovered = item;
                    break;
                }
            }

            if (!hovered) {
                hovered = segmentMeta[segmentMeta.length - 1];
            }

            if (!tooltip || !hovered) return;

            tooltip.innerHTML = `
                <div class="tooltip-label">
                    <i style="color:${hovered.color};background:${hovered.color};"></i>
                    ${hovered.label}
                </div>
                <div class="tooltip-row">
                    <strong>Cases</strong>
                    <span>${hovered.count}</span>
                </div>
                <div class="tooltip-row">
                    <strong>Percentage</strong>
                    <span>${hovered.percentage}%</span>
                </div>
            `;

            tooltip.style.color = hovered.color;
            tooltip.style.borderColor = `${hovered.color}88`;

            tooltip.style.left =
                `${rect.width / 2 +
                Math.cos((normalized - 90) * Math.PI / 180) * 18}px`;

            tooltip.style.top =
                `${rect.height / 2 +
                Math.sin((normalized - 90) * Math.PI / 180) * 18}px`;

            tooltip.classList.add("show");
            donut.classList.add("is-hovered");

            donut.style.filter =
                `saturate(1.12) brightness(1.08) drop-shadow(0 0 10px ${hovered.color}66)`;
        };

        donut.onmouseleave = () => {
            tooltip?.classList.remove("show");
            donut.classList.remove("is-hovered");
            donut.style.filter = "";
        };
    }

    const hearings = cases
        .filter(c => c.nextDate)
        .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)))
        .slice(0, 4);

    const hearingList = document.querySelector("#hearingList");

    if (hearingList) {
        hearingList.innerHTML = hearings.length
            ? hearings.map(c => {
                const d = new Date(`${c.nextDate}T00:00:00`);

                return `
                    <div class="hearing">
                        <div class="date-box">
                            <b>${String(d.getDate()).padStart(2, "0")}</b>
                            <small>${d.toLocaleString("en", {
                                month: "short"
                            }).toUpperCase()}</small>
                        </div>
                        <div class="hearing-info">
                            <b>FIR-${c.firNo || "—"}/${c.firYear || "—"}</b>
                            <small>${c.courtNumber || c.policeStation || "Court hearing"}</small>
                        </div>
                        <span class="time">Upcoming</span>
                    </div>
                `;
            }).join("")
            : '<p class="empty">No upcoming hearing dates yet.</p>';
    }

    togglePanelViewAll("hearings", 4, hearings.length);
    togglePanelViewAll(
        "tasks",
        3,
        document.querySelectorAll("#tasks .task").length
    );
}

/* =========================
   SEARCH
========================= */

document.querySelector("#caseSearch")?.addEventListener("input", event => {
    const q = event.target.value.toLowerCase().trim();

    document.querySelectorAll(".case-row").forEach(row => {
        row.style.display =
            row.textContent.toLowerCase().includes(q)
                ? "flex"
                : "none";
    });
});

/* =========================
   THEME
========================= */

const applyTheme = theme => {
    const isLight = theme === "light";

    document.body.classList.toggle("light-theme", isLight);

    if (themeToggle) {
        themeToggle.textContent = isLight ? "☾" : "☼";
        themeToggle.setAttribute(
            "aria-label",
            isLight
                ? "Switch to dark theme"
                : "Switch to light theme"
        );
        themeToggle.setAttribute(
            "aria-pressed",
            String(isLight)
        );
    }
};

applyTheme(localStorage.getItem("caseTrackTheme") || "dark");

themeToggle?.addEventListener("click", () => {
    const nextTheme =
        document.body.classList.contains("light-theme")
            ? "dark"
            : "light";

    localStorage.setItem("caseTrackTheme", nextTheme);
    applyTheme(nextTheme);
});

/* =========================
   RANGE SELECTOR
========================= */

const bindPcRangeSelector = () => {
    const trigger = document.querySelector(".pc-range-trigger");
    const options = document.querySelectorAll(".pc-range-option");

    if (!trigger || !options.length) return;

    trigger.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const menu =
            trigger.parentElement.querySelector(".pc-range-panel");

        if (!menu) return;

        const shouldOpen = !menu.classList.contains("show-dropdown");

        menu.classList.toggle("show-dropdown", shouldOpen);
        menu.style.display = shouldOpen ? "" : "none";
    });

    document.addEventListener("click", event => {
        const menu = document.querySelector(".pc-range-menu");

        if (!menu || menu.contains(event.target)) return;

        const panel = menu.querySelector(".pc-range-panel");

        panel?.classList.remove("show-dropdown");

        if (panel) {
            panel.style.display = "none";
        }
    });

    options.forEach(option => {
        option.addEventListener("click", () => {
            const range = option.dataset.range || "thisMonth";

            activePcRange = range;
            renderPcList(range);

            const panel = option.closest(".pc-range-panel");

            panel?.classList.remove("show-dropdown");

            if (panel) {
                panel.style.display = "none";
            }
        });
    });
};

/* =========================
   VIEW ALL
========================= */

const bindViewAllButtons = () => {
    document.querySelectorAll(".panel-view-all").forEach(button => {
        button.addEventListener("click", () => {
            const panelId = button.dataset.panel;

            const range =
                panelId === "pc-this-month"
                    ? activePcRange
                    : "all";

            navigateToCasesPage(panelId, range);
        });
    });
};

/* =========================
   FORM SUBMIT -> FIRESTORE
========================= */

form?.addEventListener("submit", async event => {
    event.preventDefault();

    const saveButton = form.querySelector('button[type="submit"]');

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
    }

    try {
        syncFirYearFromDate();
        syncWitnessCounter();
        syncWitnessBalance();

        const rawData = Object.fromEntries(new FormData(form));

        const caseData = {
            firNo: String(rawData.firNo || "").trim(),
            firYear: String(rawData.firYear || "").trim(),
            firDate: String(rawData.firDate || "").trim(),
            underSection: String(rawData.underSection || "").trim(),
            policeStation: String(rawData.policeStation || "").trim(),
            caseStatus: String(rawData.caseStatus || "").trim(),

            registrationDate: String(rawData.registrationDate || "").trim(),
            courtType: String(rawData.courtType || "").trim(),
            courtNumber: String(rawData.courtNumber || "").trim(),
            registrationNo: String(rawData.registrationNo || "").trim(),
            caseStage: String(rawData.caseStage || "").trim(),
            dateOfCharge: String(rawData.dateOfCharge || "").trim(),
            dateOfDecision: String(rawData.dateOfDecision || "").trim(),
            nextDate: String(rawData.nextDate || "").trim(),

            ioRank: String(rawData.ioRank || "").trim(),
            nameOfIO: String(rawData.nameOfIO || "").trim(),

            incidentDate: String(rawData.incidentDate || "").trim(),
            incidentPlace: String(rawData.incidentPlace || "").trim(),
            incidentDetails: String(rawData.incidentDetails || "").trim(),

            complainantName: String(rawData.complainantName || "").trim(),
            complainantContact: String(rawData.complainantContact || "").trim(),
            complainantAddress: String(rawData.complainantAddress || "").trim(),

            accused: String(rawData.accused || "").trim(),
            totalWitness: Number(rawData.totalWitness || 0),
            witnessExamined: Number(rawData.witnessExamined || 0),
            witnessLeft: Number(rawData.witnessLeft || 0),
            witnessNames: String(rawData.witnessNames || "").trim()
        };

        const documentId = await saveCaseToFirestore(caseData);

        casesCache.unshift({
            id: documentId,
            ...caseData
        });

        form.reset();

        // Restore initial list formatting after reset.
        const accusedField = form.elements.namedItem("accused");
        const witnessNamesField = form.elements.namedItem("witnessNames");

        if (accusedField) {
            accusedField.value = "1. ";
            accusedField.dispatchEvent(new Event("input", { bubbles: true }));
        }

        if (witnessNamesField) {
            witnessNamesField.value = "1. ";
            witnessNamesField.dispatchEvent(new Event("input", { bubbles: true }));
        }

        syncWitnessCounter();
        syncWitnessBalance();

        closeModal();
        renderDashboard();

        console.log("Case saved successfully!");
        console.log("Firestore Document ID:", documentId);

    } catch (error) {
        console.error("Failed to save case:", error);
        alert(`Case save failed: ${error.message}`);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Save Case";
        }
    }
});

/* =========================
   INITIALIZE
========================= */

const init = async () => {
    updateTodayDate();

    syncListCounter("witnessNames");
    syncListCounter("accused");

    const witnessExaminedField =
        form?.elements.namedItem("witnessExamined");

    form?.elements.namedItem("totalWitness")
        ?.addEventListener("input", syncWitnessBalance);

    witnessExaminedField
        ?.addEventListener("input", syncWitnessBalance);

    form?.addEventListener("reset", () => {
        setTimeout(() => {
            const accusedField = form.elements.namedItem("accused");
            const witnessNamesField = form.elements.namedItem("witnessNames");

            if (accusedField && !String(accusedField.value || "").trim()) {
                accusedField.value = "1. ";
                accusedField.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
            }

            if (
                witnessNamesField &&
                !String(witnessNamesField.value || "").trim()
            ) {
                witnessNamesField.value = "1. ";
                witnessNamesField.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
            }

            syncWitnessCounter();
            syncWitnessBalance();
        }, 0);
    });

    document.querySelector(".status-filter")?.addEventListener("change", () => {
        renderDashboard();
    });

    bindPcRangeSelector();
    bindViewAllButtons();

    await loadCases();

    document.querySelector("#firDate")?.addEventListener("click", function () {
        this.showPicker?.();
    });
};

init();
