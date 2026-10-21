import { auth } from "@config/firebase-config.js";
import { getIdToken, onAuthStateChanged } from "firebase/auth";
import { functionsEndpoint } from "./firebase-functions.js";
import { showOperatorTemporaryCredentials } from "./operator-credentials.js";

const USERS_ENDPOINT = functionsEndpoint("listUserRoles");
const STATIONS_ENDPOINT = functionsEndpoint("policeStations");
const ROLE_TRANSITION_ENDPOINT = functionsEndpoint("manageUserRole");
const RESET_OPERATOR_PASSWORD_ENDPOINT = functionsEndpoint("resetOperatorPassword");
const PAGE_SIZE = 50;
const PENDING_TRANSITIONS_KEY = "caseTrackPendingRoleTransitions";

const adminContent = document.getElementById("adminPanelContent");
const accessStatus = document.getElementById("adminPanelAccessStatus");
const usersTableBody = document.getElementById("adminUsersTableBody");
const usersStatus = document.getElementById("adminUsersStatus");
const loadMoreButton = document.getElementById("adminUsersLoadMore");
const retryButton = document.getElementById("adminUsersRetry");
const refreshButton = document.getElementById("adminUsersRefresh");
const accessRetryButton = document.getElementById("adminPanelAccessRetry");
const roleDialog = document.getElementById("roleManagementDialog");
const roleForm = document.getElementById("roleManagementForm");
const roleActionSelect = document.getElementById("roleManagementAction");
const roleStationField = document.getElementById("roleManagementStationField");
const roleStationSelect = document.getElementById("roleManagementStation");
const roleReason = document.getElementById("roleManagementReason");
const roleTarget = document.getElementById("roleManagementTarget");
const roleStatus = document.getElementById("roleManagementStatus");
const roleSubmitButton = document.getElementById("roleManagementSubmit");
const roleCancelButton = document.getElementById("roleManagementCancel");

let activeUser = null;
let sessionGeneration = 0;
let pageToken = null;
let hasMore = false;
let requestInProgress = false;
let loadMoreRequested = false;
let loadedRecordCount = 0;
let refreshRequested = false;
let stationsForTransitions = null;
let selectedRecord = null;
let transitionInProgress = false;
let pendingTransition = null;

function setUsersStatus(message, { showRetry = false, loading = false } = {}) {
    usersStatus.textContent = message;
    retryButton.hidden = !showRetry;
    retryButton.disabled = loading;
    loadMoreButton.disabled = loading || requestInProgress;
    refreshButton.disabled = loading || requestInProgress;
    loadMoreButton.hidden = showRetry || !hasMore;
}

function renderMessageRow(message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "case-meta";
    cell.textContent = message;
    row.appendChild(cell);
    usersTableBody.appendChild(row);
}

function appendUserRecords(records) {
    const fragment = document.createDocumentFragment();
    for (const record of records) {
        const row = document.createElement("tr");
        const displayStatus = record.status === "active" && record.mustChangePassword === true
            ? "active · temporary password"
            : record.status;
        for (const value of [record.uid, record.role, displayStatus, record.policeStationId]) {
            const cell = document.createElement("td");
            cell.textContent = value === null || value === undefined || value === ""
                ? "—"
                : String(value);
            row.appendChild(cell);
        }
        const actionCell = document.createElement("td");
        const canManage = record.uid !== activeUser?.uid
            && ["admin", "operator"].includes(record.role)
            && ["active", "revoked"].includes(record.status);
        if (canManage) {
            const manageButton = document.createElement("button");
            manageButton.type = "button";
            manageButton.className = "po-filter admin-user-manage";
            manageButton.textContent = "Manage";
            manageButton.setAttribute("aria-label", `Manage account ${record.uid}`);
            manageButton.addEventListener("click", () => void openRoleDialog(record));
            actionCell.appendChild(manageButton);
            if (record.role === "operator" && record.status === "active") {
                const resetButton = document.createElement("button");
                resetButton.type = "button";
                resetButton.className = "po-filter admin-user-manage";
                resetButton.textContent = "Reset temporary password";
                resetButton.setAttribute("aria-label", `Reset temporary password for ${record.uid}`);
                resetButton.addEventListener("click", () => void resetOperatorPassword(record.uid, resetButton));
                actionCell.appendChild(resetButton);
            }
        } else {
            actionCell.textContent = record.uid === activeUser?.uid ? "Current account" : "—";
        }
        row.appendChild(actionCell);
        fragment.appendChild(row);
    }
    usersTableBody.appendChild(fragment);
}

