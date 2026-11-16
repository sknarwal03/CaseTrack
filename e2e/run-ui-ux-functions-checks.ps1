$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = (Get-Command npm.cmd).Source
Push-Location $repositoryRoot
try {
    Write-Host 'Running Functions unit and Firestore Emulator tests in the isolated emulator project set...'
    & $npmCommand test --prefix functions
    if ($LASTEXITCODE -ne 0) { throw "Functions tests failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}
