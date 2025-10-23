# AOP Web Application Auto Start Script
# Simplified and optimized version

param(
    [switch]$Production,
    [switch]$Debug,
    [switch]$NoAdmin,
    [switch]$Diagnose,
    [switch]$Help
)

#region Initialization
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = $scriptPath
$logDir = Join-Path $projectPath "logs"
$logTimestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = Join-Path $logDir "startup_$logTimestamp.log"
$jsonLogFile = Join-Path $logDir "startup_$logTimestamp.json"

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
        script = "Start_AOP_Web.ps1"
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

function Test-PortAvailability {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        return ($null -ne $connection)
    } catch {
        return $false
    }
}

function Stop-ProcessOnPort {
    param([int]$Port, [string]$ServiceName)
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        
        foreach ($processId in $processIds) {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Log "Found process using port $Port : $($process.ProcessName) (PID: $processId)" "WARN"
                    Write-Host "  Process: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                }
            } catch { }
        }
        
        Write-Host "`n$ServiceName (Port $Port) is already in use." -ForegroundColor Yellow
        $choice = Read-Host "Stop existing process and continue? (Y/N)"
        
        if ($choice -eq 'Y' -or $choice -eq 'y') {
            foreach ($processId in $processIds) {
                try {
                    Stop-Process -Id $processId -Force -ErrorAction Stop
                    Write-Log "Stopped process PID: $processId on port $Port" "INFO"
                    Start-Sleep -Milliseconds 500
                } catch {
                    Write-Log "Failed to stop process PID: $processId - $($_.Exception.Message)" "ERROR"
                    throw "Failed to stop process on port $Port"
                }
            }
            Write-Log "Port $Port is now available" "INFO"
        } else {
            throw "User cancelled - Port $Port is in use"
        }
    }
}
#endregion

#region Help
if ($Help) {
    Write-Host "AOP Web Application Auto Start Script" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\Start_AOP_Web.ps1 [-Production] [-Debug] [-NoAdmin] [-Diagnose]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Production    Production mode (build + optimized)"
    Write-Host "  -Debug         Debug mode with detailed logging"
    Write-Host "  -NoAdmin       Skip admin privilege check"
    Write-Host "  -Diagnose      Environment diagnosis only"
    Write-Host ""
    Exit 0
}
#endregion

#region Diagnosis Mode
if ($Diagnose) {
    Write-Host "`n=== Environment Diagnosis ===" -ForegroundColor Green
    
    # System info
    $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
    Write-Host "OS: $($osInfo.Caption) $($osInfo.Version)" -ForegroundColor Cyan
    Write-Host "Computer: $env:COMPUTERNAME | User: $env:USERNAME" -ForegroundColor Cyan
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)`n" -ForegroundColor Cyan
    
    # Python check
    Write-Host "Python:" -ForegroundColor Yellow
    $pythonFound = $false
    foreach ($cmd in @("python", "py")) {
        try {
            $pythonCmd = Get-Command $cmd -ErrorAction Stop
            $version = & $cmd --version 2>&1
            Write-Host "  [OK] $cmd - $version" -ForegroundColor Green
            $pythonFound = $true
            break
        } catch { }
    }
    if (-not $pythonFound) { Write-Host "  [X] Python not found" -ForegroundColor Red }
    
    # Node.js check
    Write-Host "`nNode.js:" -ForegroundColor Yellow
    try {
        $nodeVersion = & node --version 2>&1
        $npmVersion = & npm --version 2>&1
        Write-Host "  [OK] Node $nodeVersion | npm $npmVersion" -ForegroundColor Green
    } catch {
        Write-Host "  [X] Node.js/npm not found" -ForegroundColor Red
    }
    
    # Project structure
    Write-Host "`nProject:" -ForegroundColor Yellow
    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    
    $backendExists = Test-Path $backendPath
    $frontendExists = Test-Path $frontendPath
    Write-Host "  Backend: $(if ($backendExists) {'OK'} else {'MISSING'})" -ForegroundColor $(if ($backendExists) {'Green'} else {'Red'})
    Write-Host "  Frontend: $(if ($frontendExists) {'OK'} else {'MISSING'})" -ForegroundColor $(if ($frontendExists) {'Green'} else {'Red'})
    
    if ($backendExists) {
        $venvExists = Test-Path (Join-Path $backendPath ".venv\Scripts\python.exe")
        Write-Host "  Virtual Env: $(if ($venvExists) {'OK'} else {'MISSING'})" -ForegroundColor $(if ($venvExists) {'Green'} else {'Red'})
    }
    
    if ($frontendExists) {
        $nodeModulesExists = Test-Path (Join-Path $frontendPath "node_modules")
        Write-Host "  node_modules: $(if ($nodeModulesExists) {'OK'} else {'MISSING'})" -ForegroundColor $(if ($nodeModulesExists) {'Green'} else {'Red'})
    }
    
    Write-Host "`n=== Diagnosis Complete ===`n" -ForegroundColor Green
    Read-Host "Press Enter to exit"
    Exit 0
}
#endregion

