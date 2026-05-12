@echo off
echo [Pixel Art Converter] Starting FastAPI backend...

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Installing requirements...
pip install -r requirements.txt -q

if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env
)

echo.
echo Backend running at http://localhost:8000
echo API docs at   http://localhost:8000/docs
echo.
uvicorn app.main:app --reload --port 8000
