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

import yaml
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import SERVER_HOST, SERVER_PORT, DB_PATH
from database.sqlite import SQLiteDatabase
from database.models import User
from api import assets, reviews, projects, memory, auth, usage

# 加载配置文件
def load_config():
    """加载 config.yaml 配置文件"""
    config_path = Path(__file__).parent / "config.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}

# 初始化初始超级管理员
def init_super_admins(db: SQLiteDatabase, config: dict):
    """从配置文件加载初始超级管理员"""
    super_admins = config.get("super_admins", [])
    if not super_admins:
        return

    for admin in super_admins:
        user_id = admin.get("user_id")
        if not user_id:
            continue

        # 检查用户是否已存在
        existing = db.get_user(user_id)
        if existing:
            # 更新为超级管理员
            if existing.role != "super_admin":
                existing.role = "super_admin"
                existing.user_name = admin.get("name", existing.user_name)
                existing.department = admin.get("department", existing.department)
                db.save_user(existing)
                print(f"[Server] 更新用户 {user_id} 为超级管理员")
        else:
            # 创建新用户
            user = User(
                user_id=user_id,
                user_name=admin.get("name", user_id),
                role="super_admin",
                department=admin.get("department", ""),
            )
            db.save_user(user)
            print(f"[Server] 创建超级管理员: {user_id}")

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

# 加载配置并初始化超级管理员
config = load_config()
init_super_admins(db, config)

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
        "admin": {
            "usage": "/admin/usage",
            "assets": "/admin/assets",
            "reviews": "/admin/reviews",
            "users": "/admin/users",
            "settings": "/admin/settings",
        },
    }


@app.get("/admin/usage")
async def admin_usage():
    """用量统计管理页面"""
    return FileResponse("static/usage.html")


@app.get("/admin/assets")
async def admin_assets():
    """资产管理页面"""
    return FileResponse("static/assets.html")


@app.get("/admin/reviews")
async def admin_reviews():
    """审核管理页面"""
    return FileResponse("static/reviews.html")


@app.get("/admin/users")
async def admin_users():
    """用户管理页面"""
    return FileResponse("static/users.html")


@app.get("/admin/settings")
async def admin_settings():
    """系统设置页面"""
    return FileResponse("static/settings.html")


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
