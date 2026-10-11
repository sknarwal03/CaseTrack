param(
    [ValidateSet('seed', 'seed-promotion', 'seed-failure', 'seed-charge', 'inspect', 'inspect-promotion', 'inspect-failure', 'inspect-charge')]
    [string]$Action = 'seed'
)

$ErrorActionPreference = 'Stop'
$projectId = 'demo-casetrack-date-regression'
$authHost = '127.0.0.1:9099'
$firestoreHost = '127.0.0.1:8080'

if ($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -ne $projectId) {
    throw 'Refusing data operation because GCLOUD_PROJECT is not the dedicated demo project.'
}
if ($env:FIREBASE_AUTH_EMULATOR_HOST -and $env:FIREBASE_AUTH_EMULATOR_HOST -ne $authHost) {
    throw 'Refusing data operation because the Auth emulator host is not the expected local endpoint.'
}
if ($env:FIRESTORE_EMULATOR_HOST -and $env:FIRESTORE_EMULATOR_HOST -ne $firestoreHost) {
    throw 'Refusing data operation because the Firestore emulator host is not the expected local endpoint.'
}
if ($env:GOOGLE_APPLICATION_CREDENTIALS -or $env:FIREBASE_TOKEN -or $env:FIREBASE_CONFIG) {
    throw 'Refusing data operation while cloud credentials are present in the test process.'
}

$env:GCLOUD_PROJECT = $projectId
$env:FIREBASE_AUTH_EMULATOR_HOST = $authHost
$env:FIRESTORE_EMULATOR_HOST = $firestoreHost
node scripts/date-regression-fixture.mjs $Action
exit $LASTEXITCODE
