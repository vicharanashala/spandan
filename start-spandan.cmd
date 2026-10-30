@echo off
setlocal
cd /d "%~dp0"

rem One-click local start: install dependencies on first run, then launch the backend and
rem frontend in separate minimized windows. Stop them again with stop-spandan.cmd.

if not exist "node_modules" (
  echo Installing root dependencies...
  call npm install --no-audit --no-fund || goto :error
)
if not exist "backend\node_modules" (
  echo Installing backend dependencies...
  call npm install --workspace=backend --no-audit --no-fund || goto :error
)
if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  call npm install --workspace=frontend --no-audit --no-fund || goto :error
)

echo Starting Spandan backend and frontend...
start "" wscript.exe "%~dp0start-backend.vbs"
start "" wscript.exe "%~dp0start-frontend.vbs"

rem Give Vite a moment to bind its port before opening the browser.
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
echo Spandan is starting. Frontend: http://localhost:5173  Backend: http://localhost:3001
exit /b 0

:error
echo Failed to install dependencies. See the messages above.
exit /b 1
