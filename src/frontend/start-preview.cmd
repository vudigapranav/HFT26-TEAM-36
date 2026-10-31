@echo off
cd /d "%~dp0"
if not exist node_modules call pnpm install --ignore-scripts
echo Open http://127.0.0.1:4177/landing/
call pnpm run dev
pause
