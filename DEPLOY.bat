@echo off
title Pixel Art Converter - Deploy

echo.
echo  ==========================================
echo   Pixel Art Converter - Cloud Deploy
echo  ==========================================
echo.

cd /d C:\Users\user\pixel-art-converter

:: ── 1. Git commit + push ─────────────────────────────────────────────────
echo [1/3] Git commit and push...
git add -A
git commit -m "Update: AI pixel art, magic wand bg removal, body animation"
git push
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] git push failed.
    echo  - GitHub 연결이 안 되어 있을 수 있습니다.
    echo  - 아래 Vercel 배포는 계속 진행됩니다.
    echo.
)

:: ── 2. Frontend → Vercel ─────────────────────────────────────────────────
echo.
echo [2/3] Deploying frontend to Vercel...
cd frontend
call npx vercel deploy --prod --yes 2>&1
cd ..

:: ── 3. Done ──────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo   Deploy complete!
echo  ==========================================
echo.
echo  Frontend URL is shown above (vercel.app link).
echo.
echo  Backend (Render.com):
echo   - Render.com connects to your GitHub repo automatically.
echo   - Go to https://render.com and check your service status.
echo   - Or push to GitHub to trigger auto-redeploy.
echo.
pause
