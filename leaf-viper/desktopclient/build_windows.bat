@echo off
setlocal
title Leaf Viper - Windows Build

:: Change to the project root (two levels up from leaf-viper/desktopclient/)
cd /d "%~dp0\..\.."
echo =============================================
echo  Leaf Viper Windows Build
echo =============================================
echo.

:: Check PyInstaller
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [*] Installing PyInstaller...
    pip install pyinstaller
)

:: Install all dependencies
echo [*] Installing Python dependencies...
pip install -r requirements.txt
pip install "pywebview>=4.0.0"

:: Build with PyInstaller
echo.
echo [*] Building with PyInstaller...
pyinstaller leaf-viper\desktopclient\leaf_viper_windows.spec --clean --noconfirm

if errorlevel 1 (
    echo.
    echo [ERROR] PyInstaller build failed.
    pause
    exit /b 1
)

echo.
echo [OK] Build complete: dist\LeafViper\LeafViper.exe

:: Create installer with Inno Setup (optional)
set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"

if exist %ISCC% (
    echo.
    echo [*] Creating installer with Inno Setup...
    %ISCC% leaf-viper\desktopclient\leaf_viper_installer.iss
    if errorlevel 1 (
        echo [ERROR] Inno Setup failed.
    ) else (
        echo [OK] Installer: dist\installer\LeafViper_Setup_1.0.0.exe
    )
) else (
    echo.
    echo [!] Inno Setup not found - skipping installer creation.
    echo     To build an installer, install Inno Setup 6 from:
    echo     https://jrsoftware.org/isdl.php
    echo     Then run: %ISCC% leaf-viper\desktopclient\leaf_viper_installer.iss
)

echo.
echo Done!
pause
