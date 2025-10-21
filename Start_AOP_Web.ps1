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
$logFile = Join-Path $logDir "startup_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param($Message, $Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
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
    
    # Start backend
    Write-Log "Starting backend server (Port 5000)..." "INFO"
    $backendCmd = "Set-Location '$backendPath'; & '$pythonExe' app.py"
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -PassThru
    Write-Log "Backend PID: $($backendProcess.Id)" "INFO"
    
    Start-Sleep -Seconds 3
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
    Write-Log "Frontend PID: $($frontendProcess.Id)" "INFO"
    
    Start-Sleep -Seconds $waitTime
    #endregion
    
    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend:  http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"
    Write-Log "Log file: $logFile" "INFO"
    
    if ($Debug) {
        Read-Host "`nPress Enter to exit"
    }
    
} catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $logFile" -ForegroundColor Yellow
    
    if ($Debug) {
        Write-Host "`nStack trace:" -ForegroundColor Yellow
        Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    }
    
    Read-Host "`nPress Enter to exit"
    Exit 1
}
#endregion