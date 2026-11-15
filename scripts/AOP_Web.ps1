# ============================================================
#  AOP_Web.ps1
#  AOP Web Application - Unified Management Script
#
#  Purpose  : Start, Stop, Restart, Status 통합 관리 스크립트
#  Usage    : .\scripts\AOP_Web.ps1 [-Action Start|Stop|Restart|Status|EnsureRunning|RegisterStartup|UninstallStartup] [-Production] [-Force] [-Unattended] [-Diagnose] [-Help]
#  Created  : 2026-09-11
# ============================================================

param(
    [ValidateSet("Start", "Stop", "Restart", "Status", "Help", "EnsureRunning", "RegisterStartup", "UninstallStartup")]
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
$script:startedProcessIds = @()
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
    # -p tcp 는 IPv4 만 보여 준다. Vite 개발 서버처럼 [::] 에만 바인딩하면 놓치므로 전체 프로토콜을 본다.
    $lines = netstat -ano 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
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
    $line = netstat -ano 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
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

function Stop-StartedServices {
    foreach ($processId in @($script:startedProcessIds)) {
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            Stop-ProcessTree -ProcessId $processId
        }
    }
    $script:startedProcessIds = @()
}

function Stop-ProcessesOnPort {
    param(
        [int]$Port,
        [int]$MaxAttempts = 5
    )

    $stoppedCount = 0
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $processes = @(Get-ProcessesOnPort -Port $Port)
        if ($processes.Count -eq 0) { break }

        foreach ($process in $processes) {
            try {
                Stop-ProcessTree -ProcessId $process.ProcessId
                $stoppedCount++
            } catch {
                Write-Log "Failed to stop PID $($process.ProcessId) on port $Port`: $($_.Exception.Message)" "ERROR"
            }
        }

        Start-Sleep -Milliseconds 300
    }

    return $stoppedCount
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

function Get-PersistedEnvironmentValue {
    param([string]$Name)

    $current = [Environment]::GetEnvironmentVariable($Name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($current)) { return $current }

    $userScope = [Environment]::GetEnvironmentVariable($Name, "User")
    if (-not [string]::IsNullOrWhiteSpace($userScope)) { return $userScope }

    return [Environment]::GetEnvironmentVariable($Name, "Machine")
}

function Get-ServerOriginList {
    $origins = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    
    # 1. Localhost & Loopback
    $origins.Add("http://localhost:3000") | Out-Null
    $origins.Add("http://localhost:5000") | Out-Null
    $origins.Add("http://127.0.0.1:3000") | Out-Null
    $origins.Add("http://127.0.0.1:5000") | Out-Null

    # 2. Hostname / ComputerName
    if (-not [string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) {
        $origins.Add("http://$($env:COMPUTERNAME):3000") | Out-Null
        $origins.Add("http://$($env:COMPUTERNAME):5000") | Out-Null
    }

    # 3. All Active IPv4 Addresses
    try {
        $ipAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
            Select-Object -ExpandProperty IPAddress)
        foreach ($ip in $ipAddresses) {
            if (-not [string]::IsNullOrWhiteSpace($ip)) {
                $origins.Add("http://${ip}:3000") | Out-Null
                $origins.Add("http://${ip}:5000") | Out-Null
            }
        }
    } catch { }

    return [string[]]$origins
}

