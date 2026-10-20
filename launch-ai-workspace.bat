@echo off
setlocal
title AI Workspace
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [AI Workspace] Node.js is not installed. Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [AI Workspace] Dependencies not found. Installing...
  call npm install
  if errorlevel 1 (
    echo [AI Workspace] Dependency install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [AI Workspace] Production build not found. Building...
  call npm run build
  if errorlevel 1 (
    echo [AI Workspace] Build failed. Check the build error above.
    pause
    exit /b 1
  )
)

echo [AI Workspace] Launching...

call npm run start
set EXITCODE=%ERRORLEVEL%

echo [AI Workspace] Closed.

exit /b %EXITCODE%
