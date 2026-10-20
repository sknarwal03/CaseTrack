import { auth } from "@config/firebase-config.js";
import { getIdToken } from "firebase/auth";
import { functionsEndpoint } from "./firebase-functions.js";

const USERS_ENDPOINT = functionsEndpoint("listUserRoles");

export async function isActiveAdmin(user) {
    if (!user || typeof user.uid !== "string" || !user.uid.trim()) return false;

    const token = await getIdToken(user);
    const response = await fetch(USERS_ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) throw new Error(`Admin access verification failed (${response.status}).`);
    return true;
}
