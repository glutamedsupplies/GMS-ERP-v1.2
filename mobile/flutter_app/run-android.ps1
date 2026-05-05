$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSCommandPath
$mobileRoot = Split-Path -Parent $appRoot
$flutterScript = Join-Path $mobileRoot 'flutter-local.ps1'

if (-not (Test-Path $flutterScript)) {
  throw "Flutter helper not found at '$flutterScript'."
}

Push-Location $appRoot
try {
  if (-not (Test-Path (Join-Path $appRoot 'android'))) {
    & $flutterScript create --no-pub --platforms=android --org com.gmserp --overwrite .
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  & $flutterScript pub get
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & $flutterScript run
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
