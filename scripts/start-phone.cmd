@echo off
rem Starts Money Tracker for your phone: listens on this PC only (127.0.0.1:3100), where `tailscale serve` picks it up.
rem Put a shortcut to this file in the Startup folder (Win+R, type shell:startup) to have it start when you sign in.
rem Build first (pnpm run build) after every update to the app: this runs the last build.
cd /d "%~dp0.."
call pnpm run start:phone
pause
