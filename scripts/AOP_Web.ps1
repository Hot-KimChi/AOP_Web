# ============================================================
#  AOP_Web.ps1
#  AOP Web Application - Unified Management Script
#
#  Purpose  : Start, Stop, Restart, Status 통합 관리 스크립트
#  Usage    : .\scripts\AOP_Web.ps1 [-Action Start|Stop|Restart|Status|InstallStartup|UninstallStartup] [-Production] [-Force] [-Unattended] [-Diagnose] [-Help]
#  Created  : 2026-09-11
# ============================================================

param(
    [ValidateSet("Start", "Stop", "Restart", "Status", "InstallStartup", "UninstallStartup")]
    [string]$Action = "Start",
    [switch]$Production,
    [switch]$Force,
    [switch]$Unattended,
    [switch]$Diagnose,
    [switch]$Help
)

#region Environment & Logging Setup
# 이 스크립트는 scripts/ 하위에 위치하므로 프로젝트 루트는 한 단계 상위 디렉터리다.
$scriptFilePath = $MyInvocation.MyCommand.Path
$scriptPath = Split-Path -Parent $scriptFilePath
$projectPath = Split-Path -Parent $scriptPath
$logDir = Join-Path $projectPath "logs"
$logTimestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$actionLower = $Action.ToLower()
$logFile = Join-Path $logDir "${actionLower}_$logTimestamp.log"
$jsonLogFile = Join-Path $logDir "${actionLower}_$logTimestamp.json"

$logRetentionDays = 30
$maxLogDirSizeMB = 500

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$script:jsonLogEntries = @()
$script:scriptName = "AOP_Web.ps1"

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
        $allLogs = @(Get-ChildItem -Path $LogDirectory -Include "*.log", "*.json" -Recurse)

        $oldLogs = @($allLogs | Where-Object { $_.LastWriteTime -lt $cutoffDate })
        if ($oldLogs.Count -gt 0) {
            $removedSize = ($oldLogs | Measure-Object -Property Length -Sum).Sum
            $oldLogs | Remove-Item -Force -ErrorAction SilentlyContinue

            $removedSizeMB = [math]::Round($removedSize / 1MB, 2)
            Write-Log "Removed $($oldLogs.Count) old log files ($removedSizeMB MB)" "INFO"

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
    # 반환값은 반드시 호출부에서 @() 로 감싸야 한다.
    # 결과가 1건이면 PowerShell 이 배열을 스칼라로 언롤링해 .Count 가 $null 이 되고,
    # Count 기반 분기가 전부 오작동한다(프로세스 1개짜리 서비스가 미탐지됨).
    param([int]$Port)
    $lines = netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
    if (-not $lines) { return @() }

    $processIds = @()
    foreach ($line in $lines) {
        $tokens = ($line.Line.Trim() -split '\s+')
        if ($tokens.Length -ge 5 -and $tokens[1] -match ":$Port$") {
            $processIds += [int]$tokens[4]
        }
    }
    $processIds = @($processIds | Where-Object { $_ -ne 0 } | Select-Object -Unique)

    if ($processIds.Count -eq 0) { return @() }

    $result = @()
    foreach ($processId in $processIds) {
        # 프로세스 종료 직후에도 netstat 에 LISTENING 소켓이 잠시 잔존한다.
        # Get-Process 로 실제 생존 여부를 확인해 죽은 PID 는 제외한다(오탐/불필요한 Stop-Process 방지).
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $result += [PSCustomObject]@{ ProcessId = $processId; ProcessName = $process.ProcessName }
    }
    return $result
}

function Test-PortListening {
    param([int]$Port)
    $line = netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
    return [bool]$line
}

