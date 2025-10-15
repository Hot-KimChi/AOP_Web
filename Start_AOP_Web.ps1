# AOP Web Application Auto Start Script
# Created: 2025-10-14

param(
    [switch]$NoAdmin,
    [switch]$Debug,
    [switch]$Production,
    [switch]$Help,
    [switch]$Diagnose
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
    Write-Host "  -Diagnose      Run environment diagnosis only"
    Write-Host "  -Help          Show this help information"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\Start_AOP_Web.ps1                    # Development mode"
    Write-Host "  .\Start_AOP_Web.ps1 -Production        # Production mode"
    Write-Host "  .\Start_AOP_Web.ps1 -Diagnose          # Environment diagnosis"
    Write-Host "  .\Start_AOP_Web.ps1 -Debug             # Development with debug"
    Write-Host "  .\Start_AOP_Web.ps1 -Production -Debug # Production with debug"
    Write-Host ""
    Write-Host "Modes:" -ForegroundColor Yellow
    Write-Host "  Development: Fast startup, hot reload, debugging tools"
    Write-Host "  Production:  Optimized build, better performance"
    Write-Host ""
    Exit 0
}

# Functions must be defined before they're called - moved diagnosis mode after functions

# Logging function
function Write-Log {
    param($Message, $Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

# Windows environment diagnosis function
function Test-WindowsEnvironment {
    param($ProjectPath)
    
    Write-Log "=== Windows Environment Diagnosis ===" "INFO"
    
    # Check Windows version
    $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
    Write-Log "Windows Version: $($osInfo.Caption) $($osInfo.Version)" "INFO"
    Write-Log "Computer Name: $($env:COMPUTERNAME)" "INFO"
    Write-Log "User: $($env:USERNAME)" "INFO"
    Write-Log "PowerShell Version: $($PSVersionTable.PSVersion)" "INFO"
    
    # Check Python installations (Windows specific paths)
    Write-Log "Checking Python installations..." "INFO"
    
    $pythonPaths = @(
        "python",
        "python3", 
        "py",
        "${env:LOCALAPPDATA}\Programs\Python\*\python.exe",
        "${env:PROGRAMFILES}\Python*\python.exe",
        "${env:PROGRAMFILES(X86)}\Python*\python.exe"
    )
    
    $foundPython = $false
    foreach ($pythonPath in $pythonPaths) {
        try {
            if ($pythonPath -like "*\*") {
                # Wildcard path - resolve it
                $resolvedPaths = Get-ChildItem $pythonPath -ErrorAction SilentlyContinue
                foreach ($resolved in $resolvedPaths) {
                    $version = & $resolved.FullName --version 2>&1
                    Write-Log "Python found: $($resolved.FullName) - Version: $version" "INFO"
                    $foundPython = $true
                }
            } else {
                # Command name - try to find it
                $pythonCmd = Get-Command $pythonPath -ErrorAction Stop
                $version = & $pythonPath --version 2>&1
                Write-Log "Python found: $($pythonCmd.Source) - Version: $version" "INFO"
                $foundPython = $true
            }
        } catch {
            # Silently continue - not an error
        }
    }
    
    if (-not $foundPython) {
        Write-Log "No Python installation found" "ERROR"
    }
    
    # Check Node.js and npm
    try {
        $nodePath = Get-Command node -ErrorAction Stop
        $nodeVersion = & node --version 2>&1
        Write-Log "Node.js found: $($nodePath.Source) - Version: $nodeVersion" "INFO"
        
        $npmPath = Get-Command npm -ErrorAction Stop
        $npmVersion = & npm --version 2>&1
        Write-Log "npm found: $($npmPath.Source) - Version: $npmVersion" "INFO"
    } catch {
        Write-Log "Node.js or npm not found in PATH" "ERROR"
    }
    
    # Check project structure
    $backendPath = Join-Path $ProjectPath "backend"
    $frontendPath = Join-Path $ProjectPath "frontend"
    
    Write-Log "Project structure check:" "INFO"
    Write-Log "  Backend path: $backendPath - Exists: $(Test-Path $backendPath)" "INFO"
    Write-Log "  Frontend path: $frontendPath - Exists: $(Test-Path $frontendPath)" "INFO"
    
    if (Test-Path $backendPath) {
        $appPy = Join-Path $backendPath "app.py"
        $requirements = Join-Path $backendPath "requirements.txt"
        $configFile = Join-Path $backendPath "AOP_config.cfg"
        
        Write-Log "  Backend files:" "INFO"
        Write-Log "    app.py: $(Test-Path $appPy)" "INFO"
        Write-Log "    requirements.txt: $(Test-Path $requirements)" "INFO"
        Write-Log "    AOP_config.cfg: $(Test-Path $configFile)" "INFO"
        
        # Check for Windows virtual environments
        $venvPaths = @(".venv\Scripts\python.exe", "venv\Scripts\python.exe", ".env\Scripts\python.exe", "env\Scripts\python.exe")
        $foundVenv = $false
        foreach ($venvPath in $venvPaths) {
            $fullVenvPath = Join-Path $backendPath $venvPath
            if (Test-Path $fullVenvPath) {
                Write-Log "    Virtual environment found: $venvPath" "INFO"
                try {
                    $venvVersion = & $fullVenvPath --version 2>&1
                    Write-Log "      Version: $venvVersion" "INFO"
                } catch {
                    Write-Log "      Version check failed" "WARN"
                }
                $foundVenv = $true
            }
        }
        if (-not $foundVenv) {
            Write-Log "    No virtual environment found" "WARN"
        }
    }
    
    if (Test-Path $frontendPath) {
        $packageJson = Join-Path $frontendPath "package.json"
        $nodeModules = Join-Path $frontendPath "node_modules"
        
        Write-Log "  Frontend files:" "INFO"
        Write-Log "    package.json: $(Test-Path $packageJson)" "INFO"
        Write-Log "    node_modules: $(Test-Path $nodeModules)" "INFO"
    }
    
    # Check Windows firewall status for ports 3000 and 5000
    Write-Log "Checking Windows Firewall for ports 3000 and 5000..." "INFO"
    try {
        $port3000 = Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*3000*"} | Select-Object -First 1
        $port5000 = Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*5000*"} | Select-Object -First 1
        
        if ($port3000) {
            Write-Log "  Port 3000 firewall rule found: $($port3000.DisplayName)" "INFO"
        } else {
            Write-Log "  No specific firewall rule for port 3000" "INFO"
        }
        
        if ($port5000) {
            Write-Log "  Port 5000 firewall rule found: $($port5000.DisplayName)" "INFO"
        } else {
            Write-Log "  No specific firewall rule for port 5000" "INFO"
        }
    } catch {
        Write-Log "  Unable to check firewall rules (may require admin privileges)" "WARN"
    }
    
    Write-Log "=== Environment Diagnosis Complete ===" "INFO"
}

# Windows-specific virtual environment finder
function Find-WindowsVirtualEnvironment {
    param([string]$BackendPath)
    
    $venvSubPaths = @(
        ".venv\Scripts\python.exe",
        "venv\Scripts\python.exe", 
        ".env\Scripts\python.exe",
        "env\Scripts\python.exe"
    )
    
    foreach ($subPath in $venvSubPaths) {
        $fullPath = Join-Path -Path $BackendPath -ChildPath $subPath
        if (Test-Path $fullPath) {
            Write-Log "Found virtual environment: $fullPath" "INFO"
            return $fullPath
        }
    }
    
    Write-Log "No virtual environment found in: $BackendPath" "WARN"
    return $null
}

# Windows-specific virtual environment setup
function Setup-WindowsVirtualEnvironment {
    param($BackendPath)
    
    Write-Log "Setting up Windows virtual environment..." "INFO"
    
    # Find Python executable
    $pythonExe = $null
    $pythonCommands = @("python", "python3", "py")
    
    foreach ($cmd in $pythonCommands) {
        try {
            $pythonCmd = Get-Command $cmd -ErrorAction Stop
            $version = & $cmd --version 2>&1
            Write-Log "Found Python command '$cmd': $($pythonCmd.Source) - $version" "INFO"
            $pythonExe = $cmd
            break
        } catch {
            Write-Log "Python command '$cmd' not found" "DEBUG"
        }
    }
    
    if (-not $pythonExe) {
        throw "No Python executable found. Please install Python and ensure it's in PATH."
    }
    
    # Create virtual environment
    $originalLocation = Get-Location
    try {
        Set-Location $BackendPath
        Write-Log "Creating virtual environment with: $pythonExe -m venv .venv" "INFO"
        
        & $pythonExe -m venv .venv
        
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create virtual environment (Exit code: $LASTEXITCODE)"
        }
        
        $venvPython = Join-Path $BackendPath ".venv\Scripts\python.exe"
        
        if (-not (Test-Path $venvPython)) {
            throw "Virtual environment created but python.exe not found at: $venvPython"
        }
        
        # Upgrade pip
        Write-Log "Upgrading pip..." "INFO"
        & $venvPython -m pip install --upgrade pip
        
        # Install requirements if available
        $requirementsPath = Join-Path $BackendPath "requirements.txt"
        if (Test-Path $requirementsPath) {
            Write-Log "Installing packages from requirements.txt..." "INFO"
            & $venvPython -m pip install -r requirements.txt
            
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Requirements installed successfully" "INFO"
            } else {
                Write-Log "Some packages may have failed to install (Exit code: $LASTEXITCODE)" "WARN"
            }
        } else {
            Write-Log "No requirements.txt found - skipping package installation" "INFO"
        }
        
        return $venvPython
        
    } finally {
        Set-Location $originalLocation
    }
}

