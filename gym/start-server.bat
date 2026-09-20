@echo off
title Apex Titan Gym Localhost Server
echo ========================================================
echo   Launching Apex Titan Gym Localhost Server...
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