function Wait-ForPortListening {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10,
        [int]$IntervalMilliseconds = 300
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) { return $true }
        Start-Sleep -Milliseconds $IntervalMilliseconds
    }
    return $false
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = @(Get-CimInstance -ClassName Win32_Process `
        -Filter "ParentProcessId = $ProcessId" `
        -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Invoke-NativeCapture {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    # 네이티브 명령의 stderr 는 PowerShell 에러 스트림으로 올라온다.
    # 호출 맥락이 ErrorActionPreference='Stop' 이면 2>&1 이 NativeCommandError 로 종료 예외를 던져
    # 의도한 진단 로직 대신 엉뚱한 예외로 죽으므로, 캡처 구간에서만 Continue 로 고정한다.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $global:LASTEXITCODE = 0
        $output = @(& $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        return [PSCustomObject]@{
            ExitCode = $global:LASTEXITCODE
            Output   = ($output -join [Environment]::NewLine)
        }
    } finally {
        $ErrorActionPreference = $prevEAP
    }
}

function Test-BackendDependencies {
    param(
        [string]$PythonExe,
        [string]$BackendPath
    )

    # 핵심 의존성(flask)이 import 되는지 먼저 확인한다.
    # 이 확인이 없으면 의존성 누락 시 "포트 5000 리스닝 실패"로만 기록돼 원인을 알 수 없다.
    $probe = Invoke-NativeCapture -FilePath $PythonExe -Arguments @("-c", "import flask")
    if ($probe.ExitCode -eq 0) { return }

    Write-Log "Backend dependencies are missing: $($probe.Output)" "WARN"

    $requirements = Join-Path $BackendPath "requirements.txt"
    if (!(Test-Path $requirements)) {
        throw "Backend dependencies are missing and requirements.txt not found at $requirements."
    }

    Write-Log "Installing backend dependencies from requirements.txt..." "INFO"
    $install = Invoke-NativeCapture -FilePath $PythonExe -Arguments @("-m", "pip", "install", "-r", $requirements)
    if ($install.ExitCode -ne 0) {
        $tail = ($install.Output -split "`r?`n" | Select-Object -Last 20) -join " | "
        Write-Log "pip install failed. Output tail: $tail" "ERROR"
        throw "Failed to install backend dependencies. Check Python version compatibility of backend\.venv."
    }

    $probe = Invoke-NativeCapture -FilePath $PythonExe -Arguments @("-c", "import flask")
    if ($probe.ExitCode -ne 0) {
        throw "Backend dependencies still unavailable after install: $($probe.Output)"
    }
    Write-Log "Backend dependencies installed successfully" "INFO"
}

function Install-StartupTask {
    $taskName = "AOP_Web_AutoStart"
    if (!(Test-Path $scriptFilePath -PathType Leaf)) {
        throw "AOP_Web.ps1 not found at $scriptFilePath."
    }

    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $escapedScriptPath = $scriptFilePath.Replace('"', '\"')
    $taskAction = New-ScheduledTaskAction `
        -Execute (Join-Path $PSHOME "powershell.exe") `
        -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$escapedScriptPath`" -Action Start -Unattended" `
        -WorkingDirectory $projectPath
    $taskTrigger = New-ScheduledTaskTrigger `
        -AtLogOn `
        -User $currentUser
    $taskTrigger.Delay = "PT30S"
    $taskSettings = New-ScheduledTaskSettingsSet `
        -Hidden `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    $taskPrincipal = New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType Interactive `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $taskAction `
        -Trigger $taskTrigger `
        -Settings $taskSettings `
        -Principal $taskPrincipal `
        -Force `
        -ErrorAction Stop | Out-Null

    Write-Host "Windows auto-start task registered: $taskName" -ForegroundColor Green
    Write-Host "User: $currentUser" -ForegroundColor Cyan
    Write-Host "Trigger: current user logon (30 seconds delay)" -ForegroundColor Cyan
    Write-Host "Action: powershell.exe -WindowStyle Hidden -File scripts\AOP_Web.ps1 -Action Start -Unattended" -ForegroundColor Cyan
    Write-Host "Verify: schtasks /Query /TN $taskName /FO LIST /V" -ForegroundColor Yellow
}

function Uninstall-StartupTask {
    $taskName = "AOP_Web_AutoStart"
    try {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    } catch {
        if ($_.CategoryInfo.Category.ToString() -eq "ObjectNotFound") {
            $task = $null
        } else {
            throw
        }
    }

    if (-not $task) {
        Write-Host "Windows auto-start task not found: $taskName" -ForegroundColor Yellow
        return
    }

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Host "Windows auto-start task removed: $taskName" -ForegroundColor Green
}
#endregion

#region Help & Diagnose
if ($Help) {
    Write-Host "AOP Web Application Unified Management Script" -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\scripts\AOP_Web.ps1 [-Action Start|Stop|Restart|Status|InstallStartup|UninstallStartup] [-Production] [-Force] [-Unattended] [-Diagnose]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Actions:" -ForegroundColor Yellow
    Write-Host "  Start      Start Frontend & Backend servers (Default)"
    Write-Host "  Stop       Stop Frontend & Backend servers"
    Write-Host "  Restart    Stop and then Start servers"
    Write-Host "  Status     Display current running status of services"
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Production    Production mode (build + background)"
    Write-Host "  -Force         Non-interactive mode (force stop existing processes)"
    Write-Host "  -Unattended    Hide development server windows for automatic startup"
    Write-Host "  -Action InstallStartup     Register current-user logon auto-start task"
    Write-Host "  -Action UninstallStartup   Remove current-user logon auto-start task"
    Write-Host "  -Diagnose      Run environment diagnosis only"
    Write-Host ""
    Exit 0
}

if ($Diagnose) {
    Write-Host "`n=== Environment Diagnosis ===" -ForegroundColor Green
    $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
    Write-Host "OS: $($osInfo.Caption) $($osInfo.Version)" -ForegroundColor Cyan
    Write-Host "Computer: $env:COMPUTERNAME | User: $env:USERNAME" -ForegroundColor Cyan
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)`n" -ForegroundColor Cyan
    
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
    
    Write-Host "`nNode.js:" -ForegroundColor Yellow
    try {
        $nodeVersion = & node --version 2>&1
        $npmVersion = & npm --version 2>&1
        Write-Host "  [OK] Node $nodeVersion | npm $npmVersion" -ForegroundColor Green
    } catch {
        Write-Host "  [X] Node.js/npm not found" -ForegroundColor Red
    }
    
    Write-Host "`nProject Structure:" -ForegroundColor Yellow
    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    Write-Host "  Backend: $(if (Test-Path $backendPath) {'OK'} else {'MISSING'})" -ForegroundColor $(if (Test-Path $backendPath) {'Green'} else {'Red'})
    Write-Host "  Frontend: $(if (Test-Path $frontendPath) {'OK'} else {'MISSING'})" -ForegroundColor $(if (Test-Path $frontendPath) {'Green'} else {'Red'})
    
    Write-Host "`n=== Diagnosis Complete ===`n" -ForegroundColor Green
    Exit 0
}
#endregion

