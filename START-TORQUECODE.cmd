@echo off
rem One-click local start on Windows. Needs Docker Desktop (running), Node.js 24 and Git for Windows (Git Bash).
cd /d "%~dp0"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" (echo Git Bash not found at "%BASH%". Install Git for Windows, then run this again. & pause & exit /b 1)
"%BASH%" deploy/start.sh
if errorlevel 1 (echo Backend did not start. See deploy\.run\backend.log & pause & exit /b 1)
start "" "http://127.0.0.1:4177/#/register"
npx pnpm@11.25.0 web:serve
