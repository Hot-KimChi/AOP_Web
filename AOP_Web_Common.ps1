# ============================================================
#  AOP_Web_Common.ps1
#  AOP Web Application - 공통 유틸리티 함수
#
#  Purpose  : Start/Stop 스크립트에서 공유하는 로깅·정리 함수
#  Usage    : . "$PSScriptRoot\AOP_Web_Common.ps1"  (dot-source)
#  Created  : 2026-04-25
#
#  호출 스크립트에서 사전 설정 필요:
#    $logFile                텍스트 로그 파일 경로
#    $jsonLogFile            JSON 로그 파일 경로
#    $script:jsonLogEntries  빈 배열 @() 로 초기화
#    $script:scriptName      호출 스크립트 이름 (JSON 로그용)
# ============================================================

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        $Metadata = @{}
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $timestampISO = [DateTimeOffset]::Now.ToString("o")

    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8

    $jsonEntry = [PSCustomObject]@{
        timestamp = $timestampISO
        level     = $Level
        message   = $Message
        script    = $script:scriptName
        metadata  = $Metadata
    }

    $script:jsonLogEntries += $jsonEntry
}

function Save-JsonLog {
    try {
        if ($script:jsonLogEntries.Count -gt 0) {
            $script:jsonLogEntries | ConvertTo-Json -Depth 10 |
                Out-File -FilePath $jsonLogFile -Encoding UTF8
        }
    } catch {
        Write-Host "Failed to save JSON log: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Clean-OldLogs {
    param(
        [string]$LogDirectory,
        [int]$RetentionDays,
        [int]$MaxSizeMB
    )

    try {
        # 디렉터리 스캔은 1회만 수행 (기존: old/all 두 번 스캔 → 중복 I/O 제거)
        $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
        $allLogs = @(Get-ChildItem -Path $LogDirectory -Include "*.log", "*.json" -Recurse)

        $oldLogs = @($allLogs | Where-Object { $_.LastWriteTime -lt $cutoffDate })
        if ($oldLogs.Count -gt 0) {
            $removedSize = ($oldLogs | Measure-Object -Property Length -Sum).Sum
            $oldLogs | Remove-Item -Force -ErrorAction SilentlyContinue

            $removedSizeMB = [math]::Round($removedSize / 1MB, 2)
            Write-Log "Removed $($oldLogs.Count) old log files ($removedSizeMB MB)" "INFO"

            # 삭제된 항목은 이후 용량 계산에서 제외 (재스캔 없이 메모리상에서 필터)
            $removedPaths = [System.Collections.Generic.HashSet[string]]::new([string[]]($oldLogs.FullName))
            $allLogs = @($allLogs | Where-Object { -not $removedPaths.Contains($_.FullName) })
        }

        $totalSize = ($allLogs | Measure-Object -Property Length -Sum).Sum
        $totalSizeMB = [math]::Round($totalSize / 1MB, 2)

        if ($totalSizeMB -gt $MaxSizeMB -and $allLogs.Count -gt 0) {
            Write-Log "Log directory size ($totalSizeMB MB) exceeds limit ($MaxSizeMB MB)" "WARN"

            $logsToRemove = $allLogs | Sort-Object LastWriteTime |
                            Select-Object -First ([math]::Ceiling($allLogs.Count * 0.3))

            $freedSize = ($logsToRemove | Measure-Object -Property Length -Sum).Sum
            $logsToRemove | Remove-Item -Force -ErrorAction SilentlyContinue

            $freedSizeMB = [math]::Round($freedSize / 1MB, 2)
            Write-Log "Removed $($logsToRemove.Count) oldest logs to free $freedSizeMB MB" "INFO"
        }

    } catch {
        Write-Log "Log cleanup failed: $($_.Exception.Message)" "WARN"
    }
}

function Get-ProcessesOnPort {
    <#
        지정한 포트를 실제 리스닝(LISTENING) 중인 프로세스 목록을 반환한다.
        Start_AOP_Web.ps1 / Stop_AOP_Web.ps1 이 각각 갖고 있던
        동일한 "포트→PID→프로세스" 탐지 로직을 공통화한 것.

        netstat 사용 이유(실측): Get-NetTCPConnection(CIM 기반)은 이 환경에서 호출당
        약 2.5~4.5초가 걸리는 반면, netstat 파싱은 약 70~100ms 로 30배 이상 빠름.
        또한 LISTENING 상태만 필터링하여, 단순 접속 중인 클라이언트(TIME_WAIT/ESTABLISHED)의
        PID를 오탐하여 잘못 종료하는 문제를 방지함 (정확도 개선).

        반환: [PSCustomObject]@{ ProcessId; ProcessName } 배열 (없으면 빈 배열)
    #>
    param([int]$Port)

    $lines = netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
    if (-not $lines) { return @() }

    $processIds = @()
    foreach ($line in $lines) {
        $tokens = ($line.Line.Trim() -split '\s+')
        # tokens: [0]Proto [1]LocalAddress [2]ForeignAddress [3]State [4]PID
        if ($tokens.Length -ge 5 -and $tokens[1] -match ":$Port$") {
            $processIds += [int]$tokens[4]
        }
    }
    $processIds = @($processIds | Where-Object { $_ -ne 0 } | Select-Object -Unique)

    if ($processIds.Count -eq 0) {
        Write-Log "Port $Port has only TIME_WAIT/kernel-owned connections (PID 0) - no real process to stop" "INFO"
        return @()
    }

    $result = @()
    foreach ($processId in $processIds) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $processName = if ($process) { $process.ProcessName } else { "Unknown" }
        Write-Log "Found process using port $Port : $processName (PID: $processId)" "INFO"
        $result += [PSCustomObject]@{ ProcessId = $processId; ProcessName = $processName }
    }
    return $result
}

function Test-PortListening {
    <# 지정한 포트가 LISTENING 상태인지 즉시 확인 (netstat 기반, Get-NetTCPConnection 대비 대폭 빠름) #>
    param([int]$Port)
    $line = netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
    return [bool]$line
}

function Wait-ForPortListening {
    <#
        지정한 포트가 LISTEN 상태가 될 때까지 짧은 간격으로 폴링한다.
        고정 sleep 후 검사하는 방식보다 평균 대기시간이 짧고,
        타임아웃 내내 최대한 빨리 결과를 반환한다.
    #>
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10,
        [int]$IntervalMilliseconds = 300
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds $IntervalMilliseconds
    }
    return $false
}
