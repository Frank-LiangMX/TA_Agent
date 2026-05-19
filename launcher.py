"""
TAgent 桌面启动器

双击启动：
1. 启动后端 server（本机 8080 端口）
2. 自动打开浏览器 http://localhost:8080
3. 系统托盘显示图标（可选）

打包命令：
  pyinstaller --noconsole --onefile --name TAgent launcher.py
"""

import os
import sys
import time
import webbrowser
import threading
import signal

# 确定项目根目录
if getattr(sys, 'frozen', False):
    # PyInstaller 打包后 - exe 所在目录
    BASE_DIR = os.path.dirname(sys.executable)
    # 数据文件在 _internal 目录
    DATA_DIR = os.path.join(BASE_DIR, "_internal")
    if not os.path.isdir(DATA_DIR):
        DATA_DIR = BASE_DIR  # 单文件模式
else:
    # 开发环境
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = BASE_DIR

# 设置工作目录
os.chdir(BASE_DIR)

# 将项目根目录和数据目录加入 Python 路径
for p in [BASE_DIR, DATA_DIR, os.path.join(DATA_DIR, "fronted", "server")]:
    if p not in sys.path and os.path.isdir(p):
        sys.path.insert(0, p)

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8080
BROWSER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"


def find_frontend_dir():
    """查找前端静态文件目录"""
    candidates = [
        os.path.join(DATA_DIR, "fronted", "dist"),
        os.path.join(DATA_DIR, "fronted", "build"),
        os.path.join(BASE_DIR, "fronted", "dist"),
        os.path.join(BASE_DIR, "fronted", "build"),
        os.path.join(BASE_DIR, "dist"),
    ]
    for d in candidates:
        if os.path.isdir(d) and os.path.exists(os.path.join(d, "index.html")):
            return d
    return None


def start_server():
    """启动 FastAPI 服务器"""
    try:
        # 导入 server 模块
        server_dir = os.path.join(DATA_DIR, "fronted", "server")
        if not os.path.isdir(server_dir):
            server_dir = os.path.join(BASE_DIR, "fronted", "server")
        if server_dir not in sys.path:
            sys.path.insert(0, server_dir)

        from server import app
        import uvicorn

        # 如果有预构建的前端静态文件，挂载到服务器
        frontend_dir = find_frontend_dir()
        if frontend_dir:
            from fastapi.staticfiles import StaticFiles
            from fastapi.responses import FileResponse

            @app.get("/")
            async def serve_index():
                return FileResponse(os.path.join(frontend_dir, "index.html"))

            app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")
            print(f"[TAgent] 前端静态文件: {frontend_dir}")
        else:
            print(f"[TAgent] 前端: 开发模式（需要 npm run dev）")

        print(f"[TAgent] 启动服务器 {BROWSER_URL}")
        uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, log_level="warning")
    except Exception as e:
        print(f"[TAgent] 服务器启动失败: {e}")
        input("按回车退出...")
        sys.exit(1)


def open_browser():
    """延迟打开浏览器"""
    time.sleep(3)
    print(f"[TAgent] 打开浏览器 {BROWSER_URL}")
    webbrowser.open(BROWSER_URL)


def main():
    print("=" * 50)
    print("  TAgent - 游戏技术美术 AI Agent")
    print("=" * 50)
    print()
    print(f"  后端地址: {BROWSER_URL}")
    print(f"  工作目录: {BASE_DIR}")
    print()
    print("  按 Ctrl+C 退出")
    print("=" * 50)

    # 在后台线程打开浏览器
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()

    # 启动服务器（主线程阻塞）
    try:
        start_server()
    except KeyboardInterrupt:
        print("\n[TAgent] 已停止")


if __name__ == "__main__":
    main()