#region Main Execution
try {
    $mode = if ($Production) { "Production" } else { "Development" }
    Write-Log "=== Starting AOP Web ($mode Mode) ===" "INFO"
    
    # Clean old logs
    Write-Log "Cleaning old logs..." "INFO"
    Clean-OldLogs -LogDirectory $logDir -RetentionDays $logRetentionDays -MaxSizeMB $maxLogDirSizeMB
    
    # Track started processes for cleanup on failure
    $backendProcess = $null
    $frontendProcess = $null
    
    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    
    # Verify project structure
    if (!(Test-Path $backendPath) -or !(Test-Path $frontendPath)) {
        throw "Project structure invalid. Run with -Diagnose to check."
    }
    
    #region Backend Setup
    Write-Log "Setting up backend..." "INFO"
    
    # Find Python (prefer virtual environment)
    $pythonExe = $null
    $venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
    
    if (Test-Path $venvPython) {
        $pythonExe = $venvPython
        Write-Log "Using virtual environment" "INFO"
    } else {
        # Try system Python
        foreach ($cmd in @("python", "py")) {
            try {
                $pythonCmd = Get-Command $cmd -ErrorAction Stop
                $pythonExe = $pythonCmd.Source
                Write-Log "Using system Python: $cmd" "WARN"
                break
            } catch { }
        }
    }
    
    if (-not $pythonExe) {
        throw "Python not found. Install Python or create virtual environment."
    }
    
    # Verify Python works
    $pythonVersion = & $pythonExe --version 2>&1
    Write-Log "Python version: $pythonVersion" "INFO"
    
    # Check and clear port 5000
    Write-Log "Checking port 5000..." "INFO"
    Stop-ProcessOnPort -Port 5000 -ServiceName "Backend"
    
    # Start backend
    Write-Log "Starting backend server (Port 5000)..." "INFO"
    $backendCmd = "Set-Location '$backendPath'; & '$pythonExe' app.py"
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -PassThru
    Write-Log "Backend PID: $($backendProcess.Id)" "INFO" @{ 
        service = "backend"
        pid = $backendProcess.Id
        port = 5000
        python = $pythonExe
    }
    
    # Verify backend started successfully
    Write-Log "Verifying backend startup..." "INFO"
    Start-Sleep -Seconds 3
    
    # Check if process is still running
    $backendRunning = Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
    if (-not $backendRunning) {
        throw "Backend process terminated unexpectedly. Check logs for errors."
    }
    
    # Check if port 5000 is listening
    $portListening = $false
    for ($i = 0; $i -lt 10; $i++) {
        $connection = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
        if ($connection) {
            $portListening = $true
            Write-Log "Backend is listening on port 5000" "INFO"
            break
        }
        Start-Sleep -Milliseconds 500
    }
    
    if (-not $portListening) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        throw "Backend failed to listen on port 5000. Check app.py for errors."
    }
    
    Write-Log "Backend started successfully" "INFO"
    #endregion
    
    #region Frontend Setup
    Write-Log "Setting up frontend..." "INFO"
    
    # Verify Node.js
    try {
        $nodeVersion = & node --version 2>&1
        $npmVersion = & npm --version 2>&1
        Write-Log "Node $nodeVersion | npm $npmVersion" "INFO"
    } catch {
        throw "Node.js/npm not found. Install Node.js first."
    }
    
    # Check node_modules
    $nodeModulesPath = Join-Path $frontendPath "node_modules"
    if (!(Test-Path $nodeModulesPath)) {
        Write-Log "Installing dependencies..." "INFO"
        Set-Location $frontendPath
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Set-Location $projectPath
    }
    
    # Check and clear port 3000
    Write-Log "Checking port 3000..." "INFO"
    Stop-ProcessOnPort -Port 3000 -ServiceName "Frontend"
    
    # Start frontend
    Write-Log "Starting frontend server (Port 3000)..." "INFO"
    
    if ($Production) {
        $frontendCmd = "Set-Location '$frontendPath'; npm run build; if (`$LASTEXITCODE -eq 0) { npm start } else { Write-Host 'Build failed!' -ForegroundColor Red; pause }"
        $waitTime = 10
    } else {
        $frontendCmd = "Set-Location '$frontendPath'; npm run dev"
        $waitTime = 2
    }
    
    $frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -PassThru
    Write-Log "Frontend PID: $($frontendProcess.Id)" "INFO" @{
        service = "frontend"
        pid = $frontendProcess.Id
        port = 3000
        mode = $mode
    }
    
    Start-Sleep -Seconds $waitTime
    #endregion
    
    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend:  http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"
    Write-Log "Log file: $logFile" "INFO"
    
    # Save JSON log
    Save-JsonLog
    
    if ($Debug) {
        Read-Host "`nPress Enter to exit"
    }
    
} catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $logFile" -ForegroundColor Yellow
    
    # Cleanup: Stop any processes that were started
    Write-Host "`nCleaning up started processes..." -ForegroundColor Yellow
    Write-Log "Starting cleanup process..." "INFO"
    
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        try {
            Write-Host "  Stopping frontend (PID: $($frontendProcess.Id))..." -ForegroundColor Yellow
            Stop-Process -Id $frontendProcess.Id -Force -ErrorAction Stop
            Write-Log "Stopped frontend process during cleanup" "INFO"
            Write-Host "  [OK] Frontend stopped" -ForegroundColor Green
        } catch {
            Write-Log "Failed to stop frontend during cleanup: $($_.Exception.Message)" "ERROR"
            Write-Host "  [FAIL] Could not stop frontend" -ForegroundColor Red
        }
    }
    
    if ($backendProcess -and -not $backendProcess.HasExited) {
        try {
            Write-Host "  Stopping backend (PID: $($backendProcess.Id))..." -ForegroundColor Yellow
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction Stop
            Write-Log "Stopped backend process during cleanup" "INFO"
            Write-Host "  [OK] Backend stopped" -ForegroundColor Green
        } catch {
            Write-Log "Failed to stop backend during cleanup: $($_.Exception.Message)" "ERROR"
            Write-Host "  [FAIL] Could not stop backend" -ForegroundColor Red
        }
    }
    
    Write-Host "`nStartup failed. Use -Diagnose to check environment." -ForegroundColor Red
    
    # Save JSON log even on error
    Save-JsonLog
    
    if ($Debug) {
        Write-Host "`nStack trace:" -ForegroundColor Yellow
        Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    }
    
    Read-Host "`nPress Enter to exit"
    Exit 1
}
#endregion