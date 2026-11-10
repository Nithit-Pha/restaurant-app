@echo off
setlocal
title Restaurant App - Stop
rem Stops the API (3001), the website (5173) and the database container.
cd /d "%~dp0"

echo.
echo  Stopping the Restaurant App...

for %%p in (3001 5173) do (
  for /f "tokens=5" %%i in ('netstat -ano ^| findstr /r /c:":%%p .*LISTENING"') do (
    echo    Stopping process on port %%p (PID %%i^)
    taskkill /pid %%i /t /f >nul 2>nul
  )
)

rem Close the two windows opened by start.bat (if they still have their title)
taskkill /fi "WINDOWTITLE eq Restaurant API*" /t /f >nul 2>nul
taskkill /fi "WINDOWTITLE eq Restaurant Web*" /t /f >nul 2>nul

where docker >nul 2>nul && (
  echo    Stopping the database container (your data is kept^)...
  docker compose stop >nul 2>nul || docker-compose stop >nul 2>nul
)

echo  Done.
timeout /t 3 >nul
