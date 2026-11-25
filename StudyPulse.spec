# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('D:/ADVAN/Documents/Semester 5/EAPP/fatul/web', 'web'), ('D:/ADVAN/Documents/Semester 5/EAPP/fatul/studypulse.db', '.')],
    hiddenimports=['bottle', 'bottle_websocket', 'gevent', 'gevent.ssl', 'gevent.builtins', 'sqlite3', 'psycopg2', 'psycopg2.extras'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='StudyPulse',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='StudyPulse',
)
