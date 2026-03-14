param(
    [string]$TaskName = 'GMS Postgres SQLite Hourly Backup',
    [int]$StartMinuteOffset = 5
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Build-TaskCommand {
    param(
        [string]$RepoRoot
    )

    $scriptPath = Join-Path $RepoRoot 'scripts\run-hourly-backup.ps1'
    if (-not (Test-Path $scriptPath)) {
        throw "Missing backup runner script: $scriptPath"
    }

    return "powershell -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
}

$repoRoot = Get-RepoRoot
$taskCommand = Build-TaskCommand -RepoRoot $repoRoot
$safeTaskName = $TaskName.Replace('"', '')

$now = Get-Date
$startTime = $now.AddMinutes([Math]::Max(0, $StartMinuteOffset))
$startTimeFormatted = $startTime.ToString('HH:mm')

Write-Host "Registering scheduled task: $safeTaskName" -ForegroundColor Cyan
Write-Host "Start time: $startTimeFormatted (then hourly)" -ForegroundColor Cyan
Write-Host "Command: $taskCommand" -ForegroundColor DarkGray

$createArgs = @(
    '/Create',
    '/F',
    '/SC', 'HOURLY',
    '/MO', '1',
    '/TN', $safeTaskName,
    '/TR', $taskCommand,
    '/ST', $startTimeFormatted,
    '/RL', 'LIMITED',
    '/IT'
)

$result = & schtasks.exe @createArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to register scheduled task. Output:`n$result"
}

Write-Host "Scheduled task created successfully." -ForegroundColor Green
Write-Host "You can run it now with:" -ForegroundColor Yellow
Write-Host "  schtasks /Run /TN `"$safeTaskName`"" -ForegroundColor Yellow
