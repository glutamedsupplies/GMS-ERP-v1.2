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

function Set-AppEnvironment {
    param(
        [pscustomobject]$Config
    )

    $env:ATTENDANCE_DB_BACKEND = 'sqlite'
    $env:ATTENDANCE_DATA_DIR = [System.IO.Path]::GetFullPath($Config.dataDir)
    $env:ATTENDANCE_BIND_HOST = [string]$Config.bindHost
    $env:ATTENDANCE_PORT = [string]$Config.port
    $env:ATTENDANCE_TIME_ZONE = [string]$Config.timeZone
    $env:ATTENDANCE_TRUST_PROXY = if ($Config.trustProxy) { 'true' } else { 'false' }
    $env:ATTENDANCE_SECURE_COOKIES = if ($Config.secureCookies) { 'true' } else { 'false' }
    $env:ATTENDANCE_AUTO_SEED = '0'

    if ([string]::IsNullOrWhiteSpace([string]$Config.publicUrl)) {
        Remove-Item Env:ATTENDANCE_PUBLIC_URL -ErrorAction SilentlyContinue
    } else {
        $env:ATTENDANCE_PUBLIC_URL = [string]$Config.publicUrl
    }
}

$repoRoot = Get-RepoRoot
$config = Get-RuntimeConfig -RepoRoot $repoRoot
$dataDir = [System.IO.Path]::GetFullPath([string]$config.dataDir)
$masterDbPath = Join-Path $dataDir 'data\master.db'
$logsDir = Join-Path $repoRoot 'logs'
$runtimeDir = Join-Path $repoRoot '.runtime'

Ensure-Directory -Path $logsDir
Ensure-Directory -Path $runtimeDir

if (-not (Test-Path $dataDir)) {
    throw "Data directory not found: $dataDir"
}

if (-not (Test-Path $masterDbPath)) {
    throw "Missing SQLite database: $masterDbPath"
}

$legacyElectronProcesses = Test-LegacyElectronRunning -DataDir $dataDir
if ($legacyElectronProcesses.Count -gt 0) {
    $processList = ($legacyElectronProcesses | ForEach-Object { "$($_.ProcessName)#$($_.Id)" }) -join ', '
    throw "Close the old Attendance/Electron app first before using this repo server. Running processes: $processList"
}

Set-AppEnvironment -Config $config

Set-Location $repoRoot

if (-not $ManagedChild) {
    Write-Host "Starting local GMS server..." -ForegroundColor Cyan
    Write-Host "Data directory: $dataDir"
    Write-Host "Local URL: http://$($config.bindHost):$($config.port)"
    if (-not [string]::IsNullOrWhiteSpace([string]$config.publicUrl)) {
        Write-Host "Public URL: $($config.publicUrl)"
    }
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
}

& node server.js
exit $LASTEXITCODE
