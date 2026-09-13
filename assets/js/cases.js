import { db } from "../../firebase/firebase-config.js";
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from "firebase/firestore";

const themeToggle = document.querySelector("#themeToggle");
const savedTheme = localStorage.getItem("caseTrackTheme") || "dark";
const modal = document.querySelector("#caseModal");
const detailsModal = document.querySelector("#caseDetailsModal");
const form = document.querySelector("#caseForm");

const openCaseButtons = [
    document.querySelector("#openCaseModal"),
    document.querySelector("#addCaseButton")
].filter(Boolean);

const closeModalButton = document.querySelector("#closeModal");
const cancelModalButton = document.querySelector("#cancelModal");
const closeDetailModalButton = document.querySelector("[data-close-detail-modal]");

let casesCache = [];
let editCaseId = null;

const casesCollection = collection(db, "cases");

/* =========================
   FIRESTORE
========================= */

const loadCases = async () => {
    try {
        const snapshot = await getDocs(
            query(casesCollection, orderBy("createdAt", "desc"))
        );

        casesCache = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));
    } catch (error) {
        // Supports documents created before createdAt was added.
        try {
            const snapshot = await getDocs(casesCollection);

            casesCache = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));
        } catch (fallbackError) {
            console.error("Failed to load cases:", fallbackError);
            casesCache = [];
        }
    }

    renderCaseTable();
};

const getCases = () => casesCache;

const saveNewCase = async caseData => {
    const docRef = await addDoc(casesCollection, {
        ...caseData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return docRef.id;
};

const updateExistingCase = async (caseId, caseData) => {
    await updateDoc(doc(db, "cases", caseId), {
        ...caseData,
        updatedAt: serverTimestamp()
    });
};

/* =========================
   HELPERS
========================= */

const getRegistrationDateValue = caseItem =>
    caseItem?.registrationDate ||
    caseItem?.putInCourtDate ||
    "";

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

const isWithinRange = (dateValue, range) => {
    if (!dateValue || !range || range === "all") return true;

    const date = new Date(`${dateValue}T00:00:00`);
    const bounds = getPcCaseRange(range);

    return date >= bounds.start && date <= bounds.end;
};

const getCaseStatusBucket = status => {
    const s = String(status || "").trim();

    if (s === "Disposed") return "closed";
    if (s === "Cancellation") return "warning";
    if (["UI", "UT", "Untrace"].includes(s)) return "pending";

    return "active";
};

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
            isLight ? "Switch to dark theme" : "Switch to light theme"
        );
        themeToggle.setAttribute("aria-pressed", String(isLight));
    }
};

applyTheme(savedTheme);

