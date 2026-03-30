# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Crossed Viper (Windows)
#
# Requirements (run in your venv):
#   pip install pyinstaller
#
# Build (from the project root):
#   pyinstaller crossed-viper/desktopclient/opentask_windows.spec --clean --noconfirm

block_cipher = None

a = Analysis(
    ['crossed-viper/desktopclient/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('crossed-viper/webclient', 'crossed-viper/webclient'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CrossedViper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # no console window in production
    icon='crossed-viper/webclient/icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CrossedViper',
)
