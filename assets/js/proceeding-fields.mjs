function clean(value) {
    return String(value ?? '').trim();
}

export function normalizeProceedingFields(fields = {}) {
    return {
        ioRank: clean(fields.ioRank),
        ioName: clean(fields.ioName),
        ioId: clean(fields.ioId),
        ioBeltno: clean(fields.ioBeltno ?? fields.beltNo),
        iomobileNo: clean(fields.iomobileNo ?? fields.mobileNo),
        highlighted: fields.highlighted === true,
        accused: (Array.isArray(fields.accused) ? fields.accused : []).map(accused => ({
            name: clean(accused.name),
            fatherName: clean(accused.fatherName),
            mobile: clean(accused.mobile),
            arrested: accused.arrested === true,
            arrestDate: clean(accused.arrestDate),
            custodyStatus: clean(accused.custodyStatus),
            bailDate: clean(accused.bailDate),
            poStatus: accused.poStatus === true,
            poDate: clean(accused.poDate),
            address: clean(accused.address)
        })),
        witnesses: (Array.isArray(fields.witnesses) ? fields.witnesses : []).map(witness => ({
            name: clean(witness.name),
            status: clean(witness.status),
            examined: witness.examined === true,
            examinedDate: clean(witness.examinedDate)
        }))
    };
}

export function proceedingFieldsFromForm(form) {
    const controls = name => Array.from(form.querySelectorAll(`[name="${name}"]`));
    const values = name => controls(name).map(control => clean(control.value));
    const checked = name => controls(name).map(control => control.checked);
    const value = name => clean(form.elements.namedItem(name)?.value);
    const accusedNames = values('accused_name[]');
    const accusedFathers = values('accused_father_name[]');
    const accusedMobiles = values('accused_mobile[]');
    const arrestedFlags = checked('arrested[]');
    const arrestDates = values('arrestingdate[]');
    const custodyStatuses = values('custody_status[]');
    const bailDates = values('baildate[]');
    const poFlags = checked('po_status[]');
    const poDates = values('po_date[]');
    const accusedAddresses = values('accused_address[]');
    const witnessNames = values('witness_name[]');
    const witnessStatuses = values('witness_status[]');
    const witnessExaminedFlags = checked('witness_examined[]');
    const witnessExaminedDates = values('witness_examined_date[]');

    return normalizeProceedingFields({
        ioRank: value('iorank'),
        ioName: value('ioname'),
        ioId: value('ioId'),
        ioBeltno: value('ioBeltno'),
        iomobileNo: value('iomobileNo'),
        highlighted: form.elements.namedItem('highlightcase')?.checked === true,
        accused: accusedNames.map((name, index) => ({
            name,
            fatherName: accusedFathers[index],
            mobile: accusedMobiles[index],
            arrested: arrestedFlags[index],
            arrestDate: arrestDates[index],
            custodyStatus: custodyStatuses[index],
            bailDate: bailDates[index],
            poStatus: poFlags[index],
            poDate: poDates[index],
            address: accusedAddresses[index]
        })),
        witnesses: witnessNames.map((name, index) => ({
            name,
            status: witnessStatuses[index],
            examined: witnessExaminedFlags[index],
            examinedDate: witnessExaminedDates[index]
        }))
    });
}

export function proceedingPayload(masterFields, proceedingFields) {
    return {
        ...masterFields,
        ...normalizeProceedingFields(proceedingFields)
    };
}