themeToggle?.addEventListener("click", () => {
    const nextTheme =
        document.body.classList.contains("light-theme")
            ? "dark"
            : "light";

    localStorage.setItem("caseTrackTheme", nextTheme);
    applyTheme(nextTheme);
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

const getWitnessEntries = value =>
    String(value || "")
        .split(/\r?\n/)
        .map(line =>
            String(line || "")
                .replace(/^\d+\.\s*/, "")
                .trim()
        )
        .filter(Boolean);

const syncWitnessBalance = () => {
    if (!form) return;

    const totalField = form.elements.namedItem("totalWitness");
    const examinedField = form.elements.namedItem("witnessExamined");
    const leftField = form.elements.namedItem("witnessLeft");

    if (!totalField || !examinedField || !leftField) return;

    const total = Number.parseInt(String(totalField.value || ""), 10);
    const examined = Number.parseInt(String(examinedField.value || ""), 10);

    const safeTotal = Number.isFinite(total) ? total : 0;
    const safeExamined = Number.isFinite(examined) ? examined : 0;

    leftField.value = String(Math.max(safeTotal - safeExamined, 0));
};

const syncWitnessCounter = () => {
    if (!form) return;

    const witnessNamesField = form.elements.namedItem("witnessNames");
    const totalWitnessField = form.elements.namedItem("totalWitness");

    if (!witnessNamesField || !totalWitnessField) return;

    totalWitnessField.value = String(
        getWitnessEntries(witnessNamesField.value).length
    );

    syncWitnessBalance();
};

const syncListCounter = (fieldName, defaultValue = "1. ") => {
    if (!form) return;

    const field = form.elements.namedItem(fieldName);
    const badge = document.querySelector(
        `[data-counter-for="${fieldName}"]`
    );

    if (!field || !badge) return;

    const update = () => {
        badge.textContent = String(getWitnessEntries(field.value).length);
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
            const nextNumber =
                getWitnessEntries(currentValue).length + 1;

            field.value =
                `${currentValue}${currentValue && !currentValue.endsWith("\n") ? "\n" : ""}${nextNumber}. `;

            const end = field.value.length;
            field.setSelectionRange?.(end, end);

            update();

            if (fieldName === "witnessNames") {
                syncWitnessCounter();
            }

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
   MODALS
========================= */

const openModal = (caseItem = null) => {
    if (!modal || !form) return;

    editCaseId = caseItem?.id || null;

    form.reset();

    const title = document.querySelector("#modalTitle");

    if (title) {
        title.textContent = editCaseId ? "Edit Case" : "Add New Case";
    }

    if (caseItem) {
        Object.entries(caseItem).forEach(([key, value]) => {
            if (key === "id" || key === "createdAt" || key === "updatedAt") {
                return;
            }

            const field = form.elements.namedItem(key);

            if (field) {
                field.value = value ?? "";
            }
        });
    }

    syncFirYearFromDate();
    syncWitnessCounter();
    syncWitnessBalance();

    modal.classList.add("show");
    document.body.style.overflow = "hidden";
};

const closeModal = () => {
    if (!modal) return;

    modal.classList.remove("show");
    document.body.style.overflow = "";

    editCaseId = null;

    const title = document.querySelector("#modalTitle");
    if (title) title.textContent = "Add New Case";

    form?.reset();
};

openCaseButtons.forEach(button => {
    button.addEventListener("click", () => openModal());
});

closeModalButton?.addEventListener("click", closeModal);
cancelModalButton?.addEventListener("click", closeModal);

modal?.addEventListener("click", event => {
    if (event.target === modal) closeModal();
});

/* =========================
   DETAIL MODAL
========================= */

const closeDetailModal = () => {
    if (!detailsModal) return;

    detailsModal.classList.remove("show");
    detailsModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
};

const openDetailModal = caseItem => {
    if (!detailsModal) return;

    const firLabel = document.querySelector("#detailFIRLabel");
    const badge = document.querySelector("#detailStatusBadge");
    const detailFields = document.querySelector("#caseDetailFields");

    if (!firLabel || !badge || !detailFields) return;

    const dates = [
        ["Date of FIR", caseItem.firDate],
        ["Registration Date", getRegistrationDateValue(caseItem)],
        ["Date of Charge", caseItem.dateOfCharge],
        ["Date of Decision", caseItem.dateOfDecision],
        ["Chargesheet Date", caseItem.chargesheetDate],
        ["Incident Date", caseItem.incidentDate]
    ].filter(([, value]) => value);

    const timelineValue = [
        caseItem.nextDate
            ? new Date(`${caseItem.nextDate}T00:00:00`).toLocaleDateString(
                "en-GB",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            )
            : "",
        caseItem.caseStage || ""
    ]
        .filter(Boolean)
        .join(" - ");

    const generalFields = [
        ["Under Section", caseItem.underSection],
        ["Police Station", caseItem.policeStation],
        ["Court Type", caseItem.courtType],
        ["In the court of", caseItem.courtNumber],
        ["Registration No.", caseItem.registrationNo],
        ["Investigating Officer", caseItem.nameOfIO],
        ["IO Rank", caseItem.ioRank],
        ["Complainant Name", caseItem.complainantName],
        ["Contact Number", caseItem.complainantContact],
        ["Incident Place", caseItem.incidentPlace],
        ["Accused", caseItem.accused],
        [
            "Witnesses",
            caseItem.witnessNames ||
            (caseItem.totalWitness
                ? `${caseItem.totalWitness} total`
                : "")
        ],
        ["Complainant Address", caseItem.complainantAddress],
        ["Incident Details", caseItem.incidentDetails]
    ].filter(([, value]) => value && value !== "null");

    firLabel.textContent =
        `${caseItem.firNo || "—"}/${caseItem.firYear || "—"}`;

    badge.textContent = caseItem.caseStatus || "—";

    const statusStyles = {
        Disposed: {
            color: "#69f2c3",
            border: "rgba(25, 212, 155, 0.35)",
            background: "rgba(25, 212, 155, 0.12)"
        },
        Cancellation: {
            color: "#ff9ca9",
            border: "rgba(255, 88, 109, 0.3)",
            background: "rgba(255, 88, 109, 0.12)"
        }
    };

    const style =
        statusStyles[caseItem.caseStatus] || {
            color: "#c8a8ff",
            border: "rgba(143, 94, 255, 0.3)",
            background: "rgba(143, 94, 255, 0.14)"
        };

    badge.style.color = style.color;
    badge.style.borderColor = style.border;
    badge.style.background = style.background;

    const allFields = [...dates, ...generalFields];

    if (timelineValue) {
        allFields.unshift(["Next Hearing & Stage", timelineValue]);
    }

    detailFields.innerHTML = allFields.length
        ? allFields
            .map(
                ([label, value]) => `
                    <div class="detail-item">
                        <span>${label}</span>
                        <strong>${value}</strong>
                    </div>
                `
            )
            .join("")
        : `
            <div class="detail-item">
                <span>No data</span>
                <strong>No details available for this case.</strong>
            </div>
        `;

    detailsModal.classList.add("show");
    detailsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
};

closeDetailModalButton?.addEventListener("click", closeDetailModal);

detailsModal?.addEventListener("click", event => {
    if (event.target === detailsModal) {
        closeDetailModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    if (modal?.classList.contains("show")) {
        closeModal();
    } else if (detailsModal?.classList.contains("show")) {
        closeDetailModal();
    }
});

/* =========================
   FILTER + SORT
========================= */

const filterByStatus = (filter, rows) => {
    rows.forEach(row => {
        const matches =
            filter === "all" ||
            row.dataset.status === filter;

        row.style.display = matches ? "" : "none";
    });
};

let currentSort = {
    key: "firNo",
    direction: "asc"
};

const normalizeFirNumber = value => {
    const digits = String(value ?? "").replace(/[^0-9]/g, "");
    const numeric = Number(digits);

    return Number.isFinite(numeric) ? numeric : 0;
};

const getSortValue = (caseItem, key) => {
    switch (key) {
        case "firNo":
            return normalizeFirNumber(caseItem.firNo);

        case "firDate":
            return caseItem.firDate
                ? new Date(`${caseItem.firDate}T00:00:00`).getTime()
                : 0;

        case "underSection":
            return String(caseItem.underSection || "").toLowerCase();

        case "courtNumber":
            return String(
                caseItem.courtNumber ||
                caseItem.courtType ||
                ""
            ).toLowerCase();

        case "nextDate":
            return caseItem.nextDate
                ? new Date(`${caseItem.nextDate}T00:00:00`).getTime()
                : 0;

        case "caseStage":
            return String(caseItem.caseStage || "").toLowerCase();

        default:
            return "";
    }
};

const sortCases = (cases, key, direction) => {
    const sorted = [...cases];

    sorted.sort((a, b) => {
        const left = getSortValue(a, key);
        const right = getSortValue(b, key);

        if (
            typeof left === "string" &&
            typeof right === "string"
        ) {
            const result = left.localeCompare(right);
            return direction === "asc" ? result : -result;
        }

        const result =
            left > right ? 1 :
            left < right ? -1 :
            0;

        return direction === "asc" ? result : -result;
    });

    return sorted;
};

const updateSortIndicators = () => {
    document
        .querySelectorAll(".cases-table .sortable")
        .forEach(header => {
            const key = header.dataset.sort;
            const isActive = key === currentSort.key;

            header.dataset.direction = isActive
                ? currentSort.direction
                : "none";

            const originalText =
                header.textContent.replace(/\s[↑↓]$/, "");

            header.textContent =
                originalText +
                (
                    isActive
                        ? currentSort.direction === "asc"
                            ? " ↑"
                            : " ↓"
                        : ""
                );
        });
};

/* =========================
   TABLE
========================= */

const renderCaseTable = () => {
    const tbody = document.querySelector("#casesTableBody");
    if (!tbody) return;

    const params = new URLSearchParams(window.location.search);
    const range = params.get("range") || "all";

    let cases = getCases().filter(caseItem =>
        isWithinRange(
            getRegistrationDateValue(caseItem),
            range
        )
    );

    cases = sortCases(
        cases,
        currentSort.key,
        currentSort.direction
    );

    tbody.innerHTML = cases.length
        ? cases
            .map(caseItem => {
                const statusBucket =
                    getCaseStatusBucket(caseItem.caseStatus);

                const caseId =
                    `${caseItem.firNo || "—"}/${caseItem.firYear || "—"}`;

                const firDate = caseItem.firDate
                    ? new Date(
                        `${caseItem.firDate}T00:00:00`
                    ).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    })
                    : "—";

                const nextDate = caseItem.nextDate
                    ? new Date(
                        `${caseItem.nextDate}T00:00:00`
                    ).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    })
                    : "—";

                return `
                    <tr
                        class="case-row-data"
                        data-status="${statusBucket}"
                        data-id="${caseItem.id}"
                    >
                        <td>
                            <span class="case-id">${caseId}</span>
                        </td>
                        <td>${firDate}</td>
                        <td>${caseItem.underSection || "—"}</td>
                        <td>${caseItem.courtNumber || caseItem.courtType || "—"}</td>
                        <td>${nextDate}</td>
                        <td>${caseItem.caseStage || "—"}</td>
                        <td class="case-actions">
                            <button
                                class="icon-btn"
                                type="button"
                                aria-label="View case"
                                data-action="view"
                            >↗</button>

                            <button
                                class="icon-btn edit-case-btn"
                                type="button"
                                aria-label="Edit case"
                                data-action="edit"
                            >✎</button>
                        </td>
                    </tr>
                `;
            })
            .join("")
        : `
            <tr>
                <td colspan="7" class="table-empty">
                    No cases found for the selected range.
                </td>
            </tr>
        `;

    tbody.querySelectorAll(".case-row-data").forEach(row => {
        const caseItem = getCases().find(
            item => item.id === row.dataset.id
        );

        if (!caseItem) return;

        row.addEventListener("click", event => {
            if (event.target.closest(".icon-btn")) return;
            openDetailModal(caseItem);
        });

        row
            .querySelector('[data-action="view"]')
            ?.addEventListener("click", event => {
                event.stopPropagation();
                openDetailModal(caseItem);
            });

        row
            .querySelector('[data-action="edit"]')
            ?.addEventListener("click", event => {
                event.stopPropagation();
                openModal(caseItem);
            });
    });

    const activeFilter =
        document.querySelector(".case-filter.active");

    filterByStatus(
        activeFilter?.dataset.filter || "all",
        tbody.querySelectorAll(".case-row-data")
    );
};

/* =========================
   FORM SUBMIT -> FIRESTORE
========================= */

form?.addEventListener("submit", async event => {
    event.preventDefault();

    const saveButton =
        form.querySelector('button[type="submit"]');

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
    }

    try {
        syncFirYearFromDate();
        syncWitnessCounter();
        syncWitnessBalance();

        const rawData =
            Object.fromEntries(new FormData(form));

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

        if (editCaseId) {
            await updateExistingCase(editCaseId, caseData);

            const index =
                casesCache.findIndex(item =>
                    item.id === editCaseId
                );

            if (index !== -1) {
                casesCache[index] = {
                    ...casesCache[index],
                    ...caseData
                };
            }

            console.log(
                "Case updated successfully!",
                editCaseId
            );
        } else {
            const documentId =
                await saveNewCase(caseData);

            casesCache.unshift({
                id: documentId,
                ...caseData
            });

            console.log(
                "Case saved successfully!",
                documentId
            );
        }

        closeModal();
        renderCaseTable();

    } catch (error) {
        console.error(
            "Failed to save case:",
            error
        );

        alert(`Case save failed: ${error.message}`);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Save Case";
        }
    }
});

