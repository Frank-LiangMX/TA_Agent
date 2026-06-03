# -*- mode: python ; coding: utf-8 -*-
"""
TAgent PyInstaller 打包配置

打包命令：
  pyinstaller TAgent.spec
"""

import os

block_cipher = None
base_dir = os.path.dirname(os.path.abspath(SPEC))

a = Analysis(
    ['launcher.py'],
    pathex=[base_dir, os.path.join(base_dir, 'backend'), os.path.join(base_dir, 'packages')],
    binaries=[],
    datas=[
        # 前端静态文件（release/frontend 目录）
        ('release/frontend', 'release/frontend') if os.path.isdir(os.path.join(base_dir, 'release', 'frontend')) else ('apps/web/server/requirements.txt', 'apps/web/server'),
        # 工具模块
        ('packages/tools', 'packages/tools'),
        # 标签系统
        ('packages/tags', 'packages/tags'),
        # 规范系统
        ('packages/conventions', 'packages/conventions'),
        # 核心模块
        ('packages/core', 'packages/core'),
        # 后端核心文件（PyInstaller 打包后在 _internal/backend/ 目录）
        ('backend/config.py', 'backend'),
        ('backend/analyzer.py', 'backend'),
        ('backend/session_manager.py', 'backend'),
        ('backend/agent_main.py', 'backend'),
        # 前端服务器
        ('apps/web/server/server.py', 'apps/web/server'),
        ('apps/web/server/progress_hook.py', 'apps/web/server'),
        ('apps/web/server/requirements.txt', 'apps/web/server'),
    ],
    hiddenimports=[
        'agent_main',
        'config',
        'session_manager',
        'tools',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.responses',
        'openai',
        'PIL',
        'numpy',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['PyQt5', 'PyQt6', 'matplotlib', 'tkinter', 'IPython', 'jupyter', 'notebook', 'scipy', 'pandas'],
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
    name='TAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 显示控制台（方便看日志）
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='TAgent',
)
