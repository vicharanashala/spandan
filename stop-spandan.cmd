@echo off
setlocal
rem Stop the Spandan dev servers by killing whatever is LISTENING on their ports
rem (backend 3001, Vite 5173). Safe to run when nothing is running.

for %%P in (3001 5173) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo Stopping process %%I on port %%P...
    taskkill /PID %%I /F >nul 2>&1
  )
)
echo Spandan stopped.
exit /b 0
