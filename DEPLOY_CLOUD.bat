@echo off
title Pixel Art Converter - Cloud Deploy
chcp 65001 >nul

echo.
echo  ============================================
echo    Pixel Art Converter - 클라우드 배포
echo  ============================================
echo.
echo  이 스크립트는 다음을 배포합니다:
echo    - Frontend  → Vercel  (무료)
echo    - Backend   → Railway (무료)
echo.
echo  각 단계에서 브라우저가 열리면 로그인해 주세요.
echo.
pause

:: ─── STEP 1: Railway CLI 설치 ─────────────────────────────────────────────
echo.
echo [1/4] Railway CLI 설치 중...
call npm install -g @railway/cli 2>&1
echo Railway CLI 설치 완료.

:: ─── STEP 2: Railway 로그인 ────────────────────────────────────────────────
echo.
echo [2/4] Railway 로그인...
echo  브라우저가 열리면 railway.app 에서 로그인해 주세요.
echo  (GitHub 로그인 가능)
call railway login
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Railway 로그인 실패. 다시 시도해 주세요.
    pause
    exit /b 1
)

:: ─── STEP 3: 백엔드 Railway 배포 ───────────────────────────────────────────
echo.
echo [3/4] 백엔드를 Railway에 배포 중... (2-5분 소요)
cd /d C:\Users\user\pixel-art-converter\backend
call railway init --name pixel-art-backend
call railway up --detach
echo.
echo  백엔드 URL 확인 중...
call railway domain
cd /d C:\Users\user\pixel-art-converter

:: ─── STEP 4: 프론트엔드 Vercel 배포 ────────────────────────────────────────
echo.
echo [4/4] 프론트엔드를 Vercel에 배포 중...
cd /d C:\Users\user\pixel-art-converter\frontend
call npx vercel deploy --prod --yes
cd /d C:\Users\user\pixel-art-converter

:: ─── 완료 ───────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    배포 완료!
echo  ============================================
echo.
echo  위에 표시된 URL들로 어디서든 접속 가능합니다.
echo.
echo  [중요] AI 기능을 사용하려면:
echo   Railway 대시보드 (railway.app) 에서
echo   Variables 메뉴에 아래 키를 추가하세요:
echo     HF_API_TOKEN=hf_여기에입력
echo     REPLICATE_API_TOKEN=r8_여기에입력
echo.
pause
