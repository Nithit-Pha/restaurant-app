@echo off
setlocal EnableDelayedExpansion
title Restaurant App - Start
rem ==========================================================================
rem  One-click start for the Restaurant App
rem    1. PostgreSQL in Docker (docker-compose.yml)
rem    2. First run only: npm install, server\.env, sample data
rem    3. Apply database migrations
rem    4. API (port 3001) and website (port 5173) in their own windows
rem    5. Open the browser
rem ==========================================================================
cd /d "%~dp0"

echo.
echo  ===== Restaurant App =====
echo.

rem ---- Check tools --------------------------------------------------------
where node >nul 2>nul || (
  echo  [X] Node.js was not found. Install it from https://nodejs.org and try again.
  goto :fail
)
where docker >nul 2>nul || (
  echo  [X] Docker was not found. Install Docker Desktop and try again.
  goto :fail
)
docker info >nul 2>nul || (
  echo  [X] Docker is not running. Please start Docker Desktop, wait until it is ready, then run this again.
  goto :fail
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
echo        Database is ready.

rem ---- 2. First-time setup -------------------------------------------------
echo  [2/5] Checking setup...
set FRESH_INSTALL=0
if not exist "server\node_modules" (
  echo        Installing server packages, this can take a few minutes...
  pushd server
  call npm install || (popd & echo  [X] npm install failed in server. & goto :fail)
  popd
  set FRESH_INSTALL=1
)
if not exist "client\node_modules" (
  echo        Installing website packages, this can take a few minutes...
  pushd client
  call npm install || (popd & echo  [X] npm install failed in client. & goto :fail)
  popd
)

set FIRST_RUN=0
if exist "server\.env" goto :envdone
echo        Creating server\.env with local development settings...
for /f %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set ACCESS_SECRET=%%s
for /f %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set REFRESH_SECRET=%%s
> "server\.env" echo # Created by start.bat for local development. Never commit this file.
>> "server\.env" echo DATABASE_URL=postgresql://restaurant:secret@localhost:5432/restaurant_db
>> "server\.env" echo JWT_ACCESS_SECRET=%ACCESS_SECRET%
>> "server\.env" echo JWT_REFRESH_SECRET=%REFRESH_SECRET%
>> "server\.env" echo PORT=3001
>> "server\.env" echo CLIENT_URL=http://localhost:5173
>> "server\.env" echo TAX_RATE=0.07
set FIRST_RUN=1
:envdone

rem ---- 3. Database schema --------------------------------------------------
echo  [3/5] Updating the database schema...
pushd server
if "!FRESH_INSTALL!"=="1" call npx prisma generate >nul
call npx prisma migrate deploy || (popd & echo  [X] Database migration failed. & goto :fail)
if "!FIRST_RUN!"=="1" (
  echo        Adding the admin accounts and sample menu...
  call npm run db:seed || (popd & echo  [X] Seeding sample data failed. & goto :fail)
)
popd

rem ---- 4. Start API and website ---------------------------------------------
echo  [4/5] Starting the API and the website...
netstat -ano | findstr /r /c:":3001 .*LISTENING" >nul && (
  echo        Port 3001 is already in use - the API may already be running. Skipping.
) || (
  start "Restaurant API" /d "%~dp0server" cmd /k npm run dev
)
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul && (
  echo        Port 5173 is already in use - the website may already be running. Skipping.
) || (
  start "Restaurant Web" /d "%~dp0client" cmd /k npm run dev
)

rem ---- 5. Open the browser when the website answers ---------------------------
echo  [5/5] Waiting for the website...
set /a tries=0
:waitweb
curl -s -o nul http://localhost:5173 && goto :webready
set /a tries+=1
if !tries! geq 90 goto :webready
timeout /t 1 /nobreak >nul
goto :waitweb
:webready
start "" http://localhost:5173

echo.
echo  ===== Ready =====
echo   Website : http://localhost:5173
echo   API     : http://localhost:3001
if "!FIRST_RUN!"=="1" (
  echo.
  echo   Sample logins - change these passwords before going live:
  echo     Super admin : superadmin@restaurant.com / superadmin123
  echo     Staff       : staff@restaurant.com / staff123
)
echo.
echo   To stop everything, run stop.bat (or close the two windows).
echo.
timeout /t 10 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
