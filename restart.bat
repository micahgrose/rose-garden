@echo off
echo Killing any process on port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo Starting server...
node server.js