# Diagnosis mode
if ($Diagnose) {
    Write-Host "🔍 Windows Environment Diagnosis" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    
    # Basic system info
    $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
    Write-Host "Windows Version: $($osInfo.Caption) $($osInfo.Version)" -ForegroundColor Cyan
    Write-Host "Computer: $($env:COMPUTERNAME)" -ForegroundColor Cyan
    Write-Host "User: $($env:USERNAME)" -ForegroundColor Cyan
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)" -ForegroundColor Cyan
    Write-Host ""
    
    # Check Python
    Write-Host "Python Installations:" -ForegroundColor Yellow
    $pythonFound = $false
    $pythonCommands = @("python", "python3", "py")
    foreach ($cmd in $pythonCommands) {
        try {
            $pythonCmd = Get-Command $cmd -ErrorAction Stop
            $version = & $cmd --version 2>&1
            Write-Host "  [OK] $cmd`: $($pythonCmd.Source) - $version" -ForegroundColor Green
            $pythonFound = $true
        } catch {
            Write-Host "  [X] $cmd`: Not found" -ForegroundColor Red
        }
    }
    if (-not $pythonFound) {
        Write-Host "  [WARNING] No Python found!" -ForegroundColor Red
    }
    Write-Host ""
    
    # Check Node.js
    Write-Host "Node.js Environment:" -ForegroundColor Yellow
    try {
        $nodeCmd = Get-Command node -ErrorAction Stop
        $nodeVersion = & node --version 2>&1
        Write-Host "  [OK] Node.js: $($nodeCmd.Source) - $nodeVersion" -ForegroundColor Green
        
        $npmCmd = Get-Command npm -ErrorAction Stop
        $npmVersion = & npm --version 2>&1
        Write-Host "  [OK] npm: $($npmCmd.Source) - $npmVersion" -ForegroundColor Green
    } catch {
        Write-Host "  [X] Node.js/npm: Not found" -ForegroundColor Red
    }
    Write-Host ""
    
    # Check project structure
    Write-Host "Project Structure:" -ForegroundColor Yellow
    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    
    Write-Host "  Backend folder: $(if (Test-Path $backendPath) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $backendPath) { 'Green' } else { 'Red' })
    Write-Host "  Frontend folder: $(if (Test-Path $frontendPath) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $frontendPath) { 'Green' } else { 'Red' })
    
    if (Test-Path $backendPath) {
        $appPy = Join-Path $backendPath "app.py"
        $requirements = Join-Path $backendPath "requirements.txt"
        Write-Host "    app.py: $(if (Test-Path $appPy) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $appPy) { 'Green' } else { 'Red' })
        Write-Host "    requirements.txt: $(if (Test-Path $requirements) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $requirements) { 'Green' } else { 'Red' })
        
        # Check virtual environments
        $venvPaths = @(".venv\Scripts\python.exe", "venv\Scripts\python.exe")
        $venvFound = $false
        foreach ($venvPath in $venvPaths) {
            $fullVenvPath = Join-Path $backendPath $venvPath
            if (Test-Path $fullVenvPath) {
                Write-Host "    Virtual Environment: OK - $venvPath" -ForegroundColor Green
                $venvFound = $true
                break
            }
        }
        if (-not $venvFound) {
            Write-Host "    Virtual Environment: MISSING" -ForegroundColor Red
        }
    }
    
    if (Test-Path $frontendPath) {
        $packageJson = Join-Path $frontendPath "package.json"
        $nodeModules = Join-Path $frontendPath "node_modules"
        Write-Host "    package.json: $(if (Test-Path $packageJson) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $packageJson) { 'Green' } else { 'Red' })
        Write-Host "    node_modules: $(if (Test-Path $nodeModules) { 'OK' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $nodeModules) { 'Green' } else { 'Red' })
    }
    
    Write-Host ""
    Write-Host "🔍 Diagnosis complete!" -ForegroundColor Green
    Read-Host "`nPress any key to exit..."
    Exit 0
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
    
    # Enhanced Windows Python environment setup
    Write-Log "Preparing backend server..." "INFO"
    
    # Try to find existing virtual environment
    $venvPythonPath = Find-WindowsVirtualEnvironment -BackendPath $backendPath
    
    if (-not $venvPythonPath) {
        Write-Log "Virtual environment not found. Attempting to create..." "WARN"
        try {
            $venvPythonPath = Setup-WindowsVirtualEnvironment -BackendPath $backendPath
            Write-Log "Virtual environment created successfully: $venvPythonPath" "INFO"
        } catch {
            Write-Log "Failed to setup virtual environment: $($_.Exception.Message)" "ERROR"
            
            # Fallback to system Python
            Write-Log "Attempting to use system Python as fallback..." "WARN"
            $systemPythonCmds = @("python", "python3", "py")
            $systemPythonFound = $false
            
            foreach ($cmd in $systemPythonCmds) {
                try {
                    $systemPython = Get-Command $cmd -ErrorAction Stop
                    $venvPythonPath = $systemPython.Source
                    Write-Log "Using system Python: $venvPythonPath" "INFO"
                    $systemPythonFound = $true
                    break
                } catch {
                    # Continue to next command
                }
            }
            
            if (-not $systemPythonFound) {
                throw "No Python interpreter found. Please install Python or check PATH."
            }
        }
    }
    
    # Verify Python executable works
    try {
        $pythonVersion = & $venvPythonPath --version 2>&1
        Write-Log "Using Python: $pythonVersion" "INFO"
    } catch {
        throw "Python executable is not working: $venvPythonPath"
    }
    
    # Quick check for essential Python modules
    $requiredModules = @("flask", "sqlalchemy")
    foreach ($module in $requiredModules) {
        try {
            & $venvPythonPath -c "import $module" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Module '$module' is available" "DEBUG"
            } else {
                Write-Log "Module '$module' may be missing" "WARN"
            }
        } catch {
            Write-Log "Could not verify module '$module'" "WARN"
        }
    }
    
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