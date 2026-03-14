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
        return $null
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

function Resolve-EnvValue {
    param(
        [string]$CurrentValue,
        [string]$FallbackValue
    )

    if ([string]::IsNullOrWhiteSpace($CurrentValue) -and -not [string]::IsNullOrWhiteSpace($FallbackValue)) {
        return $FallbackValue
    }

    return $CurrentValue
}

$repoRoot = Get-RepoRoot
$config = Get-RuntimeConfig -RepoRoot $repoRoot
$logsDir = Join-Path $repoRoot 'logs'
Ensure-Directory -Path $logsDir

$logPath = Join-Path $logsDir 'pg_sqlite_backup.log'
Start-Transcript -Path $logPath -Append | Out-Null

try {
    if ($config) {
        $env:ATTENDANCE_DATA_DIR = Resolve-EnvValue -CurrentValue $env:ATTENDANCE_DATA_DIR -FallbackValue ([string]$config.dataDir)
        $env:DATABASE_URL = Resolve-EnvValue -CurrentValue $env:DATABASE_URL -FallbackValue ([string]$config.databaseUrl)
        $env:DATABASE_SSL_MODE = Resolve-EnvValue -CurrentValue $env:DATABASE_SSL_MODE -FallbackValue ([string]$config.databaseSslMode)
        if (-not [string]::IsNullOrWhiteSpace([string]$config.backupDir)) {
            $env:POSTGRES_SQLITE_BACKUP_DIR = Resolve-EnvValue -CurrentValue $env:POSTGRES_SQLITE_BACKUP_DIR -FallbackValue ([string]$config.backupDir)
        }
    }

    if ([string]::IsNullOrWhiteSpace($env:DATABASE_SSL_MODE)) {
        $env:DATABASE_SSL_MODE = 'disable'
    }

    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        throw 'DATABASE_URL is required for PostgreSQL backup. Set DATABASE_URL or local-runtime.config.json databaseUrl.'
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw 'Node.js is required to run the backup. Ensure `node` is available in PATH for this task.'
    }

    Set-Location $repoRoot
    & $nodeCmd.Source (Join-Path $repoRoot 'scripts\backup-postgres-to-sqlite.js')
    exit $LASTEXITCODE
} finally {
    Stop-Transcript | Out-Null
}