#region Actions Implementation
function Show-Status {
    Write-Host "`n=============================================" -ForegroundColor Green
    Write-Host "  AOP Web Application Status Check"           -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green

    $backendProcs = @(Get-ProcessesOnPort -Port 5000)
    Write-Host "`n[Backend Server - Port 5000]" -ForegroundColor Cyan
    if ($backendProcs.Count -gt 0) {
        foreach ($p in $backendProcs) {
            Write-Host "  Status: RUNNING | Process: $($p.ProcessName) | PID: $($p.ProcessId)" -ForegroundColor Green
        }
    } else {
        Write-Host "  Status: STOPPED (Port 5000 is free)" -ForegroundColor Yellow
    }

    $frontendProcs = @(Get-ProcessesOnPort -Port 3000)
    Write-Host "`n[Frontend Server - Port 3000]" -ForegroundColor Cyan
    if ($frontendProcs.Count -gt 0) {
        foreach ($p in $frontendProcs) {
            Write-Host "  Status: RUNNING | Process: $($p.ProcessName) | PID: $($p.ProcessId)" -ForegroundColor Green
        }
    } else {
        Write-Host "  Status: STOPPED (Port 3000 is free)" -ForegroundColor Yellow
    }
    Write-Host "=============================================`n" -ForegroundColor Green
}

