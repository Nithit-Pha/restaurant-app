@echo off
setlocal EnableDelayedExpansion
title Restaurant App - Start (shop)
rem ==========================================================================
rem  Start the Restaurant App for use in the shop (production build).
rem  Phones and tablets on the shop Wi-Fi open http://<this PC's IP>:5173
rem    1. PostgreSQL in Docker (only reachable from this PC)
rem    2. Apply database migrations
rem    3. Build and start the API (port 3001, only reachable from this PC)
rem    4. Build and start the website (port 5173, reachable on the Wi-Fi)
rem  Run start.bat once first (it installs packages and creates server\.env).
rem  Stop everything with stop.bat.
rem  Plan: docs\2026-11-12-shop-network-setup.md
rem ==========================================================================
cd /d "%~dp0"

echo.
echo  ===== Restaurant App (shop) =====
echo.

rem ---- Checks ----------------------------------------------------------------
where node >nul 2>nul || (
  echo  [X] Node.js was not found. Install it from https://nodejs.org and try again.
  goto :fail
)
docker info >nul 2>nul || (
  echo  [X] Docker is not running. Start Docker Desktop, wait until it shows "Engine running", then run this again.
  goto :fail
)
if not exist "server\.env" (
  echo  [X] server\.env is missing. Run start.bat once first.
  goto :fail
)
if not exist "server\node_modules" (
  echo  [X] Server packages are missing. Run start.bat once first.
  goto :fail
)
if not exist "client\node_modules" (
  echo  [X] Website packages are missing. Run start.bat once first.
  goto :fail
)
for %%p in (3001 5173) do (
  netstat -ano | findstr /r /c:":%%p .*LISTENING" >nul && (
    echo  [X] Port %%p is already in use - the app may already be running. Run stop.bat first.
    goto :fail
  )
)
findstr /b /c:"SITE_URL=" "client\.env.local" >nul 2>nul || (
  echo  [!] SITE_URL is not set in client\.env.local.
  echo      Table QR codes and page links will use http://localhost:5173, which phones cannot open.
  echo      Add a line like  SITE_URL=http://192.168.1.10:5173  using this PC's address shown at the end.
  echo.
)

rem ---- 1. Database ---------------------------------------------------------
echo  [1/5] Starting the database...
docker compose up -d >nul 2>nul || docker-compose up -d || (
  echo  [X] Could not start the database container.
  goto :fail
)
set /a tries=0
:waitdb
docker exec restaurant_db pg_isready -U restaurant >nul 2>nul && goto :dbready
set /a tries+=1
if !tries! geq 30 (
  echo  [X] The database did not become ready within 30 seconds.
  goto :fail
)
timeout /t 1 /nobreak >nul
goto :waitdb
:dbready

rem ---- 2. Database schema --------------------------------------------------
echo  [2/5] Updating the database schema...
pushd server
call npx prisma migrate deploy || (popd & echo  [X] Database migration failed. & goto :fail)

rem ---- 3. API --------------------------------------------------------------
echo  [3/5] Building the API...
call npm run build || (popd & echo  [X] Building the API failed. & goto :fail)
popd
start "Restaurant API" /d "%~dp0server" cmd /k "set NODE_ENV=production&& npm start"
set /a tries=0
:waitapi
curl -s -o nul http://127.0.0.1:3001/health && goto :apiready
set /a tries+=1
if !tries! geq 30 (
  echo  [X] The API did not answer within 30 seconds. Check the "Restaurant API" window.
  goto :fail
)
timeout /t 1 /nobreak >nul
goto :waitapi
:apiready

rem ---- 4. Website ----------------------------------------------------------
rem Built after the API is up, so the menu pages are built with real data.
echo  [4/5] Building the website, this can take a few minutes...
pushd client
call npm run build || (popd & echo  [X] Building the website failed. & goto :fail)
popd
start "Restaurant Web" /d "%~dp0client" cmd /k npm start

echo  [5/5] Waiting for the website...
set /a tries=0
:waitweb
curl -s -o nul http://127.0.0.1:5173 && goto :webready
set /a tries+=1
if !tries! geq 60 (
  echo  [X] The website did not answer within 60 seconds. Check the "Restaurant Web" window.
  goto :fail
)
timeout /t 1 /nobreak >nul
goto :waitweb
:webready

echo.
echo  ===== Ready =====
echo   On this PC : http://localhost:5173
echo   On the shop Wi-Fi, open this on a phone (the network name is in brackets):
rem Only connected adapters with a router (default gateway): skips VPN, WSL
rem and unplugged adapters that still keep an old address.
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { 'http://{0}:5173   [{1}]' -f $_.IPv4Address[0].IPAddress, $_.InterfaceAlias }"`) do (
  echo     %%a
)
echo.
echo   To stop everything, run stop.bat.
echo.
timeout /t 15 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
