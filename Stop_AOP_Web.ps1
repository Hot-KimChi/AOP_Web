# Legacy Wrapper for Backward Compatibility -> Forward to AOP_Web.ps1
param(
    [switch]$Force,
    [switch]$Help
)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptPath "AOP_Web.ps1") -Action Stop -Force:$Force -Help:$Help
