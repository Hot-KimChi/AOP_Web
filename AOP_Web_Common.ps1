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
        $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
        $oldLogs = Get-ChildItem -Path $LogDirectory -Include "*.log", "*.json" -Recurse |
                   Where-Object { $_.LastWriteTime -lt $cutoffDate }

        if ($oldLogs) {
            $removedCount = 0
            $removedSize = 0

            foreach ($log in $oldLogs) {
                $removedSize += $log.Length
                Remove-Item $log.FullName -Force -ErrorAction SilentlyContinue
                $removedCount++
            }

            $removedSizeMB = [math]::Round($removedSize / 1MB, 2)
            Write-Log "Removed $removedCount old log files ($removedSizeMB MB)" "INFO"
        }

        $allLogs = Get-ChildItem -Path $LogDirectory -Include "*.log", "*.json" -Recurse
        $totalSize = ($allLogs | Measure-Object -Property Length -Sum).Sum
        $totalSizeMB = [math]::Round($totalSize / 1MB, 2)

        if ($totalSizeMB -gt $MaxSizeMB) {
            Write-Log "Log directory size ($totalSizeMB MB) exceeds limit ($MaxSizeMB MB)" "WARN"

            $logsToRemove = $allLogs | Sort-Object LastWriteTime |
                            Select-Object -First ([math]::Ceiling($allLogs.Count * 0.3))

            $freedSize = 0
            foreach ($log in $logsToRemove) {
                $freedSize += $log.Length
                Remove-Item $log.FullName -Force -ErrorAction SilentlyContinue
            }

            $freedSizeMB = [math]::Round($freedSize / 1MB, 2)
            Write-Log "Removed $($logsToRemove.Count) oldest logs to free $freedSizeMB MB" "INFO"
        }

    } catch {
        Write-Log "Log cleanup failed: $($_.Exception.Message)" "WARN"
    }
}
