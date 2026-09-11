# AOP Web Application Auto Start Script
# Simplified and optimized version

param(
    [switch]$Production,
    [switch]$Debug,
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

# 초기화
$script:jsonLogEntries = @()
$script:scriptName = "Start_AOP_Web.ps1"

# 공통 유틸리티 함수 로드 (Write-Log, Save-JsonLog, Clean-OldLogs)
$commonScript = Join-Path $scriptPath "AOP_Web_Common.ps1"
if (!(Test-Path $commonScript)) {
    Write-Host "[ERROR] AOP_Web_Common.ps1 not found: $commonScript" -ForegroundColor Red
    Exit 1
}
. $commonScript

function Stop-ProcessOnPort {
    param([int]$Port, [string]$ServiceName)

    # 포트-프로세스 탐지 로직은 AOP_Web_Common.ps1 의 Get-ProcessesOnPort 로 공통화됨
    # (Stop_AOP_Web.ps1 과 중복 제거 + Get-Process 재조회 방지)
    $portProcesses = Get-ProcessesOnPort -Port $Port
    if ($portProcesses.Count -eq 0) { return }

    foreach ($p in $portProcesses) {
        Write-Host "  Process: $($p.ProcessName) (PID: $($p.ProcessId))" -ForegroundColor Yellow
    }

    Write-Host "`n$ServiceName (Port $Port) is already in use." -ForegroundColor Yellow

    # In production mode, automatically stop the process
    if ($Production) {
        Write-Host "Stopping process automatically in Production mode..." -ForegroundColor Yellow
        $choice = 'Y'
    } else {
        $choice = Read-Host "Stop existing process and continue? (Y/N)"
    }

    if ($choice -eq 'Y' -or $choice -eq 'y') {
        foreach ($p in $portProcesses) {
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
                Write-Log "Stopped process PID: $($p.ProcessId) on port $Port" "INFO"
                Start-Sleep -Milliseconds 500
            } catch {
                Write-Log "Failed to stop process PID: $($p.ProcessId) - $($_.Exception.Message)" "ERROR"
                throw "Failed to stop process on port $Port"
            }
        }
        Write-Log "Port $Port is now available" "INFO"
    } else {
        throw "User cancelled - Port $Port is in use"
    }
}
#endregion

#region Help
if ($Help) {
    Write-Host "AOP Web Application Auto Start Script" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\Start_AOP_Web.ps1 [-Production] [-Debug] [-Diagnose]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Production    Production mode (build + optimized)"
    Write-Host "  -Debug         Debug mode with detailed logging"
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
    
    # AOP_ENV: 자식 프로세스(Start-Process)는 현재 세션의 환경변수를 상속받음.
    # app.py 가 이 값을 읽어 개발 모드에서만 debug/reloader 를 활성화한다.
    $env:AOP_ENV = if ($Production) { "production" } else { "development" }
    Write-Log "AOP_ENV set to: $($env:AOP_ENV)" "INFO"
    
    if ($Production) {
        # Production mode: Start Python directly in hidden window
        $backendProcess = Start-Process -FilePath $pythonExe -ArgumentList "app.py" -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
    } else {
        # Development mode: Interactive window with PowerShell (-NoProfile for speed)
        $backendCmd = "Set-Location '$backendPath'; & '$pythonExe' app.py"
        $backendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $backendCmd -PassThru
    }
    
    Write-Log "Backend PID: $($backendProcess.Id)" "INFO" @{ 
        service = "backend"
        pid = $backendProcess.Id
        port = 5000
        python = $pythonExe
    }
    
    # Verify backend started successfully
    # 고정 5초 대기 후 검사하던 방식을 제거하고, 프로세스 최소 초기화 시간(500ms)만 대기한 뒤
    # 즉시 포트 폴링을 시작 — 정상 기동 시 평균 대기시간이 크게 단축됨
    Write-Log "Verifying backend startup..." "INFO"
    Start-Sleep -Milliseconds 500

    # Check if process is still running
    $backendRunning = Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
    if (-not $backendRunning) {
        throw "Backend process terminated unexpectedly. Check logs for errors."
    }

    # Check if port 5000 is listening (즉시 폴링, 최대 15초)
    $portListening = Wait-ForPortListening -Port 5000 -TimeoutSeconds 15 -IntervalMilliseconds 300
    if ($portListening) {
        Write-Log "Backend is listening on port 5000" "INFO"
    } else {
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
        # Production mode: Build and start in background
        Write-Log "Building frontend..." "INFO"
        Set-Location $frontendPath
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Set-Location $projectPath
            throw "Frontend build failed"
        }
        
        Write-Log "Starting frontend in production mode..." "INFO"
        # Start npm directly in hidden window
        $frontendProcess = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru
        Set-Location $projectPath
        $waitTime = 10
    } else {
        # Development mode: Interactive window (-NoProfile for speed)
        $frontendCmd = "Set-Location '$frontendPath'; npm run dev"
        $frontendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $frontendCmd -PassThru
        $waitTime = 10
    }
    Write-Log "Frontend PID: $($frontendProcess.Id)" "INFO" @{
        service = "frontend"
        pid = $frontendProcess.Id
        port = 3000
        mode = $mode
    }
    
    # 고정 대기(waitTime) 대신 포트 리스닝을 즉시 폴링 — 준비되는 즉시 다음 단계로 진행
    # (실패해도 치명적 오류로 취급하지 않음: 최초 컴파일 등으로 더 걸릴 수 있음)
    $frontendListening = Wait-ForPortListening -Port 3000 -TimeoutSeconds $waitTime -IntervalMilliseconds 300
    if ($frontendListening) {
        Write-Log "Frontend is listening on port 3000" "INFO"
    } else {
        Write-Log "Frontend port 3000 not detected within ${waitTime}s yet (may still be starting/compiling)" "WARN"
    }
    #endregion
    
    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend:  http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"
    Write-Log "Log file: $logFile" "INFO"
    
    # Save JSON log
    Save-JsonLog
    
    # Keep service running in Production mode
    if ($Production) {
        Write-Log "Production mode: Service will run indefinitely" "INFO"
        Write-Host "`nService running. Press Ctrl+C to stop." -ForegroundColor Yellow
        
        # Wait indefinitely (keeps service alive)
        try {
            while ($true) {
                Start-Sleep -Seconds 60
                # Optional: Health check every minute
                # netstat 기반 Test-PortListening 사용 (Get-NetTCPConnection/Test-NetConnection 대비 대폭 빠름)
                $backendAlive = Test-PortListening -Port 5000
                $frontendAlive = Test-PortListening -Port 3000
                
                if (-not $backendAlive) {
                    Write-Log "Backend health check failed on port 5000" "WARN"
                }
                if (-not $frontendAlive) {
                    Write-Log "Frontend health check failed on port 3000" "WARN"
                }
            }
        } catch {
            Write-Log "Service loop interrupted: $($_.Exception.Message)" "INFO"
        }
    } elseif ($Debug) {
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
    
    # Don't wait for user input in Production mode
    if (-not $Production) {
        Read-Host "`nPress Enter to exit"
    }
    Exit 1
}
#endregion
