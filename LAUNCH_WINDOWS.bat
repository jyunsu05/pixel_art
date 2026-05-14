@echo off
REM One double-click: Matrix GUI + SD WebUI (--api) + Pixel dev stack (START_ALL)
title Launch Matrix / WebUI / Pixel

start "Stability Matrix" /D "C:\Users\user\Downloads\StabilityMatrix-win-x64" "C:\Users\user\Downloads\StabilityMatrix-win-x64\StabilityMatrix.exe"

start "SD WebUI API" cmd /k cd /d "C:\Users\user\Downloads\StabilityMatrix-win-x64\Data\Packages\Stable Diffusion WebUI" ^&^& webui-user.bat

start "Pixel Art Converter" cmd /k cd /d C:\Users\user\pixel-art-converter ^&^& START_ALL.bat

echo Started three windows — check taskbar for Stability Matrix, SD WebUI, Pixel.
