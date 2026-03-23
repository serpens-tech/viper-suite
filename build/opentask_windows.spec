# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for OpenTask (Windows)
#
# Requirements (run in your venv):
#   pip install pyinstaller
#
# Build (from the project root):
#   pyinstaller build/opentask_windows.spec --clean --noconfirm

block_cipher = None

a = Analysis(
    ['desktopclient/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('webclient', 'webclient'),
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
    name='OpenTask',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # no console window in production
    icon='webclient/icon.ico',              # replace with 'assets/icon.ico' if you have one
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='OpenTask',
)
