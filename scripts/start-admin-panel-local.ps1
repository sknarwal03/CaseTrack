$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$prototypeRoot = Join-Path $repositoryRoot 'security-prototypes\role-management'
$loginUrl = 'http://127.0.0.1:5174/CaseTrack/pages/login.html'
$projectId = 'demo-casetrack-role-prototype'
$vitePort = 5174

function Get-ListeningProcesses {
    param([int]$Port)

    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        [pscustomobject]@{
            Port = $Port
            Address = $connection.LocalAddress
            ProcessId = $connection.OwningProcess
            Name = $process.Name
            ExecutablePath = $process.ExecutablePath
            CommandLine = $process.CommandLine
        }
    }
}

function Get-ProcessForPort {
    param([int]$Port)

    $listeners = @(Get-ListeningProcesses -Port $Port)
    if ($listeners.Count -eq 0) {
        return $null
    }

    $owners = @($listeners | Group-Object ProcessId)
    if ($owners.Count -ne 1 -or @($listeners | Where-Object { $_.Address -ne '127.0.0.1' }).Count -gt 0) {
        $details = ($listeners | ForEach-Object { "$($_.Address) PID $($_.ProcessId) $($_.Name)" }) -join '; '
        throw "Port $Port is not exclusively bound by one loopback process ($details). No process was changed."
    }

    return $owners[0].Group[0]
}

function Assert-ExpectedFirebaseCli {
    param(
        [pscustomobject]$Process,
        [int]$Port
    )

    $commandLine = $Process.CommandLine
    $valid = $Process.Name -eq 'node.exe' `
        -and $commandLine.IndexOf((Join-Path $prototypeRoot 'node_modules'), [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('firebase-tools', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('emulators:start', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('--only auth,firestore,functions', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf("--project $projectId", [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not $valid) {
        throw "Port $Port is occupied by $($Process.Name) PID $($Process.ProcessId), not the expected local Firebase Emulator process. No process was changed."
    }

    $nodeVersion = & $Process.ExecutablePath --version
    if ($LASTEXITCODE -ne 0 -or [string]$nodeVersion -notmatch '^v22\.') {
        throw "The Firebase Emulator process on port $Port is not running under Node 22. Use the prototype's Node 22 emulator command; no process was changed."
    }
}

function Assert-ExpectedFirestoreEmulator {
    param([pscustomobject]$Process)

    $commandLine = $Process.CommandLine
    $valid = $Process.Name -eq 'java.exe' `
        -and $commandLine.IndexOf('cloud-firestore-emulator', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('--host 127.0.0.1', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('--port 8080', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf("--project_id $projectId", [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not $valid) {
        throw "Port 8080 is occupied by $($Process.Name) PID $($Process.ProcessId), not the expected local Firestore Emulator. No process was changed."
    }
}

function Test-EmulatorsReady {
    param([switch]$AllowPartial)

    $auth = Get-ProcessForPort -Port 9099
    $firestore = Get-ProcessForPort -Port 8080
    $functions = Get-ProcessForPort -Port 5001
    $activeCount = 0
    if ($null -ne $auth) { $activeCount++ }
    if ($null -ne $firestore) { $activeCount++ }
    if ($null -ne $functions) { $activeCount++ }

    if ($activeCount -eq 0) {
        return $false
    }
    if ($activeCount -ne 3 -and -not $AllowPartial) {
        throw 'Only some required emulator ports are occupied. Inspect the emulator console; the launcher will not start a duplicate or stop any process.'
    }

    if ($null -ne $auth) {
        Assert-ExpectedFirebaseCli -Process $auth -Port 9099
    }
    if ($null -ne $functions) {
        Assert-ExpectedFirebaseCli -Process $functions -Port 5001
    }
    if ($null -ne $auth -and $null -ne $functions -and $auth.ProcessId -ne $functions.ProcessId) {
        throw 'Auth and Functions listeners belong to different processes. No process was changed.'
    }
    if ($null -ne $firestore) {
        Assert-ExpectedFirestoreEmulator -Process $firestore
    }

    if ($activeCount -ne 3) {
        return $false
    }

    Write-Host "Verified local emulator listeners: Auth 9099, Firestore 8080, Functions 5001 (project $projectId)."
    return $true
}

function Get-EmulatorHealthFailure {
    $authUrl = "http://127.0.0.1:9099/emulator/v1/projects/$projectId/config"
    $authStatus = & curl.exe --noproxy '*' --silent --max-time 5 --output NUL --write-out '%{http_code}' $authUrl
    if ($LASTEXITCODE -ne 0 -or [string]$authStatus -ne '200') {
        return "Auth Emulator health probe failed (curl exit $LASTEXITCODE, HTTP $authStatus)."
    }

    $firestoreStatus = & curl.exe --noproxy '*' --silent --max-time 5 --output NUL --write-out '%{http_code}' 'http://127.0.0.1:8080/'
    if ($LASTEXITCODE -ne 0 -or [string]$firestoreStatus -ne '200') {
        return "Firestore Emulator health probe failed (curl exit $LASTEXITCODE, HTTP $firestoreStatus)."
    }

    $functionsUrl = "http://127.0.0.1:5001/$projectId/us-central1/listUserRoles"
    $functionsResponse = & curl.exe --noproxy '*' --silent --max-time 5 --include --request OPTIONS `
        --header 'Origin: http://127.0.0.1:5174' `
        --header 'Access-Control-Request-Method: GET' `
        --header 'Access-Control-Request-Headers: authorization' `
        $functionsUrl
    $curlExitCode = $LASTEXITCODE
    $functionsHeaders = $functionsResponse -join "`n"
    if ($curlExitCode -ne 0 `
        -or $functionsHeaders -notmatch '(?m)^HTTP/\S+\s+204(?:\s|$)' `
        -or $functionsHeaders -notmatch '(?im)^access-control-allow-origin:\s*http://127\.0\.0\.1:5174\s*$') {
        return "Functions Emulator readiness/CORS probe failed (curl exit $curlExitCode)."
    }

    return $null
}

function Ensure-RoleAdminRulesLoaded {
    $rulesPath = Join-Path $repositoryRoot 'firestore.admin-panel.rules'
    $firebase = Get-ProcessForPort -Port 5001
    if ($null -eq $firebase) {
        throw 'The expected loopback Firebase Emulator process is not listening on port 5001.'
    }

    $syncScript = @'
const fs = require("node:fs");
const [rulesPath, projectId] = process.argv.slice(2);
const url = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}:securityRules`;
const normalize = value => value.replace(/\r\n/g, "\n").trimEnd();
const expected = normalize(fs.readFileSync(rulesPath, "utf8"));

async function readRules() {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Rules API GET returned HTTP ${response.status}.`);
    const document = await response.json();
    return (document.rules?.files || []).map(file => file.content || "").join("\n");
}

(async () => {
    let loaded = await readRules();
    if (normalize(loaded) !== expected) {
        const response = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rules: { files: [{ content: expected }] } }),
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`Rules API PUT returned HTTP ${response.status}.`);
        loaded = await readRules();
        if (normalize(loaded) !== expected) throw new Error("Rules API read-back does not match the configured policy.");
        console.log("Loaded configured role-aware Rules without clearing emulator data.");
        return;
    }
    console.log("Configured role-aware Rules are already loaded.");
})().catch(error => {
    console.error(`Local Firestore Rules check failed: ${error.message}`);
    process.exitCode = 1;
});
'@
    $syncScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "casetrack-rules-sync-$([guid]::NewGuid().ToString('N')).cjs"
    try {
        [System.IO.File]::WriteAllText($syncScriptPath, $syncScript, [System.Text.Encoding]::UTF8)
        $syncOutput = & $firebase.ExecutablePath $syncScriptPath $rulesPath $projectId
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not verify or load firestore.admin-panel.rules into the loopback emulator. No emulator data was cleared.'
        }
        Write-Host ($syncOutput -join "`n")
    } finally {
        if (Test-Path -LiteralPath $syncScriptPath) {
            Remove-Item -LiteralPath $syncScriptPath -Force
        }
    }
}

