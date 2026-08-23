param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5015,
  [string]$Provider = "piper"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServiceDir = Join-Path $RepoRoot "services\voice-service"
$Python = Join-Path $ServiceDir ".venv\Scripts\python.exe"
$EspeakSource = Join-Path $ServiceDir ".venv\Lib\site-packages\piper\espeak-ng-data"
$EspeakTarget = "D:\a\piper1-gpl\piper1-gpl\_skbuild\win-amd64-3.9\cmake-build\espeak_ng-install\share\espeak-ng-data"

if (!(Test-Path $Python)) {
  throw "Voice Service Python runtime not found: $Python"
}

if ((Test-Path $EspeakSource) -and !(Test-Path (Join-Path $EspeakTarget "phontab"))) {
  New-Item -ItemType Directory -Force -Path $EspeakTarget | Out-Null
  Copy-Item -Path (Join-Path $EspeakSource "*") -Destination $EspeakTarget -Recurse -Force
}

$env:VOICE_SERVICE_PROVIDER = $Provider
$env:VOICE_SERVICE_OUTPUT_DIR = Join-Path $RepoRoot "storage\voice-service\outputs"
$env:VOICE_SERVICE_MODEL_CACHE = Join-Path $RepoRoot "storage\voice-service\models"
$env:PIPER_VOICE_DIR = Join-Path $RepoRoot "storage\voice-service\piper\zh_CN-huayan-medium"

& $Python -m uvicorn app.main:app --host $HostName --port $Port --app-dir $ServiceDir
