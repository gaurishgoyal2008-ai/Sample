@echo off
title Ceova AI Vision - Local Camera Companion Service
echo ======================================================================
echo Starting Ceova Local Camera Companion Service...
echo ======================================================================

cd /d "%~dp0\backend"
python run_companion.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Python failed to start the companion service.
    echo Please make sure Python 3.9+ is installed and dependencies are installed via:
    echo pip install -r requirements.txt
    pause
)
