# -*- mode: python ; coding: utf-8 -*-
"""
TAgent PyInstaller 打包配置

打包命令：
  pyinstaller TAgent.spec
"""

import os
import glob

block_cipher = None
base_dir = os.path.dirname(os.path.abspath(SPEC))

def _submodules(pkg_root: str) -> list[str]:
    """收集给定目录下的所有 Python 模块（不含 __init__），返回 'pkg.submodule' 列表"""
    modules = []
    pkg_name = pkg_root.replace(os.sep, '.')  # e.g. 'packages/tools' -> 'packages.tools'
    for pyfile in glob.glob(os.path.join(pkg_root, '*.py')):
        name = os.path.basename(pyfile)[:-3]  # strip .py
        if name != '__init__':
            modules.append(f'{pkg_name}.{name}')
    # 子包
    for subpkg in glob.glob(os.path.join(pkg_root, '*/__init__.py')):
        subname = os.path.basename(os.path.dirname(subpkg))
        modules.append(f'{pkg_name}.{subname}')
    return modules

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
        # tools 包子模块（glob 扫描，不依赖运行时 import）
        *_submodules('packages/tools'),
        *_submodules('packages/tools/core'),
        *_submodules('packages/tools/extensions'),
        *_submodules('packages/tools/plugins'),
        # fastapi / starlette / websockets（必须显式列，否则 PyInstaller 分析跳過）
        'fastapi',
        'fastapi.responses',
        'fastapi.staticfiles',
        'fastapi.middleware.cors',
        'starlette',
        'starlette.responses',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.exceptions',
        'starlette.websockets',
        'websockets',
        'websockets.client',
        'websockets.server',
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
        'uvicorn.middleware.proxy_headers',
        'openai',
        'PIL',
        'PIL.Image',
        'numpy',
        'numpy.core',
        'numpy.core.multiarray',
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
