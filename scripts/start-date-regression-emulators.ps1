$ErrorActionPreference = 'Stop'

$projectId = 'demo-casetrack-date-regression'
$credentialVariables = @('GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CONFIG')

foreach ($name in $credentialVariables) {
    if ([Environment]::GetEnvironmentVariable($name)) {
        throw "Refusing emulator startup while cloud credential variable $name is set."
    }
}

if ($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -ne $projectId) {
    throw 'Refusing emulator startup because GCLOUD_PROJECT is not the dedicated demo project.'
}

$env:GCLOUD_PROJECT = $projectId
firebase emulators:start --only auth,firestore --project $projectId --config firebase.test.json
exit $LASTEXITCODE
