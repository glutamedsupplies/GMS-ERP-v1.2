$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-RuntimePaths {
    param(
        [string]$RepoRoot
    )

    $paths = [ordered]@{
        RepoRoot = $RepoRoot
        LogsDir = Join-Path $RepoRoot 'logs'
        RuntimeDir = Join-Path $RepoRoot '.runtime'
        PidFile = Join-Path $RepoRoot '.runtime\local-server.pid'
        StdOutLog = Join-Path $RepoRoot 'logs\local-server.log'
        StdErrLog = Join-Path $RepoRoot 'logs\local-server-error.log'
        StartScript = Join-Path $RepoRoot 'scripts\start-local-server.ps1'
        ConfigPath = Join-Path $RepoRoot 'local-runtime.config.json'
    }

    foreach ($path in @($paths.LogsDir, $paths.RuntimeDir)) {
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }

    return [pscustomobject]$paths
}

function Get-RuntimeConfig {
    param(
        [string]$ConfigPath
    )

    if (-not (Test-Path $ConfigPath)) {
        throw "Missing config file: $ConfigPath"
    }

    return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

function Get-CloudflaredCommand {
    param(
        [string]$ConfiguredPath
    )

    $normalized = [string]$ConfiguredPath
    if (-not [string]::IsNullOrWhiteSpace($normalized)) {
        $command = Get-Command $normalized -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }

        if (Test-Path $normalized) {
            return (Resolve-Path $normalized).Path
        }
    }

    $fallback = Get-Command 'cloudflared.exe' -ErrorAction SilentlyContinue
    if ($fallback) {
        return $fallback.Source
    }

    throw 'cloudflared.exe was not found. Install Cloudflare Tunnel first or update local-runtime.config.json.'
}

function Wait-ForLocalServer {
    param(
        [string]$Url,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

function Stop-ManagedServer {
    param(
        [string]$PidFile,
        [System.Diagnostics.Process]$Process
    )

    $stopped = $false
    if ($Process -and -not $Process.HasExited) {
        & taskkill /PID $Process.Id /T /F *> $null
        $stopped = $true
    }

    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    return $stopped
}

$repoRoot = Get-RepoRoot
$paths = Get-RuntimePaths -RepoRoot $repoRoot
$config = Get-RuntimeConfig -ConfigPath $paths.ConfigPath
$cloudflared = Get-CloudflaredCommand -ConfiguredPath $config.cloudflaredPath
$localUrl = "http://127.0.0.1:$($config.port)/api/server-info"

if (Test-Path $paths.PidFile) {
    $existingPid = Get-Content $paths.PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        throw "A managed local server is already running with PID $existingPid. Run stop-local-server.cmd first."
    }

    Remove-Item $paths.PidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Starting local server in the background..." -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $paths.StartScript,
        '-ManagedChild'
    ) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $paths.StdOutLog `
    -RedirectStandardError $paths.StdErrLog `
    -PassThru

Set-Content -Path $paths.PidFile -Value $serverProcess.Id -Encoding ASCII

try {
    if (-not (Wait-ForLocalServer -Url $localUrl -TimeoutSeconds 45)) {
        $errorTail = ''
        if (Test-Path $paths.StdErrLog) {
            $errorTail = (Get-Content $paths.StdErrLog -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        }

        throw ("Local server did not start within 45 seconds.`nLog: {0}`n{1}" -f $paths.StdErrLog, $errorTail)
    }

    Write-Host "Local server ready at http://127.0.0.1:$($config.port)" -ForegroundColor Green
    Write-Host "Cloudflared command: $cloudflared"
    Write-Host "Keep this window open while using the public tunnel." -ForegroundColor Yellow
    Write-Host ""

    & $cloudflared tunnel --url "http://127.0.0.1:$($config.port)" --protocol ([string]$config.cloudflaredProtocol)
} finally {
    Stop-ManagedServer -PidFile $paths.PidFile -Process $serverProcess | Out-Null
}
