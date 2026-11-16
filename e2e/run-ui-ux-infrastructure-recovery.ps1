$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$projectId = 'demo-casetrack-role-prototype'
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$ports = @(5174, 9198, 8187, 5003, 4400, 4500, 9150, 9299, 9499)
$protectedVariables = @('GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CONFIG')
$originalEnvironment = @{}
$createdRuntimeRoot = $null
$viteProcess = $null
$failed = $false

function Get-ListenerDetails {
    param([int]$Port)
    foreach ($connection in @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        [pscustomobject]@{
            Address = $connection.LocalAddress
            Port = $Port
            ProcessId = $connection.OwningProcess
            Process = $owner.Name
        }
    }
}

function Test-HttpReady {
    param([string]$Uri, [string]$ExpectedContent = '')
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
        return [int]$response.StatusCode -eq 200 -and
            (-not $ExpectedContent -or $response.Content.Contains($ExpectedContent))
    } catch {
        return $false
    }
}

function Save-EnvironmentValue {
    param([string]$Name, [string]$Value)
    $originalEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

try {
    foreach ($command in @('node', 'npm', 'npx', 'java', 'Get-NetTCPConnection', 'Get-CimInstance')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Required local command '$command' is not installed."
        }
    }
    foreach ($name in $protectedVariables) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            throw "Refusing to start because protected cloud configuration variable $name is already set. Its value was not read or displayed."
        }
    }
    $existingProject = [Environment]::GetEnvironmentVariable('GCLOUD_PROJECT', 'Process')
    if ($existingProject -and $existingProject -ne $projectId) {
        throw "Refusing to start because GCLOUD_PROJECT selects a non-demo project. Its value was not displayed."
    }
    if (-not (Test-Path -LiteralPath $chromePath -PathType Leaf)) {
        throw "Chrome was not found at the configured local executable path: $chromePath"
    }
    foreach ($required in @(
        (Join-Path $repositoryRoot 'node_modules\vite\bin\vite.js'),
        (Join-Path $repositoryRoot 'e2e\node_modules\playwright\package.json'),
        (Join-Path $repositoryRoot 'functions\node_modules\firebase-admin\package.json'),
        (Join-Path $repositoryRoot 'security-prototypes\role-management\node_modules\firebase-tools\lib\bin\firebase.js'),
        (Join-Path $repositoryRoot 'firebase.ui-ux-local.json'),
        (Join-Path $repositoryRoot 'firestore.admin-panel.rules')
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required existing local test file is missing: $required"
        }
    }

    foreach ($port in $ports) {
        $listeners = @(Get-ListenerDetails -Port $port)
        if ($listeners.Count -gt 0) {
            $owners = ($listeners | ForEach-Object { "$($_.Address):$($_.Port) PID $($_.ProcessId) $($_.Process)" }) -join '; '
            throw "Port $port is already in use ($owners). No process was stopped or modified."
        }
    }

    $runId = [guid]::NewGuid().ToString('N')
    $systemTemp = [System.IO.Path]::GetTempPath()
    $createdRuntimeRoot = Join-Path $systemTemp "casetrack-uiux-recovery-$runId"
    [void](New-Item -ItemType Directory -Path $createdRuntimeRoot)
    $runtimeRoot = [System.IO.Path]::GetFullPath($createdRuntimeRoot)
    $systemTempFull = [System.IO.Path]::GetFullPath($systemTemp)
    if (-not $runtimeRoot.StartsWith($systemTempFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Temporary runtime path did not resolve inside the Windows temporary directory.'
    }
    $isolatedAppData = Join-Path $runtimeRoot 'appdata'
    $isolatedTemp = Join-Path $runtimeRoot 'temp'
    $outputDir = Join-Path $repositoryRoot "docs\ui-ux-audit\screenshots\infrastructure-recovery\$runId"
    [void](New-Item -ItemType Directory -Path $isolatedAppData, $isolatedTemp, $outputDir -Force)
    $buildOutput = Join-Path $runtimeRoot 'production-build'

    Save-EnvironmentValue 'GCLOUD_PROJECT' $projectId
    Save-EnvironmentValue 'FIREBASE_AUTH_EMULATOR_HOST' '127.0.0.1:9198'
    Save-EnvironmentValue 'FIRESTORE_EMULATOR_HOST' '127.0.0.1:8187'
    Save-EnvironmentValue 'VITE_ROLE_ADMIN_AUTH_PORT' '9198'
    Save-EnvironmentValue 'VITE_ROLE_ADMIN_FIRESTORE_PORT' '8187'
    Save-EnvironmentValue 'VITE_ROLE_ADMIN_FUNCTIONS_PORT' '5003'
    Save-EnvironmentValue 'CASETRACK_E2E_MODE' 'role-admin-local'
    Save-EnvironmentValue 'CASETRACK_E2E_OUTPUT_DIR' $outputDir
    Save-EnvironmentValue 'CASETRACK_BUILD_OUT' $buildOutput
    Save-EnvironmentValue 'CHROME_EXECUTABLE' $chromePath
    Save-EnvironmentValue 'APPDATA' $isolatedAppData
    Save-EnvironmentValue 'CLOUDSDK_CONFIG' (Join-Path $runtimeRoot 'gcloud')
    Save-EnvironmentValue 'TEMP' $isolatedTemp
    Save-EnvironmentValue 'TMP' $isolatedTemp
    Save-EnvironmentValue 'FUNCTIONS_DISCOVERY_TIMEOUT' '60'

    Write-Host "Starting Vite in role-admin-local mode for the isolated demo project $projectId."
    $nodePath = (Get-Command node).Source
    $viteEntry = Join-Path $repositoryRoot 'node_modules\vite\bin\vite.js'
    $viteOut = Join-Path $runtimeRoot 'vite.stdout.log'
    $viteErr = Join-Path $runtimeRoot 'vite.stderr.log'
    $viteArguments = "`"$viteEntry`" --mode role-admin-local --host 127.0.0.1 --port 5174 --strictPort"
    $viteProcess = Start-Process -FilePath $nodePath `
        -ArgumentList $viteArguments `
        -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr

    $deadline = (Get-Date).AddSeconds(45)
    $viteReady = $false
    while ((Get-Date) -lt $deadline) {
        if ($viteProcess.HasExited) { throw "Vite exited during startup (code $($viteProcess.ExitCode)); see $viteErr" }
        if (Test-HttpReady 'http://127.0.0.1:5174/CaseTrack/pages/login.html' 'CaseTrack | Login') {
            $configResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:5174/CaseTrack/firebase/local-role-admin/firebase-config.js' -UseBasicParsing -TimeoutSec 5
            $endpointResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:5174/CaseTrack/assets/js/local-role-admin-endpoints.js' -UseBasicParsing -TimeoutSec 5
            if (
                $configResponse.Content -notmatch 'connectAuthEmulator' -or
                $configResponse.Content -notmatch 'connectFirestoreEmulator' -or
                $configResponse.Content -notmatch 'connectFunctionsEmulator' -or
                $endpointResponse.Content -notmatch 'demo-casetrack-role-prototype' -or
                $endpointResponse.Content -notmatch 'VITE_ROLE_ADMIN_AUTH_PORT.*9198' -or
                $endpointResponse.Content -notmatch 'VITE_ROLE_ADMIN_FIRESTORE_PORT.*8187' -or
                $endpointResponse.Content -notmatch 'VITE_ROLE_ADMIN_FUNCTIONS_PORT.*5003' -or
                $configResponse.Content -match 'casetrack-97a4e\.cloudfunctions\.net' -or
                $endpointResponse.Content -match 'casetrack-97a4e\.cloudfunctions\.net'
            ) {
                throw 'The role-admin-local Vite config did not resolve exclusively to the fixed local demo emulator endpoints.'
            }
            $viteReady = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $viteReady) { throw 'Vite failed its HTTP readiness check before timeout.' }
    Write-Host 'Vite readiness and emulator-only frontend configuration verified.'

    $firebaseCli = Join-Path $repositoryRoot 'security-prototypes\role-management\node_modules\firebase-tools\lib\bin\firebase.js'
    $firebaseConfig = Join-Path $repositoryRoot 'firebase.ui-ux-local.json'
    $innerRunner = Join-Path $PSScriptRoot 'run-ui-ux-emulator-checks.ps1'
    $commandFile = Join-Path $runtimeRoot 'run-ui-ux-emulator-checks.cmd'
    $commandText = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$innerRunner`"`r`nexit /b %ERRORLEVEL%`r`n"
    [System.IO.File]::WriteAllText($commandFile, $commandText, [System.Text.Encoding]::ASCII)
    $functionsRunner = Join-Path $PSScriptRoot 'run-ui-ux-functions-checks.ps1'
    $functionsCommandFile = Join-Path $runtimeRoot 'run-ui-ux-functions-checks.cmd'
    $functionsCommandText = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$functionsRunner`"`r`nexit /b %ERRORLEVEL%`r`n"
    [System.IO.File]::WriteAllText($functionsCommandFile, $functionsCommandText, [System.Text.Encoding]::ASCII)
    $runtimeWorkingDirectory = Get-Location
    try {
        Set-Location $runtimeRoot
        Write-Host 'Starting only Auth, Firestore, and Functions emulators with no import/export dataset.'
        & npx.cmd --yes --package=node@22 -- node $firebaseCli emulators:exec `
            --only auth,firestore,functions --config $firebaseConfig --project $projectId $commandFile
        $emulatorExitCode = $LASTEXITCODE
        if ($emulatorExitCode -ne 0) { throw "Emulator-backed test command failed with exit code $emulatorExitCode." }

        Write-Host 'Running Functions emulator tests in their own fresh Auth/Firestore test session.'
        & npx.cmd --yes --package=node@22 -- node $firebaseCli emulators:exec `
            --only auth,firestore --config $firebaseConfig --project $projectId $functionsCommandFile
        $functionsExitCode = $LASTEXITCODE
        if ($functionsExitCode -ne 0) { throw "Functions unit/Firestore Emulator tests failed with exit code $functionsExitCode." }
    } finally {
        Set-Location $runtimeWorkingDirectory
    }
    Write-Host "All emulator-backed checks completed. Evidence: $outputDir"
}
catch {
    $failed = $true
    [Console]::Error.WriteLine($_.Exception.Message)
}
finally {
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
    if ($null -ne $viteProcess -and -not $viteProcess.HasExited) {
        Stop-Process -Id $viteProcess.Id -ErrorAction SilentlyContinue
        $viteProcess.WaitForExit(10000)
    }

    $remainingListeners = @($ports | ForEach-Object { Get-ListenerDetails -Port $_ })
    if ($remainingListeners.Count -gt 0) {
        $owners = ($remainingListeners | ForEach-Object { "$($_.Address):$($_.Port) PID $($_.ProcessId) $($_.Process)" }) -join '; '
        Write-Warning "A listener remains after cleanup: $owners. It was not stopped because its ownership was not confirmed."
        $failed = $true
    }

    $credentialDirectory = if ($createdRuntimeRoot) { Join-Path $createdRuntimeRoot 'appdata\firebase' } else { $null }
    if ($credentialDirectory -and (Test-Path -LiteralPath $credentialDirectory -PathType Container)) {
        $runtimePrefix = [System.IO.Path]::GetFullPath($createdRuntimeRoot)
        foreach ($credentialFile in @(Get-ChildItem -LiteralPath $credentialDirectory -Filter '*_application_default_credentials.json' -File -ErrorAction SilentlyContinue)) {
            $resolvedCredential = [System.IO.Path]::GetFullPath($credentialFile.FullName)
            if ($resolvedCredential.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $resolvedCredential -Force
            }
        }
    }

    if (-not $failed -and $createdRuntimeRoot -and (Test-Path -LiteralPath $createdRuntimeRoot)) {
        $resolvedRuntime = [System.IO.Path]::GetFullPath($createdRuntimeRoot)
        $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        if (
            $resolvedRuntime.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and
            $resolvedRuntime -match 'casetrack-uiux-recovery-[0-9a-f]{32}$'
        ) {
            Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
        } else {
            Write-Warning "Temporary runtime folder was retained because its resolved path did not pass the cleanup boundary: $resolvedRuntime"
            $failed = $true
        }
    } elseif ($failed -and $createdRuntimeRoot) {
        Write-Host "Diagnostic runtime logs retained at $createdRuntimeRoot"
    }
}

if ($failed) { exit 1 }
