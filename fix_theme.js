
const fs = require("fs");
let s = fs.readFileSync("components/add-case/add-case.css", "utf8");

const startStr1 = "/* =========================================================\r\n   LIGHT THEME OVERRIDES FOR MODAL";
const startStr2 = "/* =========================================================\n   LIGHT THEME OVERRIDES FOR MODAL";

let startIndex = s.indexOf(startStr1);
if (startIndex === -1) startIndex = s.indexOf(startStr2);

const endStr1 = "/* =========================================================\r\n   TOGGLE CONTAINER";
const endStr2 = "/* =========================================================\n   TOGGLE CONTAINER";

let endIndex = s.indexOf(endStr1);
if (endIndex === -1) endIndex = s.indexOf(endStr2);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `/* =========================================================
   FORCE DARK THEME FOR ADD CASE MODAL
========================================================= */
#caseModal,
body.light-theme #caseModal {
    --bg: #091321 !important;
    --surface: #0a1727 !important;
    --surface-2: rgba(14, 28, 48, 0.4) !important;
    --border: #213d5f !important;
    --line: #213d5f !important;
    --text: #f4f7ff !important;
    --muted: #889bb3 !important;
    --primary: #3b82f6 !important;
    color-scheme: dark !important;
}

body.light-theme #caseModal .modal {
    background: linear-gradient(180deg, #10243d, #0d1d30) !important;
    border: 1px solid #294a6d !important;
    color: var(--text) !important;
}

body.light-theme #caseModal .modal-header,
body.light-theme #caseModal .modal-footer {
    border-color: #203953 !important;
}

`;
    s = s.substring(0, startIndex) + replacement + s.substring(endIndex);
}

s = s.replace(/body\.light-theme \.toggle-container \{[\s\S]*?\}/g, "");
s = s.replace(/body\.light-theme \.slider \{[\s\S]*?\}/g, "");
s = s.replace(/body\.light-theme \.slider::before \{[\s\S]*?\}/g, "");
s = s.replace(/body\.light-theme \.switch input:checked\+\.slider \{[\s\S]*?\}/g, "");
s = s.replace(/body\.light-theme \.switch input:checked\+\.slider::before \{[\s\S]*?\}/g, "");
s = s.replace(/\/\* =========================================================\r?\n\s*LIGHT THEME OVERRIDES FOR SWITCH\r?\n========================================================= \*\/\r?\n/g, "");

fs.writeFileSync("components/add-case/add-case.css", s, "utf8");

