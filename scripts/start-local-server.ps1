param(
    [switch]$ManagedChild
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-ConfigPath {
    param(
        [string]$RepoRoot
    )

    return Join-Path $RepoRoot 'local-runtime.config.json'
}

function Get-RuntimeConfig {
    param(
        [string]$RepoRoot
    )

    $configPath = Get-ConfigPath -RepoRoot $RepoRoot
    if (-not (Test-Path $configPath)) {
        throw "Missing config file: $configPath"
    }

    return Get-Content $configPath -Raw | ConvertFrom-Json
}

function Ensure-Directory {
    param(
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Resolve-DbBackend {
    param(
        [pscustomobject]$Config
    )

    $explicit = if ([string]::IsNullOrWhiteSpace($env:ATTENDANCE_DB_BACKEND)) { '' } else { $env:ATTENDANCE_DB_BACKEND }
    if ([string]::IsNullOrWhiteSpace($explicit)) {
        $explicit = [string]$Config.dbBackend
    }
    if ([string]::IsNullOrWhiteSpace($explicit)) {
        $explicit = 'sqlite'
    }

    return [string]$explicit.ToLower()
}

function Test-LegacyElectronRunning {
    param(
        [string]$DataDir
    )

    $expectedPrefix = [System.IO.Path]::GetFullPath($DataDir)
    $processes = Get-Process electron -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    }

    return @($processes)
}

function Stop-LegacyElectronProcesses {
    param(
        [array]$Processes
    )

    $stoppedPids = New-Object System.Collections.Generic.List[string]

    foreach ($process in @($Processes | Sort-Object Id -Unique)) {
        if (-not $process) {
            continue
        }

        try {
            & taskkill /PID $process.Id /T /F *> $null
            $stoppedPids.Add([string]$process.Id) | Out-Null
        } catch {
            throw "Failed to stop legacy Attendance/Electron process PID $($process.Id): $($_.Exception.Message)"
        }
    }

    return @($stoppedPids)
}

function Wait-ForLegacyElectronExit {
    param(
        [array]$Processes,
        [int]$TimeoutSeconds = 15
    )

    $pendingIds = @($Processes | ForEach-Object { $_.Id } | Sort-Object -Unique)
    if ($pendingIds.Count -eq 0) {
        return $true
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $remaining = @()
        foreach ($processId in $pendingIds) {
            if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
                $remaining += $processId
            }
        }

        if ($remaining.Count -eq 0) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Set-AppEnvironment {
    param(
        [pscustomobject]$Config
    )

    $dbBackend = Resolve-DbBackend -Config $Config
    $env:ATTENDANCE_DB_BACKEND = $dbBackend
    $env:ATTENDANCE_DATA_DIR = [System.IO.Path]::GetFullPath($Config.dataDir)
    $env:ATTENDANCE_BIND_HOST = [string]$Config.bindHost
    $env:ATTENDANCE_PORT = [string]$Config.port
    $env:ATTENDANCE_TIME_ZONE = [string]$Config.timeZone
    $env:ATTENDANCE_TRUST_PROXY = if ($Config.trustProxy) { 'true' } else { 'false' }
    $env:ATTENDANCE_SECURE_COOKIES = if ($Config.secureCookies) { 'true' } else { 'false' }
    $env:ATTENDANCE_AUTO_SEED = '0'

    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and -not [string]::IsNullOrWhiteSpace([string]$Config.databaseUrl)) {
        $env:DATABASE_URL = [string]$Config.databaseUrl
    }

    if ([string]::IsNullOrWhiteSpace($env:DATABASE_SSL_MODE) -and -not [string]::IsNullOrWhiteSpace([string]$Config.databaseSslMode)) {
        $env:DATABASE_SSL_MODE = [string]$Config.databaseSslMode
    }

    if ([string]::IsNullOrWhiteSpace([string]$Config.publicUrl)) {
        Remove-Item Env:ATTENDANCE_PUBLIC_URL -ErrorAction SilentlyContinue
    } else {
        $env:ATTENDANCE_PUBLIC_URL = [string]$Config.publicUrl
    }
}

$repoRoot = Get-RepoRoot
$config = Get-RuntimeConfig -RepoRoot $repoRoot
$dbBackend = Resolve-DbBackend -Config $config
$dataDir = [System.IO.Path]::GetFullPath([string]$config.dataDir)
$masterDbPath = Join-Path $dataDir 'data\master.db'
$logsDir = Join-Path $repoRoot 'logs'
$runtimeDir = Join-Path $repoRoot '.runtime'

Ensure-Directory -Path $logsDir
Ensure-Directory -Path $runtimeDir

if ($dbBackend -eq 'sqlite' -or $dbBackend -eq 'local') {
    if (-not (Test-Path $dataDir)) {
        throw "Data directory not found: $dataDir"
    }

    if (-not (Test-Path $masterDbPath)) {
        throw "Missing SQLite database: $masterDbPath"
    }

    $legacyElectronProcesses = Test-LegacyElectronRunning -DataDir $dataDir
    if ($legacyElectronProcesses.Count -gt 0) {
        $processList = ($legacyElectronProcesses | ForEach-Object { "$($_.ProcessName)#$($_.Id)" }) -join ', '
        if ($config.stopLegacyElectron -eq $false) {
            throw "Close the old Attendance/Electron app first before using this repo server. Running processes: $processList"
        }

        if (-not $ManagedChild) {
            Write-Host "Stopping old Attendance/Electron app: $processList" -ForegroundColor Yellow
        }

        $stoppedPids = Stop-LegacyElectronProcesses -Processes $legacyElectronProcesses
        if (-not (Wait-ForLegacyElectronExit -Processes $legacyElectronProcesses -TimeoutSeconds 15)) {
            throw "Stopped legacy Attendance/Electron processes but some are still exiting. Try running the launcher again in a few seconds. PIDs: $($stoppedPids -join ', ')"
        }

        Start-Sleep -Seconds 2
    }
} else {
    Ensure-Directory -Path $dataDir
}

Set-AppEnvironment -Config $config

Set-Location $repoRoot

if (-not $ManagedChild) {
    Write-Host "Starting local GMS server..." -ForegroundColor Cyan
    Write-Host "Database backend: $dbBackend"
    Write-Host "Data directory: $dataDir"
    Write-Host "Local URL: http://$($config.bindHost):$($config.port)"
    if (-not [string]::IsNullOrWhiteSpace([string]$config.publicUrl)) {
        Write-Host "Public URL: $($config.publicUrl)"
    }
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
}

if (($dbBackend -eq 'postgres' -or $dbBackend -eq 'cloud') -and [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw "DATABASE_URL is required when ATTENDANCE_DB_BACKEND is postgres. Set DATABASE_URL or local-runtime.config.json databaseUrl."
}

& node server.js
exit $LASTEXITCODE
