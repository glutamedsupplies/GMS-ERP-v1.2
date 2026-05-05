$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'managed-local-server.ps1')

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

function Resolve-CloudflaredConfigPath {
    param(
        [string]$RepoRoot,
        [string]$ConfiguredPath
    )

    $normalized = [string]$ConfiguredPath
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return $null
    }

    if (-not [System.IO.Path]::IsPathRooted($normalized)) {
        $normalized = Join-Path $RepoRoot $normalized
    }

    if (-not (Test-Path $normalized)) {
        throw "Cloudflared config file not found: $normalized"
    }

    return (Resolve-Path $normalized).Path
}

function Start-CloudflaredTunnel {
    param(
        [string]$Cloudflared,
        [pscustomobject]$Config,
        [string]$RepoRoot
    )

    $tunnelName = [string]$Config.cloudflaredTunnelName
    $configPath = Resolve-CloudflaredConfigPath -RepoRoot $RepoRoot -ConfiguredPath ([string]$Config.cloudflaredConfigPath)

    if (-not [string]::IsNullOrWhiteSpace($tunnelName)) {
        if ($configPath) {
            Write-Host "Using Cloudflared config: $configPath" -ForegroundColor DarkGray
            & $Cloudflared --config $configPath tunnel run $tunnelName
            return
        }

        & $Cloudflared tunnel run $tunnelName
        return
    }

    & $Cloudflared tunnel --url "http://127.0.0.1:$($config.port)" --protocol ([string]$config.cloudflaredProtocol)
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

$repoRoot = Get-RepoRoot
$paths = Get-RuntimePaths -RepoRoot $repoRoot
$config = Get-RuntimeConfig -ConfigPath $paths.ConfigPath
$cloudflared = Get-CloudflaredCommand -ConfiguredPath $config.cloudflaredPath
$localUrl = "http://127.0.0.1:$($config.port)/api/server-info"
$serverProcess = $null
$localServerReady = $false
$staleStateReason = $null

if (Test-Path $paths.PidFile) {
    $resolvedExisting = Resolve-ManagedServerProcess -PidFile $paths.PidFile
    if ($resolvedExisting.IsManaged) {
        if (Wait-ForLocalServer -Url $localUrl -TimeoutSeconds 15) {
            $serverProcess = $resolvedExisting.Process
            $localServerReady = $true
            Write-Host "Reusing managed local server PID $($resolvedExisting.State.Pid)." -ForegroundColor DarkYellow
        } else {
            Write-Warning "Managed local server PID $($resolvedExisting.State.Pid) is not responding. Restarting it."
            if (-not (Stop-ManagedServerTree -ResolvedProcess $resolvedExisting -TimeoutSeconds 15)) {
                throw "Managed local server PID $($resolvedExisting.State.Pid) is running but not responding. Run .\stop-local-server.cmd first."
            }

            Remove-ManagedServerState -PidFile $paths.PidFile
            Write-Host "Stopped unresponsive managed local server PID $($resolvedExisting.State.Pid)." -ForegroundColor DarkYellow
        }
    } elseif ($resolvedExisting.State) {
        $staleStateReason = $resolvedExisting.Reason
    }

    if (-not $serverProcess) {
        Remove-ManagedServerState -PidFile $paths.PidFile
    }

    if (-not $serverProcess -and $staleStateReason) {
        Write-Host "Removed stale managed local server PID file ($staleStateReason)." -ForegroundColor DarkYellow
    }
}

if (-not $serverProcess) {
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

    Write-ManagedServerState -PidFile $paths.PidFile -Process $serverProcess
}

try {
    if (-not $localServerReady -and -not (Wait-ForLocalServer -Url $localUrl -TimeoutSeconds 45)) {
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

    Start-CloudflaredTunnel -Cloudflared $cloudflared -Config $config -RepoRoot $repoRoot
} finally {
    $resolvedServer = Resolve-ManagedServerProcess -PidFile $paths.PidFile
    if ($resolvedServer.IsManaged) {
        if (Stop-ManagedServerTree -ResolvedProcess $resolvedServer -TimeoutSeconds 15) {
            Remove-ManagedServerState -PidFile $paths.PidFile
        } else {
            Write-Warning "Failed to stop managed local server PID $($resolvedServer.State.Pid). Run .\stop-local-server.cmd."
        }
    }

    if ($resolvedServer.IsStale) {
        Remove-ManagedServerState -PidFile $paths.PidFile
    }
}