async function resetOperatorPassword(uid, button) {
    if (!activeUser || button.disabled) return;
    button.disabled = true;
    const priorText = button.textContent;
    button.textContent = "Resetting…";
    try {
        const token = await getIdToken(activeUser);
        const response = await fetch(RESET_OPERATOR_PASSWORD_ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ uid })
        });
        if (response.status === 401) throw new Error("Session expired. Sign in again.");
        if (response.status === 403) throw new Error("Only an active Admin can reset an Operator password.");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.operator?.uid !== uid
            || typeof payload.operator.email !== "string"
            || typeof payload.temporaryPassword !== "string") {
            throw new Error(payload.error || "A temporary password could not be issued. Retry later.");
        }
        showOperatorTemporaryCredentials({
            email: payload.operator.email,
            operatorUid: uid,
            temporaryPassword: payload.temporaryPassword
        });
        usersStatus.textContent = "Temporary password issued. Copy it from the credentials dialog and share it privately.";
    } catch (error) {
        usersStatus.textContent = error.message || "A temporary password could not be issued.";
    } finally {
        button.disabled = false;
        button.textContent = priorText;
    }
}

function roleActionsFor(record) {
    if (record.status === "revoked") return [["reactivate", "Reactivate account"]];
    if (record.status !== "active") return [];
    if (record.role === "operator") {
        return [["promote", "Promote to Admin"], ["revoke", "Revoke access"]];
    }
    if (record.role === "admin") {
        return [["demote", "Demote to Operator"], ["revoke", "Revoke access"]];
    }
    return [];
}

