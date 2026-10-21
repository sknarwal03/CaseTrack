import { auth } from "@config/firebase-config.js";
import { getIdToken, onAuthStateChanged } from "firebase/auth";
import { functionsEndpoint } from "./firebase-functions.js";
import { showOperatorTemporaryCredentials } from "./operator-credentials.js";

const STATIONS_ENDPOINT = functionsEndpoint("policeStations");
const CREATE_OPERATOR_ENDPOINT = functionsEndpoint("createOperator");
const REQUEST_STORAGE_KEY = "caseTrackPendingOperatorRequest";

const form = document.getElementById("operatorForm");
const emailInput = document.getElementById("operatorEmail");
const stationSelect = document.getElementById("operatorPoliceStation");
const createButton = document.getElementById("operatorCreate");
const status = document.getElementById("operatorStatus");
const resetRequestButton = document.getElementById("operatorResetRequest");

let activeUser = null;
let sessionGeneration = 0;
let requestInProgress = false;
let stationsLoaded = false;

function setStatus(message) {
    status.textContent = message;
}

function canCreateOperator() {
    return Boolean(activeUser && stationsLoaded && stationSelect.options.length > 1);
}

function isCurrentSession(user, generation) {
    return generation === sessionGeneration && activeUser?.uid === user.uid
        && auth.currentUser?.uid === user.uid;
}

function getSavedRequest() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(REQUEST_STORAGE_KEY) || "null");
        return saved && typeof saved.email === "string" && typeof saved.policeStationId === "string"
            && typeof saved.requestId === "string" ? saved : null;
    } catch {
        return null;
    }
}

function requestIdFor(email, policeStationId) {
    const saved = getSavedRequest();
    if (saved?.email === email && saved.policeStationId === policeStationId) return saved.requestId;
    const requestId = crypto.randomUUID();
    sessionStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify({ email, policeStationId, requestId }));
    return requestId;
}

async function authorizedFetch(user, generation, url, options = {}) {
    const token = await getIdToken(user);
    if (!isCurrentSession(user, generation)) return null;
    const response = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` }
    });
    if (!isCurrentSession(user, generation)) return null;
    return response;
}

async function loadStationOptions(user, generation) {
    stationsLoaded = false;
    createButton.disabled = true;
    stationSelect.replaceChildren(new Option("Loading police stations…", ""));
    try {
        const response = await authorizedFetch(user, generation, STATIONS_ENDPOINT);
        if (!response || !isCurrentSession(user, generation)) return;
        if (response.status === 401) throw new Error("Sign in again to create an Operator.");
        if (response.status === 403) throw new Error("An active admin account is required to create an Operator.");
        if (!response.ok) throw new Error("Police stations could not be loaded. Check connectivity and retry.");
        const payload = await response.json();
        if (!Array.isArray(payload?.stations) || payload.stations.some(station =>
            !station || typeof station.id !== "string" || typeof station.name !== "string")) {
            throw new Error("The Police Station service returned an invalid response.");
        }

        stationSelect.replaceChildren(new Option("Select a police station", ""));
        for (const station of payload.stations) {
            stationSelect.add(new Option(station.name, station.id));
        }
        stationsLoaded = true;
        createButton.disabled = !activeUser || payload.stations.length === 0;
        setStatus(payload.stations.length
            ? "Select one existing police station."
            : "Create a police station in Police Station Master before creating an Operator.");
    } catch (error) {
        if (!isCurrentSession(user, generation)) return;
        stationSelect.replaceChildren(new Option("Police stations unavailable", ""));
        setStatus(error?.message || "Police stations could not be loaded.");
    }
}

form.addEventListener("input", () => {
    createButton.disabled = requestInProgress || !canCreateOperator();
    resetRequestButton.hidden = true;
});

resetRequestButton.addEventListener("click", () => {
    sessionStorage.removeItem(REQUEST_STORAGE_KEY);
    resetRequestButton.hidden = true;
    setStatus("A new request ID will be used for the next submission. Retry only after reviewing the previous request status.");
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!activeUser || requestInProgress || !stationsLoaded) return;

    const user = activeUser;
    const generation = sessionGeneration;
    const email = emailInput.value.trim().toLowerCase();
    const policeStationId = stationSelect.value;
    if (!emailInput.validity.valid || !policeStationId) {
        setStatus("Enter a valid email and select one police station.");
        return;
    }

    let requestId;
    try {
        requestId = requestIdFor(email, policeStationId);
    } catch {
        setStatus("A local request ID could not be saved. Enable session storage and retry.");
        return;
    }

    requestInProgress = true;
    createButton.disabled = true;
    resetRequestButton.hidden = true;
    setStatus("Creating Operator credentials…");
    try {
        const response = await authorizedFetch(user, generation, CREATE_OPERATOR_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": requestId
            },
            body: JSON.stringify({ email, policeStationId, requestId })
        });
        if (!response || !isCurrentSession(user, generation)) return;
        const payload = await response.json().catch(() => ({}));
        if (response.status === 400 || response.status === 401 || response.status === 403
            || response.status === 409) {
            const message = typeof payload.error === "string" ? payload.error : "The Operator request was rejected.";
            setStatus(message);
            resetRequestButton.hidden = !message.includes("already used with different inputs");
            return;
        }
        if (!response.ok) {
            setStatus(payload.error || "Operator creation is incomplete. Retry with the same inputs and request ID.");
            return;
        }

        if (!payload?.operator || typeof payload.operator.uid !== "string"
            || payload.operator.email !== email
            || payload.operator.role !== "operator" || payload.operator.status !== "active"
            || payload.operator.policeStationId !== policeStationId
            || payload.operator.mustChangePassword !== true
            || typeof payload.temporaryPassword !== "string" || payload.temporaryPassword.length < 12) {
            setStatus("The service did not confirm the Operator credentials. Check Users before retrying.");
            return;
        }

        const selectedStationName = stationSelect.selectedOptions[0]?.textContent || policeStationId;
        sessionStorage.removeItem(REQUEST_STORAGE_KEY);
        form.reset();
        stationSelect.value = "";
        setStatus(`Created Operator login ${email}, assigned ${selectedStationName}. Copy the temporary password from the credentials dialog.`);
        showOperatorTemporaryCredentials({
            email,
            operatorUid: payload.operator.uid,
            temporaryPassword: payload.temporaryPassword
        });
        window.dispatchEvent(new CustomEvent("caseTrackOperatorCreated", {
            detail: { uid: payload.operator.uid, policeStationId }
        }));
    } catch (error) {
        if (!isCurrentSession(user, generation)) return;
        setStatus("The request outcome is unknown. Retry with the same inputs so the service can resume safely.");
    } finally {
        if (isCurrentSession(user, generation)) {
            requestInProgress = false;
            createButton.disabled = !canCreateOperator();
        }
    }
});

window.addEventListener("caseTrackPoliceStationsChanged", () => {
    if (activeUser) void loadStationOptions(activeUser, sessionGeneration);
});

onAuthStateChanged(auth, user => {
    sessionGeneration += 1;
    activeUser = user;
    requestInProgress = false;
    stationsLoaded = false;
    createButton.disabled = true;
    resetRequestButton.hidden = true;
    stationSelect.replaceChildren(new Option("Sign in to load police stations", ""));
    if (!user) {
        setStatus("Sign in with an active admin account to create an Operator.");
        return;
    }
    void loadStationOptions(user, sessionGeneration);
});
