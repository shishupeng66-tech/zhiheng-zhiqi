param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5015
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServiceDir = Join-Path $RepoRoot "services\voice-service"
$Python = Join-Path $ServiceDir ".venv-doubao\Scripts\python.exe"
if (!(Test-Path $Python)) {
  $Python = Join-Path $ServiceDir ".venv\Scripts\python.exe"
}

if (!(Test-Path $Python)) {
  throw "Voice Service Python runtime not found: $Python"
}

$env:VOICE_SERVICE_OUTPUT_DIR = Join-Path $RepoRoot "storage\voice-service\outputs"

& $Python -m uvicorn app.main:app --host $HostName --port $Port --app-dir $ServiceDir
