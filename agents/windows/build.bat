@echo off
REM Build the Windows agent into a single .exe using PyInstaller
REM Run this from the agents/windows/ directory

echo Installing dependencies...
pip install -r requirements.txt pyinstaller

echo.
echo Building agent.exe...
set HIDDEN=--hidden-import=pystray._win32 --hidden-import=pycaw.pycaw --hidden-import=comtypes --hidden-import=winrt.windows.foundation --hidden-import=winrt.windows.foundation.collections --hidden-import=winrt.windows.media.control --hidden-import=winrt.windows.storage.streams
if exist icon.ico (
    pyinstaller --onefile --noconsole --icon=icon.ico %HIDDEN% --name live-dashboard-agent agent.py
) else (
    pyinstaller --onefile --noconsole %HIDDEN% --name live-dashboard-agent agent.py
)

echo.
echo Done! Output: dist\live-dashboard-agent.exe
echo Copy config.json next to the .exe before running.
pause
