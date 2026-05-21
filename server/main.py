"""
TAgent Server 主入口

启动方式：
  cd server
  pip install -r requirements.txt
  python main.py

API 文档：
  http://localhost:8080/docs
"""
import sys
from pathlib import Path

# 将 server 目录加入 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import SERVER_HOST, SERVER_PORT, DB_PATH
from database.sqlite import SQLiteDatabase
from api import assets, reviews, projects, memory, auth, usage

# 创建 FastAPI 应用
app = FastAPI(
    title="TAgent Server",
    description="TA Agent 数据服务器",
    version="1.0.0",
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库
db = SQLiteDatabase(DB_PATH)
db.connect()

# 注入数据库到 API 模块
assets.set_db(db)
reviews.set_db(db)
projects.set_db(db)
memory.set_db(db)
auth.set_db(db)
usage.set_db(db)

# 注册路由
app.include_router(assets.router)
app.include_router(reviews.router)
app.include_router(projects.router)
app.include_router(memory.router)
app.include_router(auth.router)
app.include_router(usage.router)


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "TAgent Server",
        "version": "1.0.0",
        "docs": "/docs",
        "admin": "/admin/usage",
    }


@app.get("/admin/usage")
async def admin_usage():
    """用量统计管理页面"""
    return FileResponse("static/usage.html")


# 静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("shutdown")
async def shutdown():
    """关闭时清理资源"""
    db.close()


if __name__ == "__main__":
    print("=" * 50)
    print(f"  TAgent Server")
    print(f"  http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"  API 文档: http://{SERVER_HOST}:{SERVER_PORT}/docs")
    print("=" * 50)

    uvicorn.run(
        "main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=True,
    )
