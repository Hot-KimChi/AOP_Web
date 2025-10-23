# AOP Web Application Stop Script
# Safely stops backend and frontend processes

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

# Initialize JSON log array
$script:jsonLogEntries = @()

function Write-Log {
    param(
        $Message, 
        $Level = "INFO",
        $Metadata = @{}
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $timestampISO = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
    
    # Text log
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
    
    # JSON log entry
    $jsonEntry = [PSCustomObject]@{
        timestamp = $timestampISO
        level = $Level
        message = $Message
        script = "Stop_AOP_Web.ps1"
        metadata = $Metadata
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
        # Remove logs older than retention period (both .log and .json)
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
        
        # Check total log directory size
        $allLogs = Get-ChildItem -Path $LogDirectory -Include "*.log", "*.json" -Recurse
        $totalSize = ($allLogs | Measure-Object -Property Length -Sum).Sum
        $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
        
        if ($totalSizeMB -gt $MaxSizeMB) {
            Write-Log "Log directory size ($totalSizeMB MB) exceeds limit ($MaxSizeMB MB)" "WARN"
            
            # Remove oldest logs until under limit
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

function Stop-ServiceOnPort {
    param([int]$Port, [string]$ServiceName)
    
    Write-Log "Checking $ServiceName on port $Port..." "INFO"
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        
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
    Write-Host "`n=== AOP Web Application Shutdown ===" -ForegroundColor Green
    Write-Log "=== Starting shutdown process ===" "INFO"
    
    # Clean old logs
    Clean-OldLogs -LogDirectory $logDir -RetentionDays $logRetentionDays -MaxSizeMB $maxLogDirSizeMB
    
    $stopped = $false
    
    # Stop Frontend (Port 3000)
    if (Stop-ServiceOnPort -Port 3000 -ServiceName "Frontend") {
        $stopped = $true
    }
    
    Write-Host ""
    
    # Stop Backend (Port 5000)
    if (Stop-ServiceOnPort -Port 5000 -ServiceName "Backend") {
        $stopped = $true
    }
    
    Write-Host ""
    
    if ($stopped) {
        Write-Log "=== Shutdown complete ===" "INFO"
        Write-Host "=== Shutdown Complete ===" -ForegroundColor Green
    } else {
        Write-Log "No running services found" "INFO"
        Write-Host "=== No Running Services Found ===" -ForegroundColor Yellow
    }
    
    Write-Host "Log file: $logFile" -ForegroundColor Cyan
    
    # Save JSON log
    Save-JsonLog
    
    if (-not $Force) {
        Read-Host "`nPress Enter to exit"
    }
    
} catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $logFile" -ForegroundColor Yellow
    
    # Save JSON log even on error
    Save-JsonLog
    
    Read-Host "`nPress Enter to exit"
    Exit 1
}
#endregion
