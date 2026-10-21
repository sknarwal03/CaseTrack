const dialog = document.getElementById("operatorCredentialsDialog");
const loginId = document.getElementById("operatorCredentialLoginId");
const uid = document.getElementById("operatorCredentialUid");
const password = document.getElementById("operatorCredentialPassword");
const status = document.getElementById("operatorCredentialStatus");

export function showOperatorTemporaryCredentials({ email, operatorUid, temporaryPassword }) {
    if (!dialog || !loginId || !uid || !password
        || typeof email !== "string" || typeof operatorUid !== "string"
        || typeof temporaryPassword !== "string") {
        throw new Error("Operator credentials could not be displayed.");
    }
    loginId.value = email;
    uid.value = operatorUid;
    password.value = temporaryPassword;
    if (status) status.textContent = "Copy these credentials now. The temporary password is shown only this time.";
    if (!dialog.open) dialog.showModal();
}

dialog?.addEventListener("close", () => {
    if (loginId) loginId.value = "";
    if (uid) uid.value = "";
    if (password) password.value = "";
    if (status) status.textContent = "";
});

for (const button of dialog?.querySelectorAll("[data-copy-credential]") || []) {
    button.addEventListener("click", async () => {
        const target = document.getElementById(button.dataset.copyCredential);
        if (!target) return;
        target.focus();
        target.select();
        try {
            await navigator.clipboard.writeText(target.value);
            if (status) status.textContent = "Copied. Share the temporary password privately and ask the Operator to change it.";
        } catch {
            if (status) status.textContent = "Select the field and copy it manually. Share the temporary password privately.";
        }
    });
}