async function loadStationsForTransitions() {
    if (stationsForTransitions) return stationsForTransitions;
    if (!activeUser) throw new Error("authentication-required");
    const token = await getIdToken(activeUser);
    if (!isCurrentSession(activeUser, sessionGeneration)) return [];
    const response = await fetch(STATIONS_ENDPOINT, {
        method: "GET",
        headers: { Authorization: "Bearer ".concat(token) }
    });
    if (!isCurrentSession(activeUser, sessionGeneration)) return [];
    if (!response.ok) throw new Error(`station-list-http-${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.stations) || payload.stations.some(station =>
        !station || typeof station.id !== "string" || typeof station.name !== "string")) {
        throw new Error("invalid-station-response");
    }
    stationsForTransitions = payload.stations;
    return stationsForTransitions;
}

async function openRoleDialog(record) {
    selectedRecord = record;
    pendingTransition = null;
    roleTarget.textContent = `${record.uid} — ${record.role}, ${record.status}`;
    roleStatus.textContent = "";
    roleReason.value = "";
    roleActionSelect.replaceChildren(new Option("Select an action", ""));
    for (const [value, label] of roleActionsFor(record)) {
        roleActionSelect.add(new Option(label, value));
    }
    roleStationSelect.replaceChildren(new Option("Loading police stations…", ""));
    roleStationField.hidden = true;
    roleStationSelect.required = false;
    roleSubmitButton.disabled = false;
    roleDialog.showModal();

    if (record.role === "admin" && record.status === "active") {
        try {
            const stations = await loadStationsForTransitions();
            if (selectedRecord?.uid !== record.uid) return;
            roleStationSelect.replaceChildren(new Option("Select a police station", ""));
            for (const station of stations) {
                roleStationSelect.add(new Option(station.name, station.id));
            }
        } catch {
            if (selectedRecord?.uid === record.uid) {
                roleStatus.textContent = "Police stations could not be loaded; Admin demotion is unavailable until the local endpoint recovers.";
            }
        }
    }
}

function getSavedTransition(signature) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_TRANSITIONS_KEY) || "{}");
        const requestId = saved?.[signature];
        return typeof requestId === "string" ? requestId : null;
    } catch (error) {
        console.error("Could not read the pending role transition:", error?.name || "unknown");
        return null;
    }
}

function saveTransitionRequest(signature, requestId) {
    let saved = {};
    try {
        const parsed = JSON.parse(sessionStorage.getItem(PENDING_TRANSITIONS_KEY) || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
        saved[signature] = requestId;
        sessionStorage.setItem(PENDING_TRANSITIONS_KEY, JSON.stringify(saved));
        return true;
    } catch (error) {
        console.error("Could not persist the pending role transition:", error?.name || "unknown");
        return false;
    }
}

function clearTransitionRequest(signature) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_TRANSITIONS_KEY) || "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
        delete saved[signature];
        sessionStorage.setItem(PENDING_TRANSITIONS_KEY, JSON.stringify(saved));
    } catch (error) {
        console.error("Could not clear the completed role transition:", error?.name || "unknown");
    }
}

function updateRoleActionControls() {
    const needsStation = roleActionSelect.value === "demote";
    roleStationField.hidden = !needsStation;
    roleStationSelect.required = needsStation;
    roleSubmitButton.disabled = transitionInProgress;
}

async function submitRoleTransition(event) {
    event.preventDefault();
    if (!selectedRecord || !activeUser || transitionInProgress) return;

    const action = roleActionSelect.value;
    const reason = roleReason.value.normalize("NFC").trim();
    const policeStationId = action === "demote" ? roleStationSelect.value : "";
    if (!action || !reason || Array.from(reason).length > 500 || (action === "demote" && !policeStationId)) {
        roleStatus.textContent = "Choose an action, enter a reason of 1 to 500 characters, and select a station when demoting to Operator.";
        return;
    }
    if (action === "revoke" && !window.confirm(`Revoke access for ${selectedRecord.uid}? The role record will be retained.`)) {
        return;
    }

    const signature = JSON.stringify([selectedRecord.uid, action, reason, policeStationId]);
    if (pendingTransition?.signature !== signature) {
        pendingTransition = {
            signature,
            requestId: getSavedTransition(signature) || crypto.randomUUID()
        };
        if (!saveTransitionRequest(signature, pendingTransition.requestId)) {
            roleStatus.textContent = "The request ID could not be saved for a safe retry. Enable session storage and retry.";
            pendingTransition = null;
            return;
        }
    }
    const requestId = pendingTransition.requestId;
    const body = {
        action,
        targetUid: selectedRecord.uid,
        reason,
        requestId,
        ...(action === "demote" ? { policeStationId } : {})
    };
    const user = activeUser;
    const generation = sessionGeneration;
    transitionInProgress = true;
    roleSubmitButton.disabled = true;
    roleCancelButton.disabled = true;
    roleStatus.textContent = "Applying the server-authorized role change…";

    try {
        const send = async forceRefresh => {
            const token = await getIdToken(user, forceRefresh);
            if (!isCurrentSession(user, generation)) return null;
            return fetch(ROLE_TRANSITION_ENDPOINT, {
                method: "POST",
                headers: {
                    Authorization: "Bearer ".concat(token),
                    "Content-Type": "application/json",
                    "Idempotency-Key": requestId
                },
                body: JSON.stringify(body)
            });
        };
        let response = await send(false);
        if (!response || !isCurrentSession(user, generation)) return;
        if (response.status === 401) response = await send(true);
        if (!response || !isCurrentSession(user, generation)) return;

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            roleStatus.textContent = typeof payload.error === "string"
                ? payload.error
                : "The role change was rejected. Review the current account state and retry if appropriate.";
            if (response.status === 401) roleStatus.textContent = "Your session could not be authenticated. Sign in again.";
            if (response.status === 403) roleStatus.textContent = payload.error || "An active Admin account is required.";
            if (response.status === 503) roleStatus.textContent = `${payload.error || "The transition outcome is incomplete."} Retry this same request before starting a different transition.`;
            if (response.status === 409) void refreshUsers();
            return;
        }
        const expected = {
            promote: { role: "admin", status: "active", policeStationId: null },
            demote: { role: "operator", status: "active", policeStationId },
            revoke: { role: selectedRecord.role, status: "revoked", policeStationId: selectedRecord.policeStationId },
            reactivate: { role: selectedRecord.role, status: "active", policeStationId: selectedRecord.policeStationId }
        }[action];
        if (!payload?.user || payload.user.uid !== selectedRecord.uid
            || payload.user.role !== expected.role || payload.user.status !== expected.status
            || (payload.user.policeStationId || null) !== (expected.policeStationId || null)) {
            roleStatus.textContent = "The endpoint response did not confirm the requested account state. Retry this same request and verify the Users list.";
            return;
        }

        clearTransitionRequest(signature);
        pendingTransition = null;
        roleStatus.textContent = `${selectedRecord.uid} is now ${payload.user.status} ${payload.user.role}.`;
        roleDialog.close();
        void refreshUsers();
    } catch (error) {
        console.error("Role transition request failed:", error);
        roleStatus.textContent = "The transition outcome is unknown. Retry with the same inputs and request ID before starting another change.";
    } finally {
        if (isCurrentSession(user, generation)) {
            transitionInProgress = false;
            roleSubmitButton.disabled = false;
            roleCancelButton.disabled = false;
        }
    }
}

function isCurrentSession(user, generation) {
    return generation === sessionGeneration && activeUser?.uid === user.uid
        && auth.currentUser?.uid === user.uid;
}

async function requestUserPage(user, generation, cursor, forceRefresh = false) {
    const token = await getIdToken(user, forceRefresh);
    if (!isCurrentSession(user, generation)) return null;

    const url = new URL(USERS_ENDPOINT);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("pageToken", cursor);

    return fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });
}

async function loadUsersPage({ retry = false } = {}) {
    if (!activeUser || requestInProgress) return;

    const user = activeUser;
    const generation = sessionGeneration;
    const cursor = retry ? pageToken : (loadMoreRequested ? pageToken : null);
    const isNextPage = Boolean(cursor);
    requestInProgress = true;
    loadMoreRequested = false;
    retryButton.disabled = true;
    loadMoreButton.disabled = true;

    if (isNextPage) {
        setUsersStatus("Loading more users…", { loading: true });
    } else {
        usersTableBody.replaceChildren();
        loadedRecordCount = 0;
        setUsersStatus("Loading user role records…", { loading: true });
        renderMessageRow("Loading user role records…");
    }

    try {
        let response;
        try {
            response = await requestUserPage(user, generation, cursor);
        } catch (error) {
            if (!isCurrentSession(user, generation)) return;
            if (error?.code?.startsWith("auth/")) throw new Error("session-token-unavailable");
            throw new Error("endpoint-unavailable");
        }
        if (!isCurrentSession(user, generation)) return;

        if (response.status === 401) {
            try {
                response = await requestUserPage(user, generation, cursor, true);
            } catch (error) {
                if (error?.code?.startsWith("auth/")) throw new Error("session-token-unavailable");
                throw new Error("endpoint-unavailable");
            }
            if (!response || !isCurrentSession(user, generation)) return;
        }

        if (response.status === 403) {
            usersTableBody.replaceChildren();
            pageToken = null;
            hasMore = false;
            loadedRecordCount = 0;
            adminContent.hidden = true;
            accessStatus.textContent = "Access denied. An active admin account is required.";
            accessStatus.hidden = false;
            accessRetryButton.hidden = true;
            return;
        }
        if (response.status === 401) {
            throw new Error("session-unauthorized");
        }
        if (!response.ok) {
            throw new Error(`endpoint-http-${response.status}`);
        }

        const payload = await response.json();
        if (!isCurrentSession(user, generation)) return;
        if (!payload || !Array.isArray(payload.users)
            || !(payload.nextPageToken === null || typeof payload.nextPageToken === "string")
            || payload.users.some(record => !record || typeof record.uid !== "string"
                || !(record.role === null || typeof record.role === "string")
                || !(record.status === null || typeof record.status === "string")
                || !(record.policeStationId === null || typeof record.policeStationId === "string"))) {
            throw new Error("invalid-endpoint-response");
        }

        if (!isNextPage) usersTableBody.replaceChildren();
        appendUserRecords(payload.users);
        adminContent.hidden = false;
        accessStatus.hidden = true;
        accessRetryButton.hidden = true;
        loadedRecordCount += payload.users.length;
        pageToken = payload.nextPageToken;
        hasMore = Boolean(pageToken);

        if (loadedRecordCount === 0 && !hasMore) {
            renderMessageRow("No user-role records were found.");
            setUsersStatus("No user-role records were found.");
        } else {
            setUsersStatus(`Showing ${loadedRecordCount} user-role record${loadedRecordCount === 1 ? "" : "s"}.`);
        }
    } catch (error) {
        if (!isCurrentSession(user, generation)) return;
        console.error("Could not load Admin Panel user records:", error);
        const message = error?.message === "endpoint-unavailable"
            ? "The Users service is unavailable. Check connectivity and retry."
            : error?.message === "session-unauthorized" || error?.message === "session-token-unavailable"
                ? "Your session could not be authenticated. Sign in again, then retry."
                : "User role records could not be loaded. Retry the request.";

        if (!isNextPage) {
            usersTableBody.replaceChildren();
            renderMessageRow(message);
        }
        setUsersStatus(message, { showRetry: true });
        if (adminContent.hidden) {
            accessStatus.textContent = `Admin access could not be verified. ${message}`;
            accessStatus.hidden = false;
            accessRetryButton.hidden = false;
        }
    } finally {
        if (isCurrentSession(user, generation)) {
            requestInProgress = false;
            retryButton.disabled = false;
            loadMoreButton.disabled = false;
            refreshButton.disabled = false;
            loadMoreButton.hidden = retryButton.hidden || !hasMore;
            if (refreshRequested) {
                refreshRequested = false;
                refreshUsers();
            }
        }
    }
}

function resetUsersForSession() {
    pageToken = null;
    hasMore = false;
    loadMoreRequested = false;
    loadedRecordCount = 0;
    requestInProgress = false;
    refreshRequested = false;
    stationsForTransitions = null;
    selectedRecord = null;
    pendingTransition = null;
    transitionInProgress = false;
    if (roleDialog.open) roleDialog.close();
    usersTableBody.replaceChildren();
    setUsersStatus("");
}

retryButton.addEventListener("click", () => {
    void loadUsersPage({ retry: true });
});

function refreshUsers() {
    pageToken = null;
    hasMore = false;
    loadMoreRequested = false;
    if (requestInProgress) {
        refreshRequested = true;
        return;
    }
    refreshRequested = false;
    void loadUsersPage();
}

refreshButton.addEventListener("click", refreshUsers);
window.addEventListener("caseTrackOperatorCreated", refreshUsers);
accessRetryButton.addEventListener("click", () => {
    accessRetryButton.disabled = true;
    void loadUsersPage().finally(() => { accessRetryButton.disabled = false; });
});
roleActionSelect.addEventListener("change", updateRoleActionControls);
roleForm.addEventListener("submit", submitRoleTransition);
roleCancelButton.addEventListener("click", () => roleDialog.close());

loadMoreButton.addEventListener("click", () => {
    if (!hasMore || requestInProgress) return;
    loadMoreRequested = true;
    void loadUsersPage();
});

onAuthStateChanged(auth, user => {
    sessionGeneration += 1;
    activeUser = user;
    resetUsersForSession();
    adminContent.hidden = true;

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    accessStatus.hidden = true;
    adminContent.hidden = true;
    accessStatus.textContent = "Verifying admin access…";
    accessStatus.hidden = false;
    void loadUsersPage();
}, error => {
    sessionGeneration += 1;
    activeUser = null;
    resetUsersForSession();
    console.error("Could not determine signed-in account for Admin Panel:", error);
    adminContent.hidden = true;
    accessStatus.textContent = "Access could not be verified. The Admin Panel is unavailable.";
    accessStatus.hidden = false;
});