/* =========================
   SEARCH
========================= */

document
    .querySelector("#caseSearch")
    ?.addEventListener("input", event => {
        const q =
            event.target.value.trim().toLowerCase();

        document
            .querySelectorAll(".case-row-data")
            .forEach(row => {
                row.style.display =
                    !q ||
                    row.textContent
                        .toLowerCase()
                        .includes(q)
                        ? ""
                        : "none";
            });
    });

/* =========================
   STATUS FILTERS
========================= */

document
    .querySelectorAll(".case-filter")
    .forEach(button => {
        button.addEventListener("click", () => {
            document
                .querySelectorAll(".case-filter")
                .forEach(btn =>
                    btn.classList.toggle(
                        "active",
                        btn === button
                    )
                );

            filterByStatus(
                button.dataset.filter,
                document.querySelectorAll(
                    ".case-row-data"
                )
            );
        });
    });

/* =========================
   SORTING
========================= */

document
    .querySelectorAll(".cases-table .sortable")
    .forEach(header => {
        header.addEventListener("click", () => {
            const nextKey = header.dataset.sort;
            if (!nextKey) return;

            if (currentSort.key === nextKey) {
                currentSort.direction =
                    currentSort.direction === "asc"
                        ? "desc"
                        : "asc";
            } else {
                currentSort.key = nextKey;
                currentSort.direction = "asc";
            }

            updateSortIndicators();
            renderCaseTable();
        });
    });

/* =========================
   INITIALIZE
========================= */

const init = async () => {
    syncListCounter("witnessNames");
    syncListCounter("accused");

    const totalWitnessField =
        form?.elements.namedItem("totalWitness");

    const witnessExaminedField =
        form?.elements.namedItem("witnessExamined");

    totalWitnessField?.addEventListener(
        "input",
        syncWitnessBalance
    );

    witnessExaminedField?.addEventListener(
        "input",
        syncWitnessBalance
    );

    form?.addEventListener("reset", () => {
        setTimeout(() => {
            const accusedField =
                form.elements.namedItem("accused");

            const witnessNamesField =
                form.elements.namedItem("witnessNames");

            if (
                accusedField &&
                !String(accusedField.value || "").trim()
            ) {
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

    updateSortIndicators();

    await loadCases();

    document
        .querySelector("#firDate")
        ?.addEventListener("click", function () {
            this.showPicker?.();
        });
};

init();
