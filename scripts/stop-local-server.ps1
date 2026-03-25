$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.runtime\local-server.pid'
. (Join-Path $PSScriptRoot 'managed-local-server.ps1')

if (-not (Test-Path $pidFile)) {
    Write-Host 'No managed local server PID file found.'
    exit 0
}

$resolvedProcess = Resolve-ManagedServerProcess -PidFile $pidFile
if (-not $resolvedProcess.State) {
    Remove-ManagedServerState -PidFile $pidFile
    Write-Host 'Removed empty PID file.'
    exit 0
}

if ($resolvedProcess.IsManaged) {
    if (-not (Stop-ManagedServerTree -ResolvedProcess $resolvedProcess -TimeoutSeconds 15)) {
        throw "Failed to stop managed local server PID $($resolvedProcess.State.Pid)."
    }

    Remove-ManagedServerState -PidFile $pidFile
    Write-Host "Stopped managed local server PID $($resolvedProcess.State.Pid)."
    exit 0
}

Remove-ManagedServerState -PidFile $pidFile
Write-Host "Removed stale managed local server PID file ($($resolvedProcess.Reason))."
