@echo off
setlocal

set "KICETIC_API_URL=http://127.0.0.1:8005"
set "KICETIC_DIST_DIR=.next-kicetic-web"

echo [KICETIC] starting API server...
start "KICETIC API" cmd /k "cd /d "%~dp0apps\api" && python -m pip install -r requirements.txt && uvicorn app.main:app --host 127.0.0.1 --port 8005 --reload"

echo [KICETIC] starting Web server...
start "KICETIC Web" cmd /k "cd /d "%~dp0" && set "NEXT_PUBLIC_USE_MOCK=false" && set "NEXT_PUBLIC_KICETIC_API_BASE_URL=%KICETIC_API_URL%" && set "NEXT_DIST_DIR=%KICETIC_DIST_DIR%" && npm install && npm run dev:web"

echo.
echo API: %KICETIC_API_URL%/health
echo Web: http://localhost:3000/dashboard/overview
echo If port 3000 is already occupied, Next.js will move to 3001/3002/3003 automatically.
echo.
echo Close the opened terminal windows to stop the servers.
