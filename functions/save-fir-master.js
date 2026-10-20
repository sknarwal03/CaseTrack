const { createHash } = require("node:crypto");

const FIR_MASTERS = "firMasters";
const IDENTITY_CLAIMS = "firIdentityClaims";
const USER_ROLES = "userRoles";
const POLICE_STATIONS = "policeStations";
const LEGACY_CASES = "cases";

function normalized(value) {
    return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, "").toLowerCase();
}

function identityFrom(data, HttpsError) {
    if (typeof data.firNo !== "string" || typeof data.firYear !== "string"
        || typeof data.policeStationId !== "string") {
        throw new HttpsError("invalid-argument", "FIR identity fields must be strings.");
    }
    const identity = {
        firNo: data.firNo.trim(),
        firYear: data.firYear.trim(),
        policeStation: String(data.policeStation ?? "").trim(),
        policeStationId: data.policeStationId.trim()
    };
    if (!normalized(identity.firNo) || !normalized(identity.firYear)
        || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.policeStationId)) {
        throw new HttpsError(
            "invalid-argument",
            "FIR number, FIR year and stable police station ID are required."
        );
    }
    return identity;
}

function claimIdFor(identity) {
    const tuple = [
        normalized(identity.firNo),
        normalized(identity.firYear),
        identity.policeStationId
    ];
    return createHash("sha256").update(JSON.stringify(tuple), "utf8").digest("hex");
}

function sameIdentity(left, right) {
    return normalized(left.firNo) === normalized(right.firNo)
        && normalized(left.firYear) === normalized(right.firYear)
        && left.policeStationId === right.policeStationId;
}

function matchesIdentity(data, identity) {
    return data && sameIdentity(data, identity);
}

function cleanFields(fields) {
    const data = { ...fields };
    delete data.firIdentityClaimId;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.id;
    delete data._collectionName;
    return data;
}

function assertAuthorizedRole(roleSnapshot, stationSnapshot, identity, HttpsError) {
    if (!roleSnapshot.exists) {
        throw new HttpsError("permission-denied", "An active Admin or Operator role is required.");
    }
    const role = roleSnapshot.data();
    if (role.status !== "active" || !["admin", "operator"].includes(role.role)) {
        throw new HttpsError("permission-denied", "An active Admin or Operator role is required.");
    }
    if (role.role === "admin" && role.policeStationId != null) {
        throw new HttpsError("permission-denied", "The Admin role record is malformed.");
    }
    if (!stationSnapshot.exists || typeof stationSnapshot.data().name !== "string"
        || !stationSnapshot.data().name.trim()) {
        throw new HttpsError("failed-precondition", "The selected police station does not exist.");
    }
    if (role.role === "operator"
        && (!/^[A-Za-z0-9_-]{1,128}$/.test(role.policeStationId || "")
            || role.policeStationId !== identity.policeStationId)) {
        throw new HttpsError("permission-denied", "Operators may save FIR Masters only at their assigned station.");
    }
    return role;
}

function duplicateIdentity(matches, HttpsError) {
    return new HttpsError("already-exists", "A matching FIR Master already exists.", {
        reason: "duplicate-identity",
        matches: matches.map(master => ({ id: master.id }))
    });
}

