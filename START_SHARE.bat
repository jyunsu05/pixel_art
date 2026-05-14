@echo off
title Pixel Art Converter - Share Mode
chcp 65001 >nul

echo.
echo  ==========================================
echo    Pixel Art Converter - 공유 모드 시작
echo  ==========================================
echo.

:: ngrok 토큰 설정 (처음 한 번만 입력 필요)
set /p TOKEN="ngrok 토큰을 입력하세요 (https://ngrok.com/dashboard 에서 복사): "
if not "%TOKEN%"=="" (
    ngrok config add-authtoken %TOKEN%
)

:: 백엔드 서버 시작
echo.
echo [1/3] 백엔드 서버 시작 중...
start "Backend" cmd /k "cd /d C:\Users\user\pixel-art-converter\backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
timeout /t 4 /nobreak >nul

:: 프론트엔드 서버 시작
echo [2/3] 프론트엔드 서버 시작 중...
start "Frontend" cmd /k "cd /d C:\Users\user\pixel-art-converter\frontend && npm run dev -- --host 0.0.0.0"
timeout /t 6 /nobreak >nul

:: ngrok으로 프론트엔드 포트 외부 공개
echo [3/3] 공개 링크 생성 중...
echo.
echo  ======================================================
echo   아래에 표시되는 "Forwarding" URL을 공유하세요!
echo   예: https://xxxx-xx-xx-xx.ngrok-free.app
echo  ======================================================
echo.
ngrok http 5173

pause
