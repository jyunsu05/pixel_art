@echo off
cd /d C:\Users\user\pixel-art-converter\frontend
echo Running npm run build...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)
echo BUILD OK
pause
