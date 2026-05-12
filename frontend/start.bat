@echo off
echo [Pixel Art Converter] Starting React frontend...

if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)

echo.
echo Frontend running at http://localhost:5173
echo.
npm run dev
