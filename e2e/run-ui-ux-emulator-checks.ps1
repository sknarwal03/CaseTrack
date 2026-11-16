$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = (Get-Command npm.cmd).Source
$nodeCommand = (Get-Command node).Source

function Invoke-RequiredCommand {
    param([string]$Label, [string]$Executable, [string[]]$Arguments)
    Write-Host "Running $Label..."
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

Push-Location $repositoryRoot
try {
    Invoke-RequiredCommand 'authenticated UI/UX browser regression and 56 screenshots' $nodeCommand @('e2e/ui-ux.browser.test.cjs')
    $reportPath = Join-Path $env:CASETRACK_E2E_OUTPUT_DIR 'ui-ux-e2e-report.json'
    if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
        throw "Browser test did not produce its required report: $reportPath"
    }
    $browserReport = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($browserReport.result -ne 'passed' -or $browserReport.screenshots.Count -ne 56) {
        throw 'Browser report did not verify the complete 56-image authenticated matrix.'
    }
    Write-Host "Authenticated Browser E2E passed: $($browserReport.screenshots.Count) screenshots, $($browserReport.checks.Count) checks, $($browserReport.browserConsoleErrors.Count) console errors, $($browserReport.failedRequests.Count) failed requests."
    Invoke-RequiredCommand 'root unit tests' $npmCommand @('test')
    Invoke-RequiredCommand 'production Vite build to isolated temporary output' $npmCommand @('run', 'build', '--', '--outDir', $env:CASETRACK_BUILD_OUT, '--emptyOutDir')
    foreach ($relativePath in @(
        'e2e/ui-ux.browser.test.cjs',
        'assets/js/register-diary.js',
        'assets/js/admin-panel.js',
        'functions/index.js'
    )) {
        Invoke-RequiredCommand "JavaScript syntax check: $relativePath" $nodeCommand @('--check', (Join-Path $repositoryRoot $relativePath))
    }
    $requiredBuildEntries = @('index.html', 'pages/admin-panel.html', 'pages/register-diary.html', 'pages/password-setup.html')
    foreach ($entry in $requiredBuildEntries) {
        if (-not (Test-Path -LiteralPath (Join-Path $env:CASETRACK_BUILD_OUT $entry) -PathType Leaf)) {
            throw "Production build output is missing required entry $entry."
        }
    }
    Write-Host 'Production build entry-point verification passed.'
} finally {
    Pop-Location
}