function Stop-Services {
    param([bool]$NonInteractive = $false)
    Write-Log "=== Starting AOP Web Shutdown ===" "INFO"
    Clean-OldLogs -LogDirectory $logDir -RetentionDays $logRetentionDays -MaxSizeMB $maxLogDirSizeMB
    
    $stoppedCount = 0
    foreach ($svc in @(@{Port=3000; Name="Frontend"}, @{Port=5000; Name="Backend"})) {
        $procs = @(Get-ProcessesOnPort -Port $svc.Port)
        if ($procs.Count -eq 0) {
            Write-Log "No running process found on port $($svc.Port) ($($svc.Name))" "INFO"
            continue
        }
        
        Write-Host "Found $($svc.Name) processes on port $($svc.Port):" -ForegroundColor Yellow
        foreach ($p in $procs) {
            Write-Host "  - $($p.ProcessName) (PID: $($p.ProcessId))" -ForegroundColor Cyan
        }

        if (-not $NonInteractive -and -not $Force) {
            $choice = Read-Host "Stop $($svc.Name) processes? (Y/N)"
            if ($choice -ne 'Y' -and $choice -ne 'y') {
                Write-Log "User skipped stopping $($svc.Name)" "INFO"
                continue
            }
        }

        foreach ($p in $procs) {
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
                Write-Log "Stopped $($svc.Name) process (PID: $($p.ProcessId)) on port $($svc.Port)" "INFO"
                $stoppedCount++
            } catch {
                Write-Log "Failed to stop PID $($p.ProcessId): $($_.Exception.Message)" "ERROR"
            }
        }
    }
    Save-JsonLog
    Write-Log "Shutdown complete ($stoppedCount processes stopped)" "INFO"
}

