
const fs = require("fs");
let s = fs.readFileSync("assets/css/cases.css", "utf8");

const actionsCSS = `
/* =========================
   ACTION BUTTONS
========================= */
.table-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-start;
}

.cases-table th:last-child,
.cases-table td:last-child {
    min-width: 120px; /* space for view + edit buttons */
    white-space: nowrap;
}

`;

// Append it right before media query
const idx = s.lastIndexOf("@media");
if (idx !== -1) {
    s = s.substring(0, idx) + actionsCSS + s.substring(idx);
} else {
    s += actionsCSS;
}

fs.writeFileSync("assets/css/cases.css", s, "utf8");

