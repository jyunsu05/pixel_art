@echo off
title Pixel Art Converter - Starting...
echo.
echo  =============================================
echo   Pixel Art Converter - Starting servers...
echo  =============================================
echo.

:: Start backend in a new terminal window
start "Backend (FastAPI:8000)" cmd /k "cd /d C:\Users\user\pixel-art-converter\backend && venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

:: Wait a bit for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend in a new terminal window
start "Frontend (React:5173)" cmd /k "cd /d C:\Users\user\pixel-art-converter\frontend && npm run dev"

echo.
echo  Both servers are starting in separate windows.
echo.
echo  Frontend  ->  http://localhost:5173
echo  Backend   ->  http://localhost:8000
echo  API Docs  ->  http://localhost:8000/docs
echo.

:: Wait for frontend to start, then open browser
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo  Browser opened!
echo  Press any key to close this window.
pause >nul