function Ensure-ProductionConfiguration {
    if (-not $Production) { return }

    $backendPath = Join-Path $projectPath "backend"
    $envProdFile = Join-Path $backendPath ".env.production"

    # 1. 파일에서 기존 저장된 키 읽기
    $fileSettings = [ordered]@{}
    if (Test-Path $envProdFile) {
        Get-Content $envProdFile -Encoding UTF8 | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $parts = $line.Split("=", 2)
                $k = $parts[0].Trim()
                $v = $parts[1].Trim().Trim("'", '"')
                if ($k -and $v) { $fileSettings[$k] = $v }
            }
        }
    }

    # 2. ALLOWED_ORIGINS 동적 병합 (기존 항목 + 현재 서버 IP/호스트)
    $serverOrigins = Get-ServerOriginList
    $existingOrigins = @()
    $persistedOrigins = Get-PersistedEnvironmentValue -Name "ALLOWED_ORIGINS"
    if (-not [string]::IsNullOrWhiteSpace($persistedOrigins)) {
        $existingOrigins += $persistedOrigins.Split(",")
    } elseif ($fileSettings.Contains("ALLOWED_ORIGINS") -and -not [string]::IsNullOrWhiteSpace($fileSettings["ALLOWED_ORIGINS"])) {
        $existingOrigins += $fileSettings["ALLOWED_ORIGINS"].Split(",")
    }

    $mergedOriginSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($orig in ($existingOrigins + $serverOrigins)) {
        $trimmed = $orig.Trim()
        if ($trimmed) { $mergedOriginSet.Add($trimmed) | Out-Null }
    }
    $finalAllowedOrigins = ($mergedOriginSet -join ",")

    # 3. 우선순위: Process > User > Machine > .env.production > 자동생성
    $requiredKeys = @("AUTH_SECRET_KEY", "FLASK_SECRET_KEY", "ALLOWED_ORIGINS")
    $updatedFile = $false

    foreach ($name in $requiredKeys) {
        $val = Get-PersistedEnvironmentValue -Name $name
        if ([string]::IsNullOrWhiteSpace($val) -and $fileSettings.Contains($name)) {
            $val = $fileSettings[$name]
        }

        if ($name -eq "ALLOWED_ORIGINS") {
            if ($val -ne $finalAllowedOrigins) {
                $val = $finalAllowedOrigins
                $fileSettings[$name] = $val
                $updatedFile = $true
            }
        } elseif ([string]::IsNullOrWhiteSpace($val)) {
            # 64자리 안전한 암호학적 랜덤 hex 시크릿 생성
            $bytes = New-Object byte[] 32
            $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $rng.GetBytes($bytes)
            $val = ([BitConverter]::ToString($bytes) -replace "-","").ToLower()
            $fileSettings[$name] = $val
            $updatedFile = $true
        }

        # 현재 실행 프로세스에 주입
        [Environment]::SetEnvironmentVariable($name, $val, "Process")
    }

    if ($updatedFile -or -not (Test-Path $envProdFile)) {
        $lines = @(
            "# Auto-generated production configuration for AOP Web",
            "# Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        )
        foreach ($k in $fileSettings.Keys) {
            $lines += "$k=$($fileSettings[$k])"
        }
        $lines | Out-File -FilePath $envProdFile -Encoding UTF8
        Write-Log "Generated and updated production configuration to $envProdFile" "INFO"
    } else {
        Write-Log "Production configuration loaded successfully" "INFO"
    }
}

function Get-LegacyAutoStartItems {
    # 예전 방식의 자동 시작 구성(깨진 NSSM 서비스, 시작프로그램 바로가기)을 찾는다.
    # 부팅 작업과 함께 남아 있으면 실패 루프나 로그온 시 중복 기동을 만든다.
    $items = @()
    $serviceName = "AOP_Web_Service"
    $serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
    if (Test-Path $serviceKey) {
        $parametersKey = Get-ItemProperty -Path "$serviceKey\Parameters" -ErrorAction SilentlyContinue
        $appParameters = [string]$parametersKey.AppParameters
        # 이 프로젝트 스크립트를 -File 로 가리키는데 그 파일이 없을 때만 깨진 서비스로 본다.
        # 판별할 수 없는 구성은 건드리지 않는다.
        if ($appParameters -match '-File\s+"?([^"]*AOP_Web[^"]*?\.ps1)') {
            $targetScript = $Matches[1]
            if (-not [System.IO.Path]::IsPathRooted($targetScript) -and $parametersKey.AppDirectory) {
                $targetScript = Join-Path $parametersKey.AppDirectory $targetScript
            }
            if (-not (Test-Path $targetScript -PathType Leaf)) {
                $items += [PSCustomObject]@{ Kind = "Service"; Name = $serviceName; Detail = "missing script: $targetScript" }
            }
        }
    }

    $startupDir = [Environment]::GetFolderPath("Startup")
    if ($startupDir -and (Test-Path $startupDir)) {
        foreach ($link in @(Get-ChildItem -Path $startupDir -Filter *.lnk -File -ErrorAction SilentlyContinue)) {
            $target = ""
            try {
                $target = (New-Object -ComObject WScript.Shell).CreateShortcut($link.FullName).TargetPath
            } catch { }
            if ($link.Name -match 'AOP_Web' -or $target -match 'AOP_Web') {
                $items += [PSCustomObject]@{ Kind = "StartupShortcut"; Name = $link.FullName; Detail = "target: $target" }
            }
        }
    }
    return $items
}

