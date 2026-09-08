param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5015,
  [int]$NextPort = 3000,
  [switch]$SkipVoiceService
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServiceDir = Join-Path $RepoRoot "services\voice-service"
$PythonExe = Join-Path $ServiceDir ".venv-doubao\Scripts\python.exe"
if (!(Test-Path $PythonExe)) {
  $PythonExe = Join-Path $ServiceDir ".venv\Scripts\python.exe"
}

# Cleanup child processes on Ctrl+C/exit.
$jobs = @()
$processes = @()

function Cleanup {
  Write-Host "`n[zhiqihq] Stopping services..." -ForegroundColor Yellow
  foreach ($p in $processes) {
    try {
      if (!$p.HasExited) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
      # ignore
    }
  }
  foreach ($j in $jobs) {
    try { Stop-Job -Job $j -ErrorAction SilentlyContinue } catch {}
    try { Remove-Job -Job $j -Force -ErrorAction SilentlyContinue } catch {}
  }
}

$cleanupHandler = {
  Cleanup
  [Console]::TreatControlCAsInput = $false
}

[Console]::TreatControlCAsInput = $false
# Register Ctrl+C event
$global:EngineIntrinsicEvent = Register-EngineEvent PowerShell.Exiting -Action {
  Cleanup
} | Out-Null

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Zhiheng Zhiqi - development environment" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Voice Service
if ($SkipVoiceService) {
  Write-Host "[skip] Voice Service skipped" -ForegroundColor Gray
} else {
  if (!(Test-Path $PythonExe)) {
    Write-Host "[error] Voice Service Python environment not found: $PythonExe" -ForegroundColor Red
    Write-Host "        Create the virtual environment under services\voice-service and install dependencies first." -ForegroundColor Red
    exit 1
  }

  $env:VOICE_SERVICE_OUTPUT_DIR = Join-Path $RepoRoot "storage\voice-service\outputs"

  Write-Host "[voice] Starting Voice Service..." -ForegroundColor Green
  Write-Host "        URL: http://${HostName}:${Port}" -ForegroundColor Gray
  Write-Host "        Cmd: $PythonExe -m uvicorn app.main:app --host $HostName --port $Port" -ForegroundColor Gray
  Write-Host ""

  $voiceJob = Start-Job -Name "voice-service" -ScriptBlock {
    param($PythonExe, $HostName, $Port, $ServiceDir, $OutputDir)
    $env:VOICE_SERVICE_OUTPUT_DIR = $OutputDir
    & $PythonExe -m uvicorn app.main:app --host $HostName --port $Port --app-dir $ServiceDir 2>&1
  } -ArgumentList $PythonExe, $HostName, $Port, $ServiceDir, $env:VOICE_SERVICE_OUTPUT_DIR
  $jobs += $voiceJob
}

# Next.js dev server
Write-Host "[next ] Starting Next.js Dev Server..." -ForegroundColor Green
Write-Host "        URL: http://localhost:${NextPort}" -ForegroundColor Gray
Write-Host "        Cmd: npm run dev -- --port $NextPort" -ForegroundColor Gray
Write-Host ""

# Start Next.js and collect logs.
$nextArgs = "run", "dev", "--", "--port", "$NextPort"
$nextProc = Start-Process -FilePath "npm.cmd" -ArgumentList $nextArgs `
  -WorkingDirectory $RepoRoot `
  -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $RepoRoot "logs\next-dev.log") `
  -RedirectStandardError (Join-Path $RepoRoot "logs\next-dev.err.log")
$processes += $nextProc

# Tail Next.js logs.
Start-Job -Name "next-log-tail" -ScriptBlock {
  param($LogFile)
  $lastLen = 0
  while ($true) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $LogFile) {
      $content = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
      if ($content -and $content.Length -gt $lastLen) {
        $newPart = $content.Substring($lastLen)
        if ($newPart.Trim().Length -gt 0) {
          Write-Host $newPart -ForegroundColor Cyan -NoNewline
        }
        $lastLen = $content.Length
      }
    }
  }
} -ArgumentList (Join-Path $RepoRoot "logs\next-dev.log") | Out-Null

# Wait for Voice Service readiness, up to 40 seconds.
if (!$SkipVoiceService) {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $res = Invoke-WebRequest -Uri "http://${HostName}:${Port}/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($res.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  if ($ready) {
    Write-Host "`n[ready] Voice Service is ready" -ForegroundColor Green
  } else {
    Write-Host "`n[warn ] Voice Service is still starting. Check the status indicator later." -ForegroundColor Yellow
  }
}

Write-Host "`n[ready] Development environment started" -ForegroundColor Green
Write-Host "        Next.js   → http://localhost:${NextPort}" -ForegroundColor White
Write-Host "        Voice Svc → http://${HostName}:${Port}" -ForegroundColor White
Write-Host "`n        Press Ctrl+C to stop all services.`n" -ForegroundColor Gray

# Wait for Next.js to exit.
try {
  $nextProc.WaitForExit()
} finally {
  Cleanup
}
