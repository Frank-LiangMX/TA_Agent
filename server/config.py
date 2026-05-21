"""
服务器配置
"""
import os
from pathlib import Path


# 服务器配置
SERVER_HOST = os.getenv("TAGENT_SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("TAGENT_SERVER_PORT", "8081"))

# 数据目录
DATA_DIR = os.getenv("TAGENT_DATA_DIR", str(Path(__file__).parent.parent / "data"))
DB_PATH = os.path.join(DATA_DIR, "tagent.db")
PREVIEWS_DIR = os.path.join(DATA_DIR, "previews")

# 确保目录存在
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PREVIEWS_DIR, exist_ok=True)
