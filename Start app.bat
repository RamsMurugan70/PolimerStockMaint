@echo off
title Stock and Dispatch - keep this window open
cd /d "%~dp0"
start "" http://localhost:8091/
node server\server.js
pause
