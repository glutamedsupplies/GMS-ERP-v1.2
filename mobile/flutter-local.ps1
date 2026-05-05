param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$FlutterArgs
)

$ErrorActionPreference = 'Stop'

$mobileRoot = Split-Path -Parent $PSCommandPath
$flutterBat = Join-Path $mobileRoot 'flutter\bin\flutter.bat'
if (-not (Test-Path $flutterBat)) {
  throw "Local Flutter SDK not found at '$flutterBat'."
}

$javaCandidates = @(
  $env:JAVA_HOME,
  'C:\Program Files\Android\Android Studio\jbr',
  'C:\Program Files\Android\Android Studio\jre'
) | Where-Object { $_ }

$resolvedJavaHome = $javaCandidates |
  Where-Object { Test-Path (Join-Path $_ 'bin\java.exe') } |
  Select-Object -First 1

if (-not $resolvedJavaHome) {
  throw 'Java was not found. Install Android Studio or set JAVA_HOME first.'
}

$sdkCandidates = @(
  $env:ANDROID_SDK_ROOT,
  $env:ANDROID_HOME,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object { $_ }

$resolvedSdkRoot = $sdkCandidates |
  Where-Object { Test-Path (Join-Path $_ 'platform-tools') } |
  Select-Object -First 1

if (-not $resolvedSdkRoot) {
  throw 'Android SDK was not found. Install Android Studio SDK or set ANDROID_SDK_ROOT first.'
}

$pubCache = Join-Path $mobileRoot '.pub-cache'
if (-not (Test-Path $pubCache)) {
  New-Item -ItemType Directory -Path $pubCache | Out-Null
}

$env:JAVA_HOME = $resolvedJavaHome
$env:ANDROID_SDK_ROOT = $resolvedSdkRoot
$env:ANDROID_HOME = $resolvedSdkRoot
$env:PUB_CACHE = $pubCache
$env:Path = "$(Join-Path $mobileRoot 'flutter\bin');$env:Path"

& $flutterBat @FlutterArgs
exit $LASTEXITCODE
