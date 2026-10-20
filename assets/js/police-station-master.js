import { auth } from "@config/firebase-config.js";
import { getIdToken, onAuthStateChanged } from "firebase/auth";
import { functionsEndpoint } from "./firebase-functions.js";

const STATIONS_ENDPOINT = functionsEndpoint("policeStations");

const form = document.getElementById("policeStationForm");
const nameInput = document.getElementById("policeStationName");
const saveButton = document.getElementById("policeStationSave");
const status = document.getElementById("policeStationStatus");
const tableBody = document.getElementById("policeStationTableBody");

let activeUser = null;
let sessionGeneration = 0;
let requestInProgress = false;

function setStatus(message) {
    status.textContent = message;
}

function renderMessage(message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}

function renderStations(stations) {
    tableBody.replaceChildren();
    if (!stations.length) {
        renderMessage("No police stations have been created yet.");
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const station of stations) {
        const row = document.createElement("tr");
        for (const value of [station.id, station.name, station.createdAt]) {
            const cell = document.createElement("td");
            cell.textContent = value || "—";
            row.appendChild(cell);
        }
        fragment.appendChild(row);
    }
    tableBody.appendChild(fragment);
}

function isCurrentSession(user, generation) {
    return generation === sessionGeneration && activeUser?.uid === user.uid
        && auth.currentUser?.uid === user.uid;
}

async function stationRequest(user, generation, method, body) {
    const token = await getIdToken(user);
    if (!isCurrentSession(user, generation)) return null;

    const response = await fetch(STATIONS_ENDPOINT, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!isCurrentSession(user, generation)) return null;
    return response;
}

async function loadStations() {
    if (!activeUser || requestInProgress) return;
    const user = activeUser;
    const generation = sessionGeneration;
    requestInProgress = true;
    saveButton.disabled = true;
    setStatus("Loading police stations…");
    renderMessage("Loading police stations…");

    try {
        const response = await stationRequest(user, generation, "GET");
        if (!response || !isCurrentSession(user, generation)) return;
        if (response.status === 401) throw new Error("sign-in-required");
        if (response.status === 403) throw new Error("admin-required");
        if (!response.ok) throw new Error("list-failed");

        const payload = await response.json();
        if (!Array.isArray(payload?.stations) || payload.stations.some(station =>
            !station || typeof station.id !== "string" || typeof station.name !== "string"
            || !(station.createdAt === null || typeof station.createdAt === "string"))) {
            throw new Error("invalid-response");
        }
        if (!isCurrentSession(user, generation)) return;
        renderStations(payload.stations);
        setStatus(`${payload.stations.length} police station${payload.stations.length === 1 ? "" : "s"}.`);
        return payload.stations.length;
    } catch (error) {
        if (!isCurrentSession(user, generation)) return;
        renderMessage("Police stations could not be loaded.");
        setStatus(error?.message === "admin-required"
            ? "An active admin account is required to manage police stations."
            : error?.message === "sign-in-required"
                ? "Sign in again to manage police stations."
                : "The Police Station service is unavailable. Check connectivity and retry.");
        return null;
    } finally {
        if (isCurrentSession(user, generation)) {
            requestInProgress = false;
            saveButton.disabled = false;
        }
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!activeUser || requestInProgress) return;

    const user = activeUser;
    const generation = sessionGeneration;
    requestInProgress = true;
    saveButton.disabled = true;
    setStatus("Creating police station…");

    try {
        const response = await stationRequest(user, generation, "POST", { name: nameInput.value });
        if (!response || !isCurrentSession(user, generation)) return;
        if (response.status === 400) throw new Error("invalid-name");
        if (response.status === 401) throw new Error("sign-in-required");
        if (response.status === 403) throw new Error("admin-required");
        if (!response.ok) throw new Error("create-failed");

        const payload = await response.json();
        if (!payload?.station || typeof payload.station.id !== "string"
            || typeof payload.station.name !== "string") {
            throw new Error("invalid-response");
        }
        nameInput.value = "";
        setStatus(`Created ${payload.station.name}.`);
        requestInProgress = false;
        window.dispatchEvent(new CustomEvent("caseTrackPoliceStationsChanged", {
            detail: { stationId: payload.station.id }
        }));
        const stationCount = await loadStations();
        if (stationCount !== null && isCurrentSession(user, generation)) {
            setStatus(`Created ${payload.station.name}. ${stationCount} police station${stationCount === 1 ? "" : "s"} available.`);
        }
    } catch (error) {
        if (!isCurrentSession(user, generation)) return;
        setStatus(error?.message === "invalid-name"
            ? "Enter a station name with 1 to 120 characters."
            : error?.message === "admin-required"
                ? "An active admin account is required to manage police stations."
                : error?.message === "sign-in-required"
                    ? "Sign in again to manage police stations."
                    : "The police station could not be created. Retry the request.");
    } finally {
        if (isCurrentSession(user, generation)) {
            requestInProgress = false;
            saveButton.disabled = false;
        }
    }
});

onAuthStateChanged(auth, user => {
    sessionGeneration += 1;
    activeUser = user;
    requestInProgress = false;
    saveButton.disabled = !user;
    tableBody.replaceChildren();

    if (!user) {
        setStatus("Sign in with an active admin account to manage police stations.");
        return;
    }
    void loadStations();
});
