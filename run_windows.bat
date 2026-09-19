@echo off
REM ARES-Upgraded launcher (Windows)
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================
echo   ARES-Upgraded — Windows launcher
echo ==============================================

where py >nul 2>&1 && set PYTHON=py -3
if not defined PYTHON where python >nul 2>&1 && set PYTHON=python
if not defined PYTHON (
  echo ERROR: Python not found. Install Python 3.10+ and add it to PATH.
  pause
  exit /b 1
)

echo [1/3] Python:
%PYTHON% --version
echo [2/3] Installing dependencies (if needed)...
%PYTHON% -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo pip install failed. Try: %PYTHON% -m pip install -r requirements.txt
  pause
  exit /b 1
)

set CMD=%~1
if "%CMD%"=="" set CMD=ui

if /I "%CMD%"=="ui" goto UI
if /I "%CMD%"=="dashboard" goto UI
if /I "%CMD%"=="gradio" goto UI
if /I "%CMD%"=="benchmark" goto BENCH
if /I "%CMD%"=="bench" goto BENCH
if /I "%CMD%"=="list" goto LIST
if /I "%CMD%"=="models" goto LIST
if /I "%CMD%"=="train-hybrid" goto TRAINH
if /I "%CMD%"=="train" goto TRAIN
if /I "%CMD%"=="help" goto HELP
if /I "%CMD%"=="-h" goto HELP
if /I "%CMD%"=="--help" goto HELP

echo Unknown command: %CMD%
goto HELP

:UI
echo [3/3] Starting Live UI on http://127.0.0.1:7860
echo       Open that URL in your browser.
%PYTHON% main.py ui --port 7860
goto END

:BENCH
echo [3/3] Running CLI multi-model benchmark...
%PYTHON% main.py benchmark
goto END

:LIST
%PYTHON% main.py list-models
goto END

:TRAINH
echo [3/3] Pilot-training ARES-Hybrid-INN...
%PYTHON% training/train_hybrid_inn.py --pilot --epochs 3
goto END

:TRAIN
echo [3/3] Pilot-training ARES-Upgraded...
%PYTHON% training/train_ares.py --pilot --epochs 3
goto END

:HELP
echo.
echo Usage: run_windows.bat [command]
echo.
echo   ui            Start Gradio live benchmark UI (default)
echo   benchmark     CLI full multi-model benchmark
echo   list          List registered models
echo   train         Pilot-train ARES-Upgraded CNN
echo   train-hybrid  Pilot-train ARES-Hybrid-INN
echo   help          Show this help
echo.
echo Examples:
echo   run_windows.bat
echo   run_windows.bat ui
echo   run_windows.bat benchmark
echo.
goto END

:END
if /I not "%CMD%"=="ui" if /I not "%CMD%"=="dashboard" if /I not "%CMD%"=="gradio" pause
endlocal
