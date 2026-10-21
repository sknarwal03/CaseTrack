const { initializeApp, getApps } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { createSaveFirMasterHandler } = require("./save-fir-master");

if (getApps().length === 0) initializeApp();
const db = getFirestore();

exports.saveFirMaster = onCall(
    { region: "us-central1" },
    createSaveFirMasterHandler({ db, FieldValue, HttpsError })
);

// Production Functions for Admin Panel operations. The source is in this
// deployment's Functions package; the separate emulator prototype remains
// available only for isolated test runs.
const adminRoleManagement = require("./admin-role-management.cjs");
exports.listUserRoles = adminRoleManagement.listUserRoles;
exports.policeStations = adminRoleManagement.policeStations;
exports.createOperator = adminRoleManagement.createOperator;
exports.resetOperatorPassword = adminRoleManagement.resetOperatorPassword;
exports.completeOperatorFirstPasswordChange = adminRoleManagement.completeOperatorFirstPasswordChange;
exports.manageUserRole = adminRoleManagement.manageUserRole;
exports.getMyAccess = adminRoleManagement.getMyAccess;