function Wait-ForEmulatorHealth {
    $deadline = (Get-Date).AddSeconds(60)
    $failure = 'Emulator health probes did not complete.'
    while ((Get-Date) -lt $deadline) {
        $failure = Get-EmulatorHealthFailure
        if ($null -eq $failure) {
            Write-Host 'Verified Auth, Firestore, and Functions HTTP readiness, including the 5174 CORS preflight.'
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "$failure No login was attempted; service consoles remain open."
}

function Get-RoleAdminViteProcesses {
    $viteProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'")
    @($viteProcesses | Where-Object {
        $_.CommandLine -and
        $_.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.CommandLine.IndexOf('vite.js', [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.CommandLine.IndexOf('role-admin-local', [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
}

function Format-RoleAdminProcessDetails {
    param([object[]]$Processes)

    foreach ($process in $Processes) {
        $connections = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -eq $process.ProcessId })
        if ($connections.Count -eq 0) {
            "PID $($process.ProcessId) ($($process.Name)), no listening port found"
            continue
        }

        foreach ($connection in $connections) {
            "PID $($process.ProcessId) ($($process.Name)) on $($connection.LocalAddress):$($connection.LocalPort)"
        }
    }
}

function Assert-ExpectedViteListener {
    $vite = Get-ProcessForPort -Port $vitePort
    if ($null -eq $vite) {
        $otherRoleAdminInstances = @(Get-RoleAdminViteProcesses)
        if ($otherRoleAdminInstances.Count -gt 0) {
            $details = (Format-RoleAdminProcessDetails -Processes $otherRoleAdminInstances) -join '; '
            throw "A role-admin-local Vite process already exists on another or unknown port ($details). No duplicate was started."
        }
        return $false
    }

    $commandLine = $vite.CommandLine
    $valid = $vite.Name -eq 'node.exe' `
        -and $commandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('vite.js', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('role-admin-local', [StringComparison]::OrdinalIgnoreCase) -ge 0 `
        -and $commandLine.IndexOf('--host 127.0.0.1', [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not $valid) {
        throw "Port $vitePort is occupied by $($vite.Name) PID $($vite.ProcessId), not the expected loopback role-admin-local Vite server. No process was changed."
    }

    $otherInstances = @(Get-RoleAdminViteProcesses | Where-Object { $_.ProcessId -ne $vite.ProcessId })
    if ($otherInstances.Count -gt 0) {
        $details = (Format-RoleAdminProcessDetails -Processes $otherInstances) -join '; '
        throw "Additional role-admin-local Vite process(es) found ($details). No duplicate was started."
    }

    return $true
}

function Test-LoginPage {
    try {
        $page = Invoke-WebRequest -Uri $loginUrl -UseBasicParsing -TimeoutSec 5
        if ([int]$page.StatusCode -ne 200 -or $page.Content -notmatch 'CaseTrack \| Login') {
            return $false
        }

        $moduleUrl = 'http://127.0.0.1:5174/CaseTrack/assets/js/login.js'
        $module = Invoke-WebRequest -Uri $moduleUrl -UseBasicParsing -TimeoutSec 5
        return [int]$module.StatusCode -eq 200 `
            -and $module.Content -match 'firebase/local-role-admin/firebase-config\.js' `
            -and $module.Content -notmatch 'firebase/firebase-config\.js'
    }
    catch {
        return $false
    }
}

function Start-VisibleCommandWindow {
    param(
        [string]$WorkingDirectory,
        [string]$Command
    )

    $shellCommand = 'cd /d "' + $WorkingDirectory + '" && ' + $Command
    Start-Process -FilePath $env:ComSpec -ArgumentList "/k `"$shellCommand`"" -WorkingDirectory $WorkingDirectory | Out-Null
}

try {
    Write-Host 'Starting the local CaseTrack Admin Panel. No existing process will be stopped.'

    foreach ($name in @('node', 'npm', 'npx', 'java', 'curl.exe', 'Get-NetTCPConnection', 'Get-CimInstance')) {
        if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
            throw "Required command '$name' was not found on PATH."
        }
    }

    foreach ($name in @('GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CONFIG')) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            throw "Refusing startup because cloud credential/configuration variable $name is set. The value was not displayed."
        }
    }
    if ($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -ne $projectId) {
        throw "Refusing startup because GCLOUD_PROJECT is not the isolated demo project $projectId."
    }

    $viteCli = Join-Path $repositoryRoot 'node_modules\.bin\vite.cmd'
    $firebaseCli = Join-Path $prototypeRoot 'node_modules\.bin\firebase.cmd'
    $functionsEnv = Join-Path $prototypeRoot 'functions\.env.demo-casetrack-role-prototype'
    foreach ($requiredPath in @($viteCli, $firebaseCli, $functionsEnv)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "Required local file is missing: $requiredPath. Install/setup dependencies or create the ignored local Functions key using the prototype README instructions, then retry. The launcher will not install or generate anything."
        }
    }

    $emulatorsReady = Test-EmulatorsReady -AllowPartial
    $viteReady = Assert-ExpectedViteListener

    if (-not $emulatorsReady) {
        if (@(Get-ListeningProcesses -Port 9099).Count -gt 0 `
            -or @(Get-ListeningProcesses -Port 8080).Count -gt 0 `
            -or @(Get-ListeningProcesses -Port 5001).Count -gt 0) {
            throw 'An emulator port became occupied during preflight. No new service was started.'
        }

        Write-Host 'Starting Auth, Firestore, and Functions emulators in the prototype directory...'
        Start-VisibleCommandWindow -WorkingDirectory $prototypeRoot -Command 'npm run emulators'

        $deadline = (Get-Date).AddMinutes(3)
        while ((Get-Date) -lt $deadline) {
            if (Test-EmulatorsReady -AllowPartial) {
                $emulatorsReady = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $emulatorsReady) {
            throw 'Timed out waiting for all three expected emulator listeners. The emulator console remains open for diagnosis; no process was stopped.'
        }
    }

    Ensure-RoleAdminRulesLoaded
    Wait-ForEmulatorHealth

    if (-not $viteReady) {
        Write-Host "Starting Vite in role-admin-local mode on 127.0.0.1:$vitePort..."
        Start-VisibleCommandWindow -WorkingDirectory $repositoryRoot -Command 'npm run dev -- --mode role-admin-local --host 127.0.0.1 --port 5174 --strictPort'

        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline) {
            if (Assert-ExpectedViteListener) {
                $viteReady = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $viteReady) {
            throw 'Timed out waiting for the loopback Vite listener. The Vite console remains open for diagnosis; no process was stopped.'
        }
    }

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline -and -not (Test-LoginPage)) {
        Start-Sleep -Seconds 2
    }
    if (-not (Test-LoginPage)) {
        throw 'The expected login page or local Firebase module did not pass the HTTP checks. The service consoles remain open; no process was stopped.'
    }

    Write-Host "Local services are ready. Opening $loginUrl"
    Start-Process $loginUrl
}
catch {
    Write-Error $_
    exit 1
}
