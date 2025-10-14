# AOP Web Application Auto Start Script
# Created: 2025-10-14

param(
    [switch]$NoAdmin,
    [switch]$Debug,
    [switch]$Production,
    [switch]$Help
)

# Set project path based on script location
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = $scriptPath
$logDir = Join-Path $projectPath "logs"
$logFile = Join-Path $logDir "startup_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

# Create log directory
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Show help information
if ($Help) {
    Write-Host "AOP Web Application Auto Start Script" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\Start_AOP_Web.ps1 [parameters]"
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Production    Start in production mode (build + start)"
    Write-Host "  -Debug         Run in debug mode with detailed logging"
    Write-Host "  -NoAdmin       Skip administrator privilege check"
    Write-Host "  -Help          Show this help information"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\Start_AOP_Web.ps1                    # Development mode"
    Write-Host "  .\Start_AOP_Web.ps1 -Production        # Production mode"
    Write-Host "  .\Start_AOP_Web.ps1 -Debug             # Development with debug"
    Write-Host "  .\Start_AOP_Web.ps1 -Production -Debug # Production with debug"
    Write-Host ""
    Write-Host "Modes:" -ForegroundColor Yellow
    Write-Host "  Development: Fast startup, hot reload, debugging tools"
    Write-Host "  Production:  Optimized build, better performance"
    Write-Host ""
    Exit 0
}

# Logging function
function Write-Log {
    param($Message, $Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

try {
    # Determine execution mode
    $mode = if ($Production) { "Production" } else { "Development" }
    
    Write-Log "=== Starting AOP Web Application ===" "INFO"
    Write-Log "Execution Mode: $mode" "INFO"
    Write-Log "Project Path: $projectPath" "INFO"
    
    # Check project structure
    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    
    if (!(Test-Path $backendPath)) {
        throw "Backend folder not found: $backendPath"
    }
    
    if (!(Test-Path $frontendPath)) {
        throw "Frontend folder not found: $frontendPath"
    }
    
    Write-Log "Project structure verified" "INFO"
    
    # Check Python virtual environment
    Write-Log "Preparing backend server..." "INFO"
    
    # Virtual environment Python executable path
    $venvPythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
    
    if (!(Test-Path $venvPythonPath)) {
        throw "Virtual environment not found: $venvPythonPath"
    }
    
    Write-Log "Virtual environment found: $venvPythonPath" "INFO"
    
    # Backend start command - change working directory to backend
    $backendCommand = "Set-Location '$backendPath'; Write-Host 'Backend Working Directory:' (Get-Location); & '$venvPythonPath' app.py"
    
    # Start backend server
    Write-Log "Starting backend server... (Port 5000)" "INFO"
    $backendProcess = Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-WindowStyle", "Normal",
        "-Command", $backendCommand
    ) -PassThru
    
    Write-Log "Backend Process ID: $($backendProcess.Id)" "INFO"
    
    # Wait for backend to start
    Start-Sleep -Seconds 5
    Write-Log "Backend startup wait completed" "INFO"
    
    # Check Node.js
    Write-Log "Checking Node.js environment..." "INFO"
    try {
        $nodeVersion = & node --version 2>$null
        Write-Log "Node.js version: $nodeVersion" "INFO"
    } catch {
        throw "Node.js is not installed or not in PATH"
    }
    
    # Check npm
    try {
        $npmVersion = & npm --version 2>$null
        Write-Log "npm version: $npmVersion" "INFO"
    } catch {
        throw "npm is not installed or not in PATH"
    }
    
    # Check package.json
    $packageJsonPath = Join-Path $frontendPath "package.json"
    if (!(Test-Path $packageJsonPath)) {
        throw "package.json not found: $packageJsonPath"
    }
    
    # Check and install node_modules if needed
    $nodeModulesPath = Join-Path $frontendPath "node_modules"
    if (!(Test-Path $nodeModulesPath)) {
        Write-Log "Installing dependencies with npm install..." "INFO"
        Set-Location $frontendPath
        & npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
        Write-Log "Dependencies installed successfully" "INFO"
        Set-Location $projectPath
    }
    
    # Start frontend server
    Write-Log "Starting frontend server... (Port 3000)" "INFO"
    
    if ($Production) {
        Write-Log "Production mode: Building and starting frontend..." "INFO"
        $frontendCommand = @"
Set-Location '$frontendPath'
Write-Host 'Frontend Working Directory:' (Get-Location)
Write-Host 'Building production bundle...'
npm run build
if (`$LASTEXITCODE -eq 0) {
    Write-Host 'Build successful! Starting production server...'
    npm start
} else {
    Write-Host 'Build failed! Check the errors above.' -ForegroundColor Red
    pause
}
"@
    } else {
        Write-Log "Development mode: Starting development server..." "INFO"
        $frontendCommand = "Set-Location '$frontendPath'; Write-Host 'Frontend Working Directory:' (Get-Location); npm run dev"
    }
    
    $frontendProcess = Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-WindowStyle", "Normal", 
        "-Command", $frontendCommand
    ) -PassThru
    
    Write-Log "Frontend Process ID: $($frontendProcess.Id)" "INFO"
    
    # Startup complete message - wait longer for production build
    if ($Production) {
        Write-Log "Waiting for production build to complete..." "INFO"
        Start-Sleep -Seconds 10
    } else {
        Start-Sleep -Seconds 2
    }
    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend: http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"
    Write-Log "Log file: $logFile" "INFO"
    
    if ($Debug) {
        Write-Log "Running in debug mode. Press any key to exit..." "DEBUG"
        Read-Host
    } else {
        Write-Log "Servers are running in separate windows." "INFO"
        Write-Log "To stop servers, press Ctrl+C in each server window." "INFO"
    }
    
} catch {
    $errorMessage = $_.Exception.Message
    Write-Log "Error occurred: $errorMessage" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    
    Write-Host "`nAn error occurred:" -ForegroundColor Red
    Write-Host $errorMessage -ForegroundColor Red
    Write-Host "`nCheck log file: $logFile" -ForegroundColor Yellow
    
    if ($Debug) {
        Read-Host "`nPress any key to continue..."
    }
    
    Exit 1
} finally {
    if ($Debug) {
        Write-Log "Script finished" "INFO"
    }
}