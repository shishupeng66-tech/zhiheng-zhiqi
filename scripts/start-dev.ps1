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

# 清理：遇到 Ctrl+C 时停止两个子进程
$jobs = @()
$processes = @()

function Cleanup {
  Write-Host "`n[zhiqihq] 正在停止所有服务..." -ForegroundColor Yellow
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
Write-Host "  知衡智企 - 一键启动开发环境" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# ── Voice Service ──────────────────────────────────────────────
if ($SkipVoiceService) {
  Write-Host "[skip] 已跳过 Voice Service 启动" -ForegroundColor Gray
} else {
  if (!(Test-Path $PythonExe)) {
    Write-Host "[error] Voice Service Python 环境不存在：$PythonExe" -ForegroundColor Red
    Write-Host "         请先在 services\voice-service\ 下创建虚拟环境并安装依赖。" -ForegroundColor Red
    exit 1
  }

  $env:VOICE_SERVICE_OUTPUT_DIR = Join-Path $RepoRoot "storage\voice-service\outputs"

  Write-Host "[voice] 正在启动 Voice Service..." -ForegroundColor Green
  Write-Host "        地址: http://${HostName}:${Port}" -ForegroundColor Gray
  Write-Host "        执行: $PythonExe -m uvicorn app.main:app --host $HostName --port $Port" -ForegroundColor Gray
  Write-Host ""

  $voiceJob = Start-Job -Name "voice-service" -ScriptBlock {
    param($PythonExe, $HostName, $Port, $ServiceDir, $OutputDir)
    $env:VOICE_SERVICE_OUTPUT_DIR = $OutputDir
    & $PythonExe -m uvicorn app.main:app --host $HostName --port $Port --app-dir $ServiceDir 2>&1
  } -ArgumentList $PythonExe, $HostName, $Port, $ServiceDir, $env:VOICE_SERVICE_OUTPUT_DIR
  $jobs += $voiceJob
}

# ── Next.js dev server ──────────────────────────────────────────
Write-Host "[next ] 正在启动 Next.js Dev Server..." -ForegroundColor Green
Write-Host "        地址: http://localhost:${NextPort}" -ForegroundColor Gray
Write-Host "        执行: npm run dev -- --port $NextPort" -ForegroundColor Gray
Write-Host ""

# 直接启动 Next.js 进程并收集输出
$nextArgs = "run", "dev", "--", "--port", "$NextPort"
$nextProc = Start-Process -FilePath "npm" -ArgumentList $nextArgs `
  -WorkingDirectory $RepoRoot `
  -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $RepoRoot "logs\next-dev.log") `
  -RedirectStandardError (Join-Path $RepoRoot "logs\next-dev.err.log")
$processes += $nextProc

# 实时显示 next 的日志
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

# 等待 voice-service 就绪（最多 40 秒），显示提示
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
    Write-Host "`n[ready] Voice Service 就绪 ✓" -ForegroundColor Green
  } else {
    Write-Host "`n[warn ] Voice Service 仍在启动中，请稍后检查状态指示器。" -ForegroundColor Yellow
  }
}

Write-Host "`n[ready] 开发环境启动完成" -ForegroundColor Green
Write-Host "        Next.js   → http://localhost:${NextPort}" -ForegroundColor White
Write-Host "        Voice Svc → http://${HostName}:${Port}" -ForegroundColor White
Write-Host "`n        按 Ctrl+C 停止所有服务。`n" -ForegroundColor Gray

# 挂起等待进程结束
try {
  $nextProc.WaitForExit()
} finally {
  Cleanup
}
