$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.runtime\local-server.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host 'No managed local server PID file found.'
    exit 0
}

$pid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pid) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed empty PID file.'
    exit 0
}

$process = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($process) {
    & taskkill /PID $pid /T /F *> $null
    Write-Host "Stopped managed local server PID $pid."
} else {
    Write-Host "Managed local server PID $pid is no longer running."
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
