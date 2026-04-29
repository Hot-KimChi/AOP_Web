# ============================================================
#  Stop_AOP_Web.ps1
#  AOP Web Application - Shutdown Script
#
#  Purpose  : Backend(5000) / Frontend(3000) 프로세스를 안전하게 종료
#  Usage    : .\Stop_AOP_Web.ps1 [-Force] [-Help]
#  Requires : 관리자 권한 (자동 상승)
#  Created  : 2025-12-13
#  Modified : 2026-02-27  관리자 권한 자동 상승 추가, 가독성 개선
#  Ref      : Start_AOP_Web.ps1 과 동일한 로깅/구조 패턴
# ============================================================

param(
    [switch]$Force,
    [switch]$Help
)

#region Initialization
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = $scriptPath
$logDir = Join-Path $projectPath "logs"
$logTimestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = Join-Path $logDir "shutdown_$logTimestamp.log"
$jsonLogFile = Join-Path $logDir "shutdown_$logTimestamp.json"

# Log rotation settings
$logRetentionDays = 30
$maxLogDirSizeMB = 500

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# 초기화
$script:jsonLogEntries = @()
$script:scriptName = "Stop_AOP_Web.ps1"

# 공통 유틸리티 함수 로드 (Write-Log, Save-JsonLog, Clean-OldLogs)
$commonScript = Join-Path $scriptPath "AOP_Web_Common.ps1"
if (!(Test-Path $commonScript)) {
    Write-Host "[ERROR] AOP_Web_Common.ps1 not found: $commonScript" -ForegroundColor Red
    Exit 1
}
. $commonScript

function Stop-ServiceOnPort {
    param([int]$Port, [string]$ServiceName)
    
    Write-Log "Checking $ServiceName on port $Port..." "INFO"
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        # PID 0 = TIME_WAIT 상태 (커널 소유) — 실제 프로세스가 아니므로 제외
        $processIds = $connections |
            Where-Object { $_.OwningProcess -ne 0 } |
            Select-Object -ExpandProperty OwningProcess -Unique

        if (-not $processIds) {
            Write-Log "Port $Port has only TIME_WAIT connections (PID 0) — no process to stop" "INFO"
            Write-Host "  No active process on port $Port (TIME_WAIT only)" -ForegroundColor Gray
            return $false
        }
        
        Write-Host "`nFound $ServiceName processes:" -ForegroundColor Yellow
        foreach ($processId in $processIds) {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "  - $($process.ProcessName) (PID: $processId)" -ForegroundColor Cyan
                    Write-Log "Found process: $($process.ProcessName) (PID: $processId)" "INFO"
                }
            } catch { }
        }
        
        if (-not $Force) {
            $choice = Read-Host "`nStop these processes? (Y/N)"
            if ($choice -ne 'Y' -and $choice -ne 'y') {
                Write-Log "User cancelled shutdown of $ServiceName" "INFO"
                return $false
            }
        }
        
        foreach ($processId in $processIds) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Log "Stopped process PID: $processId" "INFO"
                Write-Host "  [OK] Stopped PID: $processId" -ForegroundColor Green
            } catch {
                Write-Log "Failed to stop PID: $processId - $($_.Exception.Message)" "ERROR"
                Write-Host "  [FAIL] Could not stop PID: $processId" -ForegroundColor Red
            }
        }
        
        Start-Sleep -Milliseconds 500
        return $true
    } else {
        Write-Log "No process found on port $Port" "INFO"
        Write-Host "  No process found on port $Port" -ForegroundColor Gray
        return $false
    }
}
#endregion

#region Admin Elevation
# ── 관리자 권한 확인 및 자동 상승 ──────────────────────────
# Get-NetTCPConnection, Stop-Process -Force 등은 관리자 권한이 필요합니다.
# 일반 사용자로 실행된 경우 UAC 를 통해 자동으로 관리자 권한으로 재실행합니다.
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
$isAdmin = $currentPrincipal.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    Write-Host "[INFO] Requesting administrator privileges..." -ForegroundColor Yellow

    # 현재 스크립트의 인자를 그대로 전달하여 관리자 권한으로 재실행
    $arguments = @("-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($Force) { $arguments += "-Force" }
    if ($Help)  { $arguments += "-Help"  }

    try {
        Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    } catch {
        Write-Host "[ERROR] Failed to elevate privileges: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "`nPress Enter to exit"
        Exit 1
    }

    # 현재(비관리자) 세션은 종료
    Exit 0
}
#endregion

#region Help
if ($Help) {
    Write-Host "AOP Web Application Stop Script" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\Stop_AOP_Web.ps1 [-Force]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Force    Stop processes without confirmation"
    Write-Host ""
    Exit 0
}
#endregion

#region Main Execution
try {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  AOP Web Application Shutdown"               -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Log "=== Starting shutdown process ===" "INFO"

    # ── Step 1: 오래된 로그 정리 ──
    Clean-OldLogs -LogDirectory $logDir -RetentionDays $logRetentionDays -MaxSizeMB $maxLogDirSizeMB

    $stopped = $false

    # ── Step 2: Frontend 종료 (Port 3000) ──
    Write-Host "---- Frontend (Port 3000) ----" -ForegroundColor Cyan
    if (Stop-ServiceOnPort -Port 3000 -ServiceName "Frontend") {
        $stopped = $true
    }
    Write-Host ""

    # ── Step 3: Backend 종료 (Port 5000) ──
    Write-Host "---- Backend  (Port 5000) ----" -ForegroundColor Cyan
    if (Stop-ServiceOnPort -Port 5000 -ServiceName "Backend") {
        $stopped = $true
    }
    Write-Host ""

    # ── 결과 출력 ──
    Write-Host "=============================================" -ForegroundColor Green
    if ($stopped) {
        Write-Log "=== Shutdown complete ===" "INFO"
        Write-Host "  Result : Shutdown Complete"               -ForegroundColor Green
    } else {
        Write-Log "No running services found" "INFO"
        Write-Host "  Result : No Running Services Found"       -ForegroundColor Yellow
    }
    Write-Host "  Log    : $logFile"                            -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Green

    # JSON 로그 저장
    Save-JsonLog

    if (-not $Force) {
        Read-Host "`nPress Enter to exit"
    }

} catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Log  : $logFile"                  -ForegroundColor Yellow

    # 오류 발생 시에도 JSON 로그 저장
    Save-JsonLog

    Read-Host "`nPress Enter to exit"
    Exit 1
}
#endregion