function Start-Services {
    $mode = if ($Production) { "Production" } else { "Development" }
    Write-Log "=== Starting AOP Web ($mode Mode) ===" "INFO"
    Clean-OldLogs -LogDirectory $logDir -RetentionDays $logRetentionDays -MaxSizeMB $maxLogDirSizeMB

    $backendPath = Join-Path $projectPath "backend"
    $frontendPath = Join-Path $projectPath "frontend"
    if (!(Test-Path $backendPath) -or !(Test-Path $frontendPath)) {
        throw "Project structure invalid. Run with -Diagnose to check."
    }

    # 1. Backend Setup
    Write-Log "Setting up backend..." "INFO"
    $pythonExe = $null
    $venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $pythonExe = $venvPython
        Write-Log "Using virtual environment Python" "INFO"
    } else {
        foreach ($cmd in @("python", "py")) {
            try {
                $pythonCmd = Get-Command $cmd -ErrorAction Stop
                $pythonExe = $pythonCmd.Source
                Write-Log "Using system Python: $cmd" "WARN"
                break
            } catch { }
        }
    }
    if (-not $pythonExe) { throw "Python executable not found." }

    Test-BackendDependencies -PythonExe $pythonExe -BackendPath $backendPath

    # Clear Port 5000 if occupied
    $existingBackend = @(Get-ProcessesOnPort -Port 5000)
    if ($existingBackend.Count -gt 0) {
        Write-Log "Port 5000 is in use. Stopping existing process automatically..." "WARN"
        foreach ($p in $existingBackend) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }

    $env:AOP_ENV = if ($Production) { "production" } else { "development" }
    Write-Log "Starting backend server (Port 5000)..." "INFO"
    
    if ($Production) {
        $backendProcess = Start-Process -FilePath $pythonExe -ArgumentList "app.py" -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
    } else {
        $backendCommandPath = $backendPath.Replace("'", "''")
        $pythonCommandPath = $pythonExe.Replace("'", "''")
        $backendCmd = "Set-Location '$backendCommandPath'; & '$pythonCommandPath' app.py"
        $backendWindowStyle = if ($Unattended) { "Hidden" } else { "Normal" }
        $backendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $backendCmd -WindowStyle $backendWindowStyle -PassThru
    }
    Write-Log "Backend PID: $($backendProcess.Id)" "INFO"

    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
        throw "Backend process terminated immediately."
    }

    if (Wait-ForPortListening -Port 5000 -TimeoutSeconds 15 -IntervalMilliseconds 300) {
        Write-Log "Backend is listening on port 5000" "INFO"
    } else {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        throw "Backend failed to listen on port 5000."
    }

    # 2. Frontend Setup
    Write-Log "Setting up frontend..." "INFO"
    $nodeModulesPath = Join-Path $frontendPath "node_modules"
    if (!(Test-Path $nodeModulesPath)) {
        Write-Log "Installing dependencies..." "INFO"
        Set-Location $frontendPath
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Set-Location $projectPath
    }

    # Clear Port 3000 if occupied
    $existingFrontend = @(Get-ProcessesOnPort -Port 3000)
    if ($existingFrontend.Count -gt 0) {
        Write-Log "Port 3000 is in use. Stopping existing process automatically..." "WARN"
        foreach ($p in $existingFrontend) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Log "Starting frontend server (Port 3000)..." "INFO"
    if ($Production) {
        Write-Log "Building frontend for production..." "INFO"
        Set-Location $frontendPath
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Set-Location $projectPath
            throw "Frontend build failed"
        }
        $frontendProcess = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru
        Set-Location $projectPath
    } else {
        $frontendCommandPath = $frontendPath.Replace("'", "''")
        $frontendCmd = "Set-Location '$frontendCommandPath'; npm run dev"
        $frontendWindowStyle = if ($Unattended) { "Hidden" } else { "Normal" }
        $frontendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $frontendCmd -WindowStyle $frontendWindowStyle -PassThru
    }
    Write-Log "Frontend PID: $($frontendProcess.Id)" "INFO"

    $frontendListening = Wait-ForPortListening -Port 3000 -TimeoutSeconds 30 -IntervalMilliseconds 300
    if ($frontendListening) {
        Write-Log "Frontend is listening on port 3000" "INFO"
    } elseif ($Unattended) {
        Stop-ProcessTree -ProcessId $frontendProcess.Id
        Stop-ProcessTree -ProcessId $backendProcess.Id
        foreach ($failedServicePort in @(3000, 5000)) {
            foreach ($failedServiceProcess in @(Get-ProcessesOnPort -Port $failedServicePort)) {
                Stop-Process -Id $failedServiceProcess.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
        throw "Frontend failed to listen on port 3000."
    } else {
        Write-Log "Frontend port 3000 initialization in progress..." "WARN"
    }

    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend:  http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"
    Save-JsonLog

    if ($Production) {
        Write-Log "Running health monitoring loop..." "INFO"
        while ($true) {
            Start-Sleep -Seconds 60
            if (-not (Test-PortListening -Port 5000)) { Write-Log "Backend health check warning: Port 5000 down" "WARN" }
            if (-not (Test-PortListening -Port 3000)) { Write-Log "Frontend health check warning: Port 3000 down" "WARN" }
        }
    }
}
#endregion

#region Main Entry Point
try {
    switch ($Action) {
        "Status"  { Show-Status }
        "Stop"    { Stop-Services -NonInteractive:$Force }
        "Start"   { Start-Services }
        "InstallStartup"   { Install-StartupTask }
        "UninstallStartup" { Uninstall-StartupTask }
        "Restart" {
            Stop-Services -NonInteractive:$true
            Start-Sleep -Seconds 1
            Start-Services
        }
    }
} catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Save-JsonLog
    Exit 1
}
#endregion
