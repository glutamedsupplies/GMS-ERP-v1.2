function Get-ManagedProcessStartTimeUtc {
    param(
        [System.Diagnostics.Process]$Process
    )

    if (-not $Process) {
        return $null
    }

    try {
        return $Process.StartTime.ToUniversalTime()
    } catch {
        return $null
    }
}

function Read-ManagedServerState {
    param(
        [string]$PidFile
    )

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $raw = Get-Content $PidFile -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return [pscustomobject]@{
            IsValid      = $false
            IsLegacy     = $false
            Pid          = $null
            StartedAtUtc = $null
            ProcessName  = $null
            Raw          = $raw
        }
    }

    $trimmed = $raw.Trim()
    if ($trimmed -match '^\d+$') {
        return [pscustomobject]@{
            IsValid      = $true
            IsLegacy     = $true
            Pid          = [int]$trimmed
            StartedAtUtc = $null
            ProcessName  = 'powershell'
            Raw          = $trimmed
        }
    }

    try {
        $parsed = $trimmed | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return [pscustomobject]@{
            IsValid      = $false
            IsLegacy     = $false
            Pid          = $null
            StartedAtUtc = $null
            ProcessName  = $null
            Raw          = $trimmed
        }
    }

    $parsedPid = 0
    $hasPid = [int]::TryParse([string]$parsed.pid, [ref]$parsedPid)

    return [pscustomobject]@{
        IsValid      = $hasPid
        IsLegacy     = $false
        Pid          = if ($hasPid) { $parsedPid } else { $null }
        StartedAtUtc = [string]$parsed.startedAtUtc
        ProcessName  = [string]$parsed.processName
        Raw          = $trimmed
    }
}

function Test-ManagedServerProcessMatch {
    param(
        [pscustomobject]$State,
        [System.Diagnostics.Process]$Process
    )

    if (-not $State -or -not $State.IsValid -or -not $Process) {
        return $false
    }

    $expectedNames = @('powershell', 'pwsh')
    $processName = ''
    try {
        $processName = [string]$Process.ProcessName
    } catch {
        return $false
    }

    if ($processName -notin $expectedNames) {
        return $false
    }

    if (-not [string]::IsNullOrWhiteSpace($State.StartedAtUtc)) {
        try {
            $expectedStart = [DateTime]::Parse($State.StartedAtUtc).ToUniversalTime()
        } catch {
            return $false
        }

        $actualStart = Get-ManagedProcessStartTimeUtc -Process $Process
        if (-not $actualStart) {
            return $false
        }

        if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 2) {
            return $false
        }
    }

    return $true
}

function Resolve-ManagedServerProcess {
    param(
        [string]$PidFile
    )

    $state = Read-ManagedServerState -PidFile $PidFile
    $result = [ordered]@{
        State     = $state
        Process   = $null
        IsRunning = $false
        IsManaged = $false
        IsStale   = $false
        Reason    = 'missing-state'
    }

    if (-not $state) {
        return [pscustomobject]$result
    }

    if (-not $state.IsValid -or -not $state.Pid) {
        $result.IsStale = $true
        $result.Reason = 'invalid-state'
        return [pscustomobject]$result
    }

    $process = Get-Process -Id $state.Pid -ErrorAction SilentlyContinue
    if (-not $process) {
        $result.IsStale = $true
        $result.Reason = 'not-running'
        return [pscustomobject]$result
    }

    $result.Process = $process
    $result.IsRunning = $true

    if (-not (Test-ManagedServerProcessMatch -State $state -Process $process)) {
        $result.IsStale = $true
        $result.Reason = 'identity-mismatch'
        return [pscustomobject]$result
    }

    $result.IsManaged = $true
    $result.Reason = if ($state.IsLegacy) { 'legacy-pid-match' } else { 'matched' }
    return [pscustomobject]$result
}

function Write-ManagedServerState {
    param(
        [string]$PidFile,
        [System.Diagnostics.Process]$Process
    )

    if (-not $Process) {
        throw 'Managed server process is required.'
    }

    $startedAtUtc = Get-ManagedProcessStartTimeUtc -Process $Process
    $state = [ordered]@{
        pid          = $Process.Id
        startedAtUtc = if ($startedAtUtc) { $startedAtUtc.ToString('o') } else { $null }
        processName  = [string]$Process.ProcessName
    }

    $json = $state | ConvertTo-Json -Compress
    Set-Content -Path $PidFile -Value $json -Encoding ASCII
}

function Remove-ManagedServerState {
    param(
        [string]$PidFile
    )

    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Stop-ManagedServerTree {
    param(
        [pscustomobject]$ResolvedProcess,
        [int]$TimeoutSeconds = 15
    )

    if (-not $ResolvedProcess -or -not $ResolvedProcess.IsManaged -or -not $ResolvedProcess.State) {
        return $false
    }

    $managedPid = [int]$ResolvedProcess.State.Pid
    & cmd.exe /d /c "taskkill /PID $managedPid /T /F >nul 2>&1"

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $current = Get-Process -Id $managedPid -ErrorAction SilentlyContinue
        if (-not $current) {
            return $true
        }

        if (-not (Test-ManagedServerProcessMatch -State $ResolvedProcess.State -Process $current)) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}
