@echo off
REM Double-clickable launcher for Windows.
REM Opens PowerShell with -NoExit (window stays open) and bypasses ExecutionPolicy for this run only.
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