function createSaveFirMasterHandler({ db, FieldValue, HttpsError }) {
    async function findLegacyMatches(identity) {
        const snapshot = await db.collection(LEGACY_CASES)
            .where("policeStationId", "==", identity.policeStationId)
            .get();
        const groups = new Map();
        snapshot.docs.forEach(document => {
            const data = document.data();
            if (data.firMasterId || !matchesIdentity(data, identity)) return;
            const key = String(data.firId || `legacy:${document.id}`);
            if (!groups.has(key)) groups.set(key, {
                id: key,
                legacyFirId: data.firId || "",
                records: []
            });
            groups.get(key).records.push({ id: document.id });
        });
        return [...groups.values()];
    }

    return async request => {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "Sign in is required to save an FIR Master.");
        }
        if (!request.data || typeof request.data !== "object" || Array.isArray(request.data)) {
            throw new HttpsError("invalid-argument", "A valid FIR Master request is required.");
        }

        const { masterId, isUpdate, fields, allowLegacyMatch = false } = request.data;
        if (typeof masterId !== "string" || !masterId || masterId.length > 1500
            || masterId.includes("/") || masterId === "." || masterId === ".."
            || /^__.*__$/.test(masterId)) {
            throw new HttpsError("invalid-argument", "A valid FIR Master document ID is required.");
        }
        if (typeof isUpdate !== "boolean") {
            throw new HttpsError("invalid-argument", "The FIR Master operation type is required.");
        }
        if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
            throw new HttpsError("invalid-argument", "FIR Master fields are required.");
        }
        if (typeof allowLegacyMatch !== "boolean") {
            throw new HttpsError("invalid-argument", "The legacy-match option must be a boolean.");
        }

        const identity = identityFrom(fields, HttpsError);
        const claimId = claimIdFor(identity);
        const masterReference = db.collection(FIR_MASTERS).doc(masterId);
        const claimReference = db.collection(IDENTITY_CLAIMS).doc(claimId);
        const roleReference = db.collection(USER_ROLES).doc(request.auth.uid);
        const stationReference = db.collection(POLICE_STATIONS).doc(identity.policeStationId);

        const [initialRoleSnapshot, initialStationSnapshot] = await Promise.all([
            roleReference.get(),
            stationReference.get()
        ]);
        assertAuthorizedRole(initialRoleSnapshot, initialStationSnapshot, identity, HttpsError);

        const existingMasters = await db.collection(FIR_MASTERS)
            .where("policeStationId", "==", identity.policeStationId)
            .get();
        const matchingMasters = existingMasters.docs
            .filter(document => document.id !== masterId && matchesIdentity(document.data(), identity))
            .map(document => ({ id: document.id }));
        if (matchingMasters.length) throw duplicateIdentity(matchingMasters, HttpsError);

        if (!allowLegacyMatch) {
            const legacyMatches = await findLegacyMatches(identity);
            if (legacyMatches.length) {
                throw new HttpsError(
                    "failed-precondition",
                    "Matching legacy records exist. Verify and link them before creating an FIR Master.",
                    { reason: "legacy-match", matches: legacyMatches }
                );
            }
        }

        await db.runTransaction(async transaction => {
            const [roleSnapshot, stationSnapshot, masterSnapshot, claimSnapshot] = await Promise.all([
                transaction.get(roleReference),
                transaction.get(stationReference),
                transaction.get(masterReference),
                transaction.get(claimReference)
            ]);
            const role = assertAuthorizedRole(roleSnapshot, stationSnapshot, identity, HttpsError);

            const existingMaster = masterSnapshot.exists ? masterSnapshot.data() : null;
            if (isUpdate && !existingMaster) {
                throw new HttpsError("not-found", "The FIR Master no longer exists. Reload it before saving.");
            }
            if (!isUpdate && existingMaster) {
                const retryClaim = claimSnapshot.exists ? claimSnapshot.data() : null;
                if (retryClaim?.firMasterId === masterId
                    && sameIdentity(existingMaster, identity)) {
                    return;
                }
                throw new HttpsError("already-exists", "The FIR Master document ID is already in use.");
            }
            if (existingMaster) {
                const ownerStationId = existingMaster.policeStationId;
                if (typeof ownerStationId !== "string" || !ownerStationId
                    || ownerStationId !== identity.policeStationId) {
                    throw new HttpsError(
                        "failed-precondition",
                        "An FIR Master cannot be moved to another police station during an identity correction."
                    );
                }
                if (role.role === "operator" && ownerStationId !== role.policeStationId) {
                    throw new HttpsError(
                        "permission-denied",
                        "Operators may update FIR Masters only at their assigned station."
                    );
                }
            }

            const claim = claimSnapshot.exists ? claimSnapshot.data() : null;
            if (claim && claim.firMasterId !== masterId) {
                throw duplicateIdentity([{ id: claim.firMasterId }], HttpsError);
            }
            if (claim && !sameIdentity(claim, identity)) {
                throw new HttpsError(
                    "failed-precondition",
                    "The FIR identity claim is inconsistent and requires review."
                );
            }

            let oldClaimReference = null;
            let oldClaimSnapshot = null;
            if (existingMaster) {
                const oldClaimId = typeof existingMaster.firIdentityClaimId === "string"
                    ? existingMaster.firIdentityClaimId
                    : claimIdFor(existingMaster);
                if (oldClaimId && oldClaimId !== claimId) {
                    oldClaimReference = db.collection(IDENTITY_CLAIMS).doc(oldClaimId);
                    oldClaimSnapshot = await transaction.get(oldClaimReference);
                    if (oldClaimSnapshot.exists) {
                        const oldClaim = oldClaimSnapshot.data();
                        if (oldClaim.firMasterId !== masterId || !sameIdentity(oldClaim, existingMaster)) {
                            throw new HttpsError(
                                "failed-precondition",
                                "The existing FIR identity claim is inconsistent and requires review."
                            );
                        }
                    }
                }
            }

            const now = FieldValue.serverTimestamp();
            const masterData = {
                ...cleanFields(fields),
                ...identity,
                firIdentityClaimId: claimId,
                updatedAt: now,
                ...(existingMaster?.createdAt ? {} : { createdAt: now })
            };

            if (oldClaimReference && oldClaimSnapshot?.exists) {
                transaction.delete(oldClaimReference);
            }
            transaction.set(claimReference, {
                firMasterId: masterId,
                ...identity,
                createdAt: claim?.createdAt || now,
                updatedAt: now
            });
            if (existingMaster) transaction.update(masterReference, masterData);
            else transaction.create(masterReference, { ...masterData, createdAt: now });
        });

        return { masterId };
    };
}

module.exports = { createSaveFirMasterHandler };