function Remove-LegacyAutoStart {
    foreach ($item in @(Get-LegacyAutoStartItems)) {
        if ($item.Kind -eq "Service") {
            & sc.exe stop $item.Name | Out-Null
            & sc.exe delete $item.Name | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Removed broken legacy service $($item.Name) ($($item.Detail))" "INFO"
            } else {
                Write-Log "Failed to remove legacy service $($item.Name) (sc.exe exit $LASTEXITCODE)" "WARN"
            }
        } elseif ($item.Kind -eq "StartupShortcut") {
            # 삭제하지 않고 백업 폴더로 옮겨 필요하면 되돌릴 수 있게 한다.
            $backupDir = Join-Path $env:LOCALAPPDATA "AOP_Web\disabled_startup"
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            $destination = Join-Path $backupDir ("{0}_{1}" -f (Get-Date -Format 'yyyyMMdd_HHmmss'), (Split-Path $item.Name -Leaf))
            Move-Item -LiteralPath $item.Name -Destination $destination
            Write-Log "Moved legacy startup shortcut to $destination ($($item.Detail))" "INFO"
        }
    }
}

function Register-AutoStartTask {
    # 부팅 시 로그인 전에도 기동하고, 5분마다 내려간 서버를 복구하도록 등록한다.
    $taskName = "AOP_Web_AutoStart"
    if (!(Test-Path $scriptFilePath -PathType Leaf)) {
        throw "AOP_Web.ps1 not found at $scriptFilePath."
    }
    $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [System.Security.Principal.WindowsPrincipal]::new($currentIdentity)
    if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Registering the boot auto-start task requires an elevated PowerShell. Run -Action RegisterStartup as Administrator."
    }

    $modeName = if ($Production) { "Production" } else { "Development" }
    $modeSwitch = if ($Production) { " -Production" } else { "" }
    $currentUser = $currentIdentity.Name
    $escapedScriptPath = $scriptFilePath.Replace('"', '\"')
    $taskArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$escapedScriptPath`" -Action EnsureRunning$modeSwitch -Unattended"

    $taskAction = New-ScheduledTaskAction `
        -Execute (Join-Path $PSHOME "powershell.exe") `
        -Argument $taskArguments `
        -WorkingDirectory $projectPath
    $taskTrigger = New-ScheduledTaskTrigger `
        -AtStartup
    $taskTrigger.Delay = "PT1M"
    # Duration 을 비우면 무기한 반복이다(부팅 기동 실패·프로세스 종료 시 자동 복구).
    $repetitionClass = Get-CimClass -Namespace "Root/Microsoft/Windows/TaskScheduler" -ClassName MSFT_TaskRepetitionPattern
    $taskTrigger.Repetition = New-CimInstance -CimClass $repetitionClass -ClientOnly -Property @{
        Interval          = "PT5M"
        StopAtDurationEnd = $false
    }
    $taskSettings = New-ScheduledTaskSettingsSet `
        -Hidden `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    $taskPrincipal = New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType S4U `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $taskAction `
        -Trigger $taskTrigger `
        -Settings $taskSettings `
        -Principal $taskPrincipal `
        -Force `
        -ErrorAction Stop | Out-Null

    Remove-LegacyAutoStart

    Write-Log "Auto-start task registered ($modeName mode): $taskName" "INFO"
    Write-Host "Windows auto-start task registered: $taskName" -ForegroundColor Green
    Write-Host "User: $currentUser" -ForegroundColor Cyan
    Write-Host "Trigger: system startup (60 seconds delay; user login not required), then health check every 5 minutes" -ForegroundColor Cyan
    Write-Host "Mode: $modeName (-Action EnsureRunning$modeSwitch -Unattended)" -ForegroundColor Cyan
    Write-Host "Run level: current user, limited privileges, no stored password" -ForegroundColor Cyan
    Write-Host "Verify: schtasks /Query /TN $taskName /FO LIST /V" -ForegroundColor Yellow
    Write-Host "Pause:  schtasks /Change /TN $taskName /DISABLE" -ForegroundColor Yellow
    Write-Host "Remove: AOP_Web.bat uninstall" -ForegroundColor Yellow

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
        Write-Host "Windows boot auto-start task not found: $taskName" -ForegroundColor Yellow
        return
    }

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Host "Windows boot auto-start task removed: $taskName" -ForegroundColor Green
}
#endregion

#region Help & Diagnose
if ($Help -or $Action -eq "Help") {
    Write-Host "AOP Web Application Unified Management Script" -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\scripts\AOP_Web.ps1 [-Action Start|Stop|Restart|Status|EnsureRunning|RegisterStartup|UninstallStartup] [-Production] [-Force] [-Unattended] [-Diagnose] [-Help]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Actions:" -ForegroundColor Yellow
    Write-Host "  Start      Start Frontend & Backend servers (Default)"
    Write-Host "  Stop       Stop Frontend & Backend servers"
    Write-Host "  Restart    Stop and then Start servers"
    Write-Host "  Status     Display current running status of services"
    Write-Host "  EnsureRunning    Start servers only if port 5000 or 3000 is down (used by the auto-start task)"
    Write-Host "  RegisterStartup  Register boot auto-start + 5 min health check (run as Administrator)"
    Write-Host "  Help       Display this help message"
    Write-Host "  UninstallStartup   Remove the Windows boot auto-start task"
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Production    Production mode (build + background)."
    Write-Host "  -Force         Non-interactive mode (force stop existing processes)"
    Write-Host "  -Unattended    Hide development server windows for automatic startup; Stop without confirmation"
    Write-Host "  -Diagnose      Run environment diagnosis only"
    Write-Host ""
    Write-Host "Auto-start task:" -ForegroundColor Yellow
    Write-Host "  RegisterStartup installs the Windows boot auto-start task (run as Administrator)."
    Write-Host "  Starting directly attempts registration; elevation is required."
    Write-Host "  Remove it with: .\scripts\AOP_Web.ps1 -Action UninstallStartup"
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

    $taskName = "AOP_Web_AutoStart"
    $startupTaskQueryError = $null
    try {
        $startupTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    } catch {
        if ($_.CategoryInfo.Category.ToString() -eq "ObjectNotFound") {
            $startupTask = $null
        } else {
            $startupTask = $null
            $startupTaskQueryError = $_.Exception.Message
        }
    }

    Write-Host "`n[Automatic Startup]" -ForegroundColor Cyan
    $startupProduction = $true
    $hasBootTrigger = $false
    $isS4ULogon = $false
    $isLimitedRunLevel = $false
    $isEnabled = $false
    $isEnsureAction = $false
    $hasEnabledBootTrigger = $false
    if ($startupTaskQueryError) {
        Write-Host "  Status: UNKNOWN | Task query failed: $startupTaskQueryError" -ForegroundColor Red
    } elseif ($startupTask) {
        $startupArguments = ($startupTask.Actions | ForEach-Object { $_.Arguments }) -join " "
        $startupProduction = $startupArguments -match '(^|\s)-Production(?=\s|$)'
        $bootTriggers = @($startupTask.Triggers | Where-Object {
            $_.CimClass.CimClassName -eq "MSFT_TaskBootTrigger"
        })
        $hasBootTrigger = $bootTriggers.Count -gt 0
        $hasEnabledBootTrigger = @($bootTriggers | Where-Object { $_.Enabled }).Count -gt 0
        $hasLogonTrigger = @($startupTask.Triggers | Where-Object {
            $_.CimClass.CimClassName -eq "MSFT_TaskLogonTrigger"
        }).Count -gt 0
        $isS4ULogon = $startupTask.Principal.LogonType.ToString() -eq "S4U"
        $isLimitedRunLevel = $startupTask.Principal.RunLevel.ToString() -eq "Limited"
        $isEnabled = $startupTask.State.ToString() -ne "Disabled"
        $isEnsureAction = $startupArguments -match '-Action\s+EnsureRunning'
        $triggerDescription = if ($hasBootTrigger) {
            "system startup"
        } elseif ($hasLogonTrigger) {
            "user logon"
        } else {
            "other"
        }

        if ($hasEnabledBootTrigger -and $isS4ULogon -and $isLimitedRunLevel -and $isEnabled -and $isEnsureAction) {
            Write-Host "  Status: CONFIGURED | Trigger: $triggerDescription + 5 min health check | Logon: S4U | Run level: Limited" -ForegroundColor Green
        } else {
            Write-Host "  Status: MISCONFIGURED | Trigger: $triggerDescription | Boot trigger enabled: $hasEnabledBootTrigger | Logon: $($startupTask.Principal.LogonType) | Run level: $($startupTask.Principal.RunLevel) | Enabled: $isEnabled | EnsureRunning: $isEnsureAction" -ForegroundColor Red
        }
    } else {
        Write-Host "  Status: NOT REGISTERED" -ForegroundColor Red
    }

    $legacyItems = @(Get-LegacyAutoStartItems)
    foreach ($item in $legacyItems) {
        Write-Host "  Legacy auto-start found: $($item.Kind) $($item.Name) ($($item.Detail))" -ForegroundColor Red
    }

    if (-not $startupTaskQueryError -and (-not $startupTask -or -not $hasEnabledBootTrigger -or -not $isS4ULogon -or -not $isLimitedRunLevel -or -not $isEnabled -or -not $isEnsureAction -or $legacyItems.Count -gt 0)) {
        $modeSwitch = if ($startupProduction) { " -Production" } else { "" }
        Write-Host "  Fix (run in Administrator PowerShell):" -ForegroundColor Yellow
        Write-Host "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptFilePath`" -Action RegisterStartup$modeSwitch" -ForegroundColor Yellow
    }

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
                Write-Log "User skipped stopping $($svc.Name) (use -Force or -Unattended for non-interactive stop)" "WARN"
                continue
            }
        }

        $stoppedOnPort = Stop-ProcessesOnPort -Port $svc.Port
        if ($stoppedOnPort -gt 0) {
            Write-Log "Stopped $($svc.Name) processes on port $($svc.Port)" "INFO"
            $stoppedCount += $stoppedOnPort
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

    Ensure-ProductionConfiguration

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
        Stop-ProcessesOnPort -Port 5000 | Out-Null
    }

    $env:AOP_ENV = if ($Production) { "production" } else { "development" }
    Write-Log "Starting backend server (Port 5000)..." "INFO"
    
    if ($Production -or $Unattended) {
        $backendStdoutLog = Join-Path $logDir "backend_stdout_$logTimestamp.log"
        $backendStderrLog = Join-Path $logDir "backend_stderr_$logTimestamp.log"
    }

    if ($Production) {
        $backendProcess = Start-Process -FilePath $pythonExe -ArgumentList "app.py" -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput $backendStdoutLog -RedirectStandardError $backendStderrLog -PassThru
    } else {
        $backendCommandPath = $backendPath.Replace("'", "''")
        $pythonCommandPath = $pythonExe.Replace("'", "''")
        $backendCmd = "Set-Location '$backendCommandPath'; & '$pythonCommandPath' app.py"
        $backendWindowStyle = if ($Unattended) { "Hidden" } else { "Normal" }
        if ($Unattended) {
            $backendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $backendCmd -WindowStyle $backendWindowStyle -RedirectStandardOutput $backendStdoutLog -RedirectStandardError $backendStderrLog -PassThru
        } else {
            $backendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $backendCmd -WindowStyle $backendWindowStyle -PassThru
        }
    }
    Write-Log "Backend PID: $($backendProcess.Id)" "INFO"
    $script:startedProcessIds += [int]$backendProcess.Id

    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
        throw "Backend process terminated immediately."
    }

    $backendStartupTimeout = if ($Unattended -or $Production) { 60 } else { 20 }
    if (Wait-ForPortListening -Port 5000 -TimeoutSeconds $backendStartupTimeout -IntervalMilliseconds 300) {
        Write-Log "Backend is listening on port 5000" "INFO"
    } else {
        if ($backendStderrLog) {
            Write-Log "Backend startup output: $backendStdoutLog; errors: $backendStderrLog" "ERROR"
        }
        Stop-ProcessTree -ProcessId $backendProcess.Id
        Stop-ProcessesOnPort -Port 5000 | Out-Null
        throw "Backend failed to listen on port 5000."
    }

    # 2. Frontend Setup
    # 실행 중인 프런트 서버가 node_modules 파일을 잡고 있으면 npm ci 가 실패하므로 먼저 포트를 비운다.
    $existingFrontend = @(Get-ProcessesOnPort -Port 3000)
    if ($existingFrontend.Count -gt 0) {
        Write-Log "Port 3000 is in use. Stopping existing process automatically..." "WARN"
        foreach ($p in $existingFrontend) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Log "Setting up frontend..." "INFO"
    $nodeModulesPath = Join-Path $frontendPath "node_modules"
    # 설치에 성공한 package-lock.json 의 해시를 node_modules\.aop-lock.sha256 에 남기고,
    # 현재 package-lock.json 해시와 다르면(예: git pull 로 의존성이 바뀜 — Next.js → Vite 전환 포함)
    # 기존 node_modules 를 쓰지 않고 다시 설치한다. 파일 시각에 의존하지 않는다.
    $projectLock = Join-Path $frontendPath "package-lock.json"
    if (!(Test-Path $projectLock)) { throw "frontend\package-lock.json not found" }
    $lockHash = (Get-FileHash -Path $projectLock -Algorithm SHA256).Hash
    $installMarker = Join-Path $nodeModulesPath ".aop-lock.sha256"
    $installedHash = ""
    if (Test-Path $installMarker) { $installedHash = ([string](Get-Content -Path $installMarker -TotalCount 1)).Trim() }
    $needsInstall = !(Test-Path $nodeModulesPath) -or ($installedHash -ne $lockHash)
    if ($needsInstall) {
        Write-Log "Installing dependencies (npm ci)..." "INFO"
        Set-Location $frontendPath
        & npm ci
        if ($LASTEXITCODE -ne 0) { Set-Location $projectPath; throw "npm ci failed" }
        Set-Content -Path $installMarker -Value $lockHash -Encoding ASCII
        Set-Location $projectPath
    }

    Write-Log "Starting frontend server (Port 3000)..." "INFO"
    if ($Production) {
        Write-Log "Building frontend for production..." "INFO"
        Set-Location $frontendPath
        if ($Unattended) {
            $frontendBuildLog = Join-Path $logDir "frontend_build_$logTimestamp.log"
            & npm run build *> $frontendBuildLog
            $buildExitCode = $LASTEXITCODE
        } else {
            & npm run build
            $buildExitCode = $LASTEXITCODE
        }
        if ($buildExitCode -ne 0) {
            Set-Location $projectPath
            if ($frontendBuildLog) {
                Write-Log "Frontend build output: $frontendBuildLog" "ERROR"
            }
            throw "Frontend build failed. Check the recorded npm output."
        }
        # Start-Process 는 확장자 없는 Unix 용 'npm' 스크립트를 먼저 잡아 실패한다.
        # cmd.exe 를 경유해 npm.cmd 가 실행되도록 고정한다.
        $frontendStdoutLog = Join-Path $logDir "frontend_stdout_$logTimestamp.log"
        $frontendStderrLog = Join-Path $logDir "frontend_stderr_$logTimestamp.log"
        $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start" -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput $frontendStdoutLog -RedirectStandardError $frontendStderrLog -PassThru
        Set-Location $projectPath
    } else {
        $frontendCommandPath = $frontendPath.Replace("'", "''")
        $frontendCmd = "Set-Location '$frontendCommandPath'; npm run dev"
        $frontendWindowStyle = if ($Unattended) { "Hidden" } else { "Normal" }
        if ($Unattended) {
            $frontendStdoutLog = Join-Path $logDir "frontend_stdout_$logTimestamp.log"
            $frontendStderrLog = Join-Path $logDir "frontend_stderr_$logTimestamp.log"
            $frontendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $frontendCmd -WindowStyle $frontendWindowStyle -RedirectStandardOutput $frontendStdoutLog -RedirectStandardError $frontendStderrLog -PassThru
        } else {
            $frontendProcess = Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $frontendCmd -WindowStyle $frontendWindowStyle -PassThru
        }
    }
    Write-Log "Frontend PID: $($frontendProcess.Id)" "INFO"
    $script:startedProcessIds += [int]$frontendProcess.Id

    $frontendStartupTimeout = if ($Unattended -or $Production) { 60 } else { 30 }
    $frontendListening = Wait-ForPortListening -Port 3000 -TimeoutSeconds $frontendStartupTimeout -IntervalMilliseconds 300
    if ($frontendListening) {
        Write-Log "Frontend is listening on port 3000" "INFO"
    } elseif ($Unattended -or $Production) {
        Stop-ProcessTree -ProcessId $frontendProcess.Id
        Stop-ProcessTree -ProcessId $backendProcess.Id
        foreach ($failedServicePort in @(3000, 5000)) {
            Stop-ProcessesOnPort -Port $failedServicePort | Out-Null
        }
        if ($frontendStderrLog) {
            Write-Log "Frontend startup output: $frontendStdoutLog; errors: $frontendStderrLog" "ERROR"
        }
        throw "Frontend failed to listen on port 3000."
    } else {
        Write-Log "Frontend port 3000 initialization in progress..." "WARN"
    }

    Write-Log "=== Startup Complete ===" "INFO"
    Write-Log "Backend:  http://localhost:5000" "INFO"
    Write-Log "Frontend: http://localhost:3000" "INFO"

    # 운영 모드로 직접 기동했을 때만 자동 시작 등록을 시도한다.
    # 개발 모드 start 가 운영 자동 복구 작업을 개발 모드로 덮어쓰지 않게 한다(개발 모드 등록은 RegisterStartup 으로 명시).
    # -Unattended 는 작업 스케줄러가 실행한 경로이므로 재등록을 피한다.
    if ($Production -and -not $Unattended) {
        try {
            Register-AutoStartTask
        } catch {
            # 등록 실패가 이미 성공한 서버 기동을 되돌릴 이유는 없다.
            Write-Log "Auto-start registration failed: $($_.Exception.Message)" "ERROR"
            Write-Host "[WARN] Auto-start task was not registered: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Save-JsonLog

    # 감시 루프 동안 기동 잠금을 쥐고 있으면 다른 기동(작업 스케줄러 포함)이 영원히 막히므로 먼저 푼다.
    Exit-StartLock

    # 무인 실행(작업 스케줄러)에서는 감시 루프를 돌지 않는다.
    # 루프를 돌면 작업이 영원히 Running 상태로 남아 다음 트리거·결과 판정이 불가능해진다.
    # 서버 프로세스는 Start-Process 로 분리 실행되므로 이 스크립트가 끝나도 계속 동작한다.
    if ($Production -and -not $Unattended) {
        Write-Log "Running health monitoring loop..." "INFO"
        while ($true) {
            Start-Sleep -Seconds 60
            if (-not (Test-PortListening -Port 5000)) { Write-Log "Backend health check warning: Port 5000 down" "WARN" }
            if (-not (Test-PortListening -Port 3000)) { Write-Log "Frontend health check warning: Port 3000 down" "WARN" }
        }
    }
}
#endregion

function Enter-StartLock {
    # 수동 Start 와 작업 스케줄러 EnsureRunning 이 동시에 포트를 정리·기동하지 않도록 한다.
    # 세션 0(S4U)과 대화형 세션을 모두 가로지르도록 뮤텍스 대신 배타 파일 잠금을 쓴다(프로세스 종료 시 자동 해제).
    param([int]$TimeoutSeconds = 0)
    $lockPath = Join-Path $logDir "aop_web_start.lock"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        try {
            $script:startLock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            return $true
        } catch [System.IO.IOException] {
            if ((Get-Date) -ge $deadline) { return $false }
            Start-Sleep -Milliseconds 500
        }
    }
}

function Exit-StartLock {
    if ($script:startLock) {
        $script:startLock.Dispose()
        $script:startLock = $null
    }
}

function Invoke-EnsureRunning {
    # 정상 상태에서는 로그 파일을 만들지 않고 바로 끝낸다(5분마다 실행되므로).
    if ((Test-PortListening -Port 5000) -and (Test-PortListening -Port 3000)) { return }
    # 수동 재기동의 짧은 공백과 겹치지 않도록 잠시 기다렸다가 다시 확인한다.
    Start-Sleep -Seconds 20
    if ((Test-PortListening -Port 5000) -and (Test-PortListening -Port 3000)) { return }
    if (-not (Enter-StartLock -TimeoutSeconds 0)) {
        Write-Log "Health check: services are down but another start holds the lock; skipped this round." "WARN"
        return
    }
    if ((Test-PortListening -Port 5000) -and (Test-PortListening -Port 3000)) { return }
    Write-Log "Health check: backend 5000 listening=$(Test-PortListening -Port 5000), frontend 3000 listening=$(Test-PortListening -Port 3000). Starting services." "WARN"
    Start-Services
}

#region Main Entry Point
try {
    switch ($Action) {
        "Status"  { Show-Status }
        # -Unattended 는 입력을 받을 수 없는 실행이므로 확인 질문 없이 정지한다(빈 입력이 '건너뜀'으로 처리되던 문제).
        "Stop"    {
            Stop-Services -NonInteractive:($Force -or $Unattended)
            $autoTask = Get-ScheduledTask -TaskName "AOP_Web_AutoStart" -ErrorAction SilentlyContinue
            if ($autoTask -and $autoTask.State.ToString() -ne "Disabled" -and ($autoTask.Actions.Arguments -match 'EnsureRunning')) {
                Write-Host "[WARN] Auto-recovery task is enabled; servers restart within about 5 minutes. To keep them stopped: schtasks /Change /TN AOP_Web_AutoStart /DISABLE (Administrator)" -ForegroundColor Yellow
            }
        }
        "Start"   {
            if (-not (Enter-StartLock -TimeoutSeconds 180)) { throw "Another AOP Web start is in progress." }
            Start-Services
        }
        "EnsureRunning" { Invoke-EnsureRunning }
        "RegisterStartup" {
            Ensure-ProductionConfiguration
            Register-AutoStartTask
        }
        "UninstallStartup" { Uninstall-StartupTask }
        "Restart" {
            if (-not (Enter-StartLock -TimeoutSeconds 180)) { throw "Another AOP Web start is in progress." }
            Stop-Services -NonInteractive:$true
            Start-Sleep -Seconds 1
            Start-Services
        }
    }
} catch {
    Stop-StartedServices
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Save-JsonLog
    Exit 1
} finally {
    # 대화형 셸에서 '&' 로 실행해 실패·Ctrl+C 로 끝나도 기동 잠금이 남지 않게 한다.
    Exit-StartLock
}
#endregion
