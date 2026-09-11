# Legacy Wrapper for Backward Compatibility -> Forward to AOP_Web.ps1
param(
    [switch]$Production,
    [switch]$Debug,
    [switch]$Diagnose,
    [switch]$Help
)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptPath "AOP_Web.ps1") -Action Start -Production:$Production -Debug:$Debug -Diagnose:$Diagnose -Help:$Help
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
