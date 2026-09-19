import { db } from "@config/firebase-config.js";
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
    // syncWitnessBalance();
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
            // syncWitnessCounter();
        }
    });

    update();
};

/* =========================
   MODAL
========================= */

const openModal = () => {
    // syncFirYearFromDate();
    // syncWitnessCounter();
    // syncWitnessBalance();

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
            row.textContent.toLowerCase().includes(q) ? "" : "none";
    });
});


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
        // syncFirYearFromDate();
        // syncWitnessCounter();
        // syncWitnessBalance();

                const formData = new FormData(form);
        const rawData = Object.fromEntries(formData);
        
        rawData.accused_name = formData.getAll("accused_name[]");
        rawData.accused_father_name = formData.getAll("accused_father_name[]");
        rawData.accused_mobile = formData.getAll("accused_mobile[]");
        rawData.arrested = formData.getAll("arrested[]");
        rawData.arrestingdate = formData.getAll("arrestingdate[]");
        rawData.custody_status = formData.getAll("custody_status[]");
        rawData.baildate = formData.getAll("baildate[]");
        rawData.po_status = formData.getAll("po_status[]");
        rawData.po_date = formData.getAll("po_date[]");
        rawData.accused_address = formData.getAll("accused_address[]");
        
        rawData.witness_name = formData.getAll("witness_name[]");
        rawData.witness_status = formData.getAll("witness_status[]");
        rawData.witness_examined = formData.getAll("witness_examined[]");
        rawData.witness_examined_date = formData.getAll("witness_examined_date[]");

        const caseData = {
            firNo: String(rawData.firno || "").trim(),
            firYear: String(rawData.firyear || "").trim(),
            firDate: String(rawData.firdate || "").trim(),
            underSection: String(rawData.undersection || "").trim(),
            policeStation: String(rawData.policestation || "").trim(),
            caseStatus: String(rawData.casestatus || "").trim(),

            registrationDate: String(rawData.regdate || "").trim(),
            courtType: String(rawData.courttype || "").trim(),
            courtNumber: String(rawData.courtnan || "").trim(),
            registrationNo: String(rawData.regnumber || "").trim(),
            caseStage: String(rawData.casestatus || "").trim(),
            dateOfCharge: String(rawData.chargedate || "").trim(),
            dateOfDecision: String(rawData.dod_date || "").trim(),
            nextDate: String(rawData.nextdate || "").trim(),

            ioRank: String(rawData.iorank || "").trim(),
            nameOfIO: String(rawData.ioname || "").trim(),

            incidentDate: String(rawData.incident_date || "").trim(),
            incidentPlace: String(rawData.incident_place || "").trim(),
            incidentDetails: "",

            complainantName: String(rawData.complainant_name || "").trim(),
            complainantContact: String(rawData.complainant_mobile || "").trim(),
            complainantAddress: String(rawData.complainant_address || "").trim(),

            accused: rawData.accused_name ? rawData.accused_name.filter(n => n.trim() !== "").join(", ") : "",
            totalWitness: Number(rawData.total_witness || 0),
            witnessExamined: Number(rawData.examined_witness || 0),
            witnessLeft: Number(rawData.left_witness || 0),
            witnessNames: rawData.witness_name ? rawData.witness_name.filter(n => n.trim() !== "").join(", ") : "",
            
            newFormData: rawData
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

        // syncWitnessCounter();
        // syncWitnessBalance();

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

            // syncWitnessCounter();
            // syncWitnessBalance();
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


// --- INJECTED FROM ADDNEWCASE.JS ---
/* =========================================================
   CASETRACK — ADD NEW CASE JS
========================================================= */



const firDate = document.getElementById("firdate");
const firYear = document.getElementById("firyear");

const addAccused = document.getElementById("addAccused");
const accusedContainer = document.getElementById("accusedContainer");

/* =========================================================
   ACCUSED CARD LOGIC (ARREST & PO)
========================================================= */

function setupAccusedCard(card) {
    const arrestCheckbox = card.querySelector(".arrested");
    const arrestDate = card.querySelector(".arrestingdate");
    const custodyStatus = card.querySelector(".custody-status");
    const bailDate = card.querySelector(".baildate");
    
    if (arrestCheckbox && arrestDate) {
        arrestCheckbox.addEventListener("change", () => {
            if (arrestCheckbox.checked) {
                arrestDate.disabled = false;
                if (custodyStatus) custodyStatus.disabled = false;
            } else {
                arrestDate.disabled = true;
                arrestDate.value = "";
                if (arrestDate._flatpickr) arrestDate._flatpickr.clear();
                
                if (custodyStatus) {
                    custodyStatus.disabled = true;
                    custodyStatus.value = "";
                }
                if (bailDate) {
                    bailDate.disabled = true;
                    bailDate.value = "";
                    if (bailDate._flatpickr) bailDate._flatpickr.clear();
                }
            }
        });
        
        // Initial sync
        if (!arrestCheckbox.checked) {
            arrestDate.disabled = true;
            if (custodyStatus) custodyStatus.disabled = true;
        }
    }

    if (custodyStatus && bailDate) {
        custodyStatus.addEventListener("change", () => {
            if (custodyStatus.value === "bailed_police" || custodyStatus.value === "bailed_court") {
                bailDate.disabled = false;
            } else {
                bailDate.disabled = true;
                bailDate.value = "";
                if (bailDate._flatpickr) bailDate._flatpickr.clear();
            }
        });

        if (custodyStatus.value !== "bailed_police" && custodyStatus.value !== "bailed_court") {
            bailDate.disabled = true;
        }
    }

    const poSelect = card.querySelector(".po-status");
    const poDate = card.querySelector(".po-date");

    if (poSelect && poDate) {
        poSelect.addEventListener("change", () => {
            if (poSelect.checked) {
                poDate.disabled = false;
            } else {
                poDate.disabled = true;
                poDate.value = "";
                if (poDate._flatpickr) poDate._flatpickr.clear();
            }
        });
        
        // Initial sync
        if (!poSelect.checked) {
            poDate.disabled = true;
        }
    }
}

// Setup existing accused cards on page load
document.querySelectorAll(".accused-card").forEach(setupAccusedCard);

/* =========================================================
   AUTO FIR YEAR
========================================================= */

firDate.addEventListener("change", () => {
    if (!firDate.value) {
        firYear.value = "";
        return;
    }
    const date = new Date(firDate.value);
    firYear.value = date.getFullYear();
});


/* =========================================================
   ADD MORE ACCUSED
========================================================= */

let accusedCount = 1;

addAccused.addEventListener("click", () => {

    accusedCount++;

    const card = document.createElement("div");

    card.className = "accused-card";

    card.innerHTML = `

        <div class="accused-number">
            ACCUSED <span>${String(accusedCount).padStart(2, "0")}</span>
        </div>

        <div class="form-grid">

            <div class="input-group">

                <label>Accused Name</label>

                <input
                    type="text"
                    name="accused_name[]"
                    placeholder="Full name">

            </div>


            <div class="input-group">

                <label>Father's Name</label>

                <input
                    type="text"
                    name="accused_father_name[]"
                    placeholder="Father's name">

            </div>


            <div class="input-group">

                <label>Mobile Number</label>

                <input
                    type="tel"
                    name="accused_mobile[]"
                    maxlength="10"
                    placeholder="10 digit mobile number">

            </div>


            <div class="input-group">
                <label>Arrest Status</label>
                <div class="toggle-container">
                    <span style="font-size: 13px; color: var(--muted); flex-grow: 1;">Mark as Arrested</span>
                    <label class="switch">
                        <input type="checkbox" name="arrested[]" class="arrested" value="yes">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div class="input-group">
                <label>Arrest Date</label>
                <input type="date" name="arrestingdate[]" class="arrestingdate" disabled>
            </div>

            <div class="input-group">
                <label>Custody Status</label>
                <select name="custody_status[]" class="custody-status" disabled>
                    <option value="">Select Status</option>
                    <option value="bailed_police">Bailed by Police</option>
                    <option value="bailed_court">Bailed by Court</option>
                    <option value="jc">In Judicial Custody</option>
                    <option value="pc">In Police Custody</option>
                </select>
            </div>

            <div class="input-group">
                <label>Bail Date</label>
                <input type="date" name="baildate[]" class="baildate" disabled>
            </div>

            <div class="input-group">
                <label>Proclaimed Offender</label>
                <div class="toggle-container">
                    <span style="font-size: 13px; color: var(--muted); flex-grow: 1;">Mark as PO</span>
                    <label class="switch">
                        <input type="checkbox" name="po_status[]" class="po-status" value="yes">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div class="input-group">
                <label>PO V.O.D</label>
                <input type="date" name="po_date[]" class="po-date" disabled>
            </div>

            <div class="input-group full-width">
                <label>Accused Address</label>
                <textarea name="accused_address[]" rows="3" placeholder="Enter complete address"></textarea>
            </div>
        </div>
    `;

    accusedContainer.appendChild(card);
    initDatePickers(card);
    setupAccusedCard(card);
});


/* =========================================================
   FLATPICKR DATE INITIALIZATION
========================================================= */

function initDatePickers(container = document) {
    const dateInputs = container.querySelectorAll('input[type="date"], input.flatpickr-date');
    dateInputs.forEach(input => {
        // Change type to text so native browser calendar doesn't interfere
        if (input.getAttribute('type') === 'date') {
            input.setAttribute('type', 'text');
            input.classList.add('flatpickr-date');
        }
    });

    flatpickr(dateInputs, {
        dateFormat: "d/m/Y",
        allowInput: true,
        disableMobile: true // Forces flatpickr on mobile instead of native
    });
}

// Initialize on page load
initDatePickers();


/* =========================================================
   WITNESS TABLE LOGIC
========================================================= */

const witnessTableBody = document.getElementById("witnessTableBody");
const addWitnessBtn = document.getElementById("addWitness");
const totalWitnessInput = document.getElementById("totalWitness");
const examinedWitnessInput = document.getElementById("examinedWitness");
const leftWitnessInput = document.getElementById("leftWitness");

function updateWitnessCounts() {
    const rows = witnessTableBody.querySelectorAll("tr");
    
    let validTotal = 0;
    let examinedCount = 0;
    
    rows.forEach(row => {
        const nameInput = row.querySelector("input[type='text']");
        const checkbox = row.querySelector(".examined-checkbox");
        
        if (nameInput && nameInput.value.trim() !== "") {
            validTotal++;
            if (checkbox && checkbox.checked) {
                examinedCount++;
            }
        }
    });
    
    totalWitnessInput.value = validTotal;
    examinedWitnessInput.value = examinedCount;
    leftWitnessInput.value = validTotal - examinedCount;
}

function setupWitnessRow(row) {
    const nameInput = row.querySelector("input[type='text']");
    const checkbox = row.querySelector(".examined-checkbox");
    const dateInput = row.querySelector(".examined-date");

    // Update counts as the user types a name
    nameInput.addEventListener("input", updateWitnessCounts);

    checkbox.addEventListener("change", () => {
        dateInput.disabled = !checkbox.checked;
        if (!checkbox.checked) {
            dateInput.value = "";
            if (dateInput._flatpickr) {
                dateInput._flatpickr.clear();
            }
        } else {
            // Automatically show picker when checked
            if (dateInput._flatpickr) {
                setTimeout(() => dateInput._flatpickr.open(), 50);
            }
        }
        updateWitnessCounts();
    });
}

// Setup initial row
witnessTableBody.querySelectorAll("tr").forEach(setupWitnessRow);
updateWitnessCounts();

addWitnessBtn.addEventListener("click", () => {
    const rowCount = witnessTableBody.querySelectorAll("tr").length + 1;
    const tr = document.createElement("tr");
    
    tr.innerHTML = `
        <td class="sr-no">${rowCount}</td>
        <td><input type="text" name="witness_name[]" placeholder="Full name"></td>
        <td>
            <select name="witness_status[]">
                <option value="">Pending</option>
                <option value="chief">Chief</option>
                <option value="cross">Cross</option>
                <option value="givenup">Given Up</option>
            </select>
        </td>
        <td class="text-center">
            <input type="checkbox" name="witness_examined[]" class="examined-checkbox" value="yes">
        </td>
        <td><input type="date" name="witness_examined_date[]" class="examined-date" disabled></td>
    `;
    
    witnessTableBody.appendChild(tr);
    setupWitnessRow(tr);
    initDatePickers(tr);
    updateWitnessCounts();
});




form?.addEventListener("reset", () => {
    setTimeout(() => {
        // Clear Flatpickr instances
        document.querySelectorAll('.flatpickr-date').forEach(input => {
            if (input._flatpickr) {
                input._flatpickr.clear();
            }
        });

        // Reset Accused container (keep first card)
        const accusedContainer = document.getElementById("accusedContainer");
        if (accusedContainer) {
            const cards = accusedContainer.querySelectorAll('.accused-card');
            for (let i = 1; i < cards.length; i++) {
                cards[i].remove();
            }
        }
        if (typeof accusedCount !== 'undefined') accusedCount = 1;

        // Reset Witness table (keep first row)
        const witnessTableBody = document.getElementById("witnessTableBody");
        if (witnessTableBody) {
            const rows = witnessTableBody.querySelectorAll('tr');
            for (let i = 1; i < rows.length; i++) {
                rows[i].remove();
            }
        }

        if (typeof updateWitnessCounts === 'function') updateWitnessCounts();
        
        // Reset disabled states on first accused card
        const firstAccused = document.querySelector('.accused-card');
        if (firstAccused) {
            const arrDate = firstAccused.querySelector(".arrestingdate");
            const cusStat = firstAccused.querySelector(".custody-status");
            const bailDate = firstAccused.querySelector(".baildate");
            const poDate = firstAccused.querySelector(".po-date");
            if (arrDate) arrDate.disabled = true;
            if (cusStat) { cusStat.disabled = true; cusStat.value = ""; }
            if (bailDate) bailDate.disabled = true;
            if (poDate) poDate.disabled = true;
        }
    }, 10);
});
