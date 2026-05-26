# TAgent Server 部署指南

> 服务器部署说明，供技术人员参考
> 最后更新：2026-05-26

---

## 一、环境要求

| 项目 | 要求 |
|------|------|
| Python | 3.10+ |
| 操作系统 | Windows / Linux |
| 端口 | 8081（可配置） |

## 二、目录结构

```
server/
├── main.py                   # 主入口
├── config.py                 # 配置文件
├── config.yaml               # 部署配置（初始管理员等）
├── requirements.txt          # Python 依赖
├── database/
│   ├── base.py               # 数据库抽象层
│   ├── models.py             # 数据模型
│   └── sqlite.py             # SQLite 实现
├── api/
│   ├── assets.py             # 资产 API
│   ├── reviews.py            # 审核 API
│   ├── projects.py           # 项目配置 API
│   ├── memory.py             # 记忆系统 API
│   ├── auth.py               # 认证 API
│   └── usage.py              # 用量统计 API
└── static/
    ├── usage.html            # 用量统计管理页面
    ├── assets.html           # 资产管理页面
    ├── reviews.html          # 审核管理页面
    ├── users.html            # 用户管理页面
    └── settings.html         # 系统设置页面
```

## 三、快速启动

### Windows

```bash
# 进入 server 目录
cd server

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

### Linux

```bash
# 进入 server 目录
cd server

# 安装依赖
pip3 install -r requirements.txt

# 启动服务
python3 main.py
```

## 四、访问地址

启动成功后，访问以下地址：

| 地址 | 说明 |
|------|------|
| http://localhost:8081 | 服务根路径 |
| http://localhost:8081/docs | API 文档（Swagger UI） |
| http://localhost:8081/admin/usage | 用量统计管理页面 |
| http://localhost:8081/health | 健康检查 |

## 五、配置说明

编辑 `config.yaml` 修改配置：

```yaml
# 服务器配置
server:
  host: "0.0.0.0"
  port: 8081

# 数据目录
data_dir: "./data"

# 初始超级管理员（部署时配置）
super_admins:
  - user_id: "zhangsan"
    name: "张三"
    department: "技术美术组"

# 用量限制
limits:
  calls_per_5h: 1500
  tokens_per_call: 4096
```

也可以通过环境变量覆盖：

```bash
# Linux
export TAGENT_SERVER_HOST=0.0.0.0
export TAGENT_SERVER_PORT=8081
export TAGENT_DATA_DIR=/opt/tagent/data

# Windows
set TAGENT_SERVER_HOST=0.0.0.0
set TAGENT_SERVER_PORT=8081
set TAGENT_DATA_DIR=C:\tagent\data
```

## 六、API 接口

### 资产管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/assets` | GET | 列出资产 |
| `/api/assets/{id}` | GET | 获取资产详情 |
| `/api/assets/sync` | POST | 同步资产数据 |
| `/api/assets/{id}` | DELETE | 删除资产 |

### 审核管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/reviews` | GET | 列出审核记录 |
| `/api/reviews` | POST | 提交审核 |
| `/api/reviews/pending` | GET | 待审核资产 |

### 项目配置

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/projects` | GET | 列出项目 |
| `/api/projects/{id}` | GET | 获取项目配置 |
| `/api/projects/{id}` | PUT | 更新项目配置 |

### 记忆系统

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/memory/rules` | GET | 获取规则 |
| `/api/memory/rules` | POST | 创建规则 |
| `/api/memory/stats` | GET | 记忆统计 |

### 用户认证

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录 |
| `/api/auth/users` | GET | 列出用户 |

### 用量统计

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/usage/log` | POST | 记录用量 |
| `/api/usage/stats/{user_id}` | GET | 用户统计 |
| `/api/usage/stats` | GET | 所有用户统计 |
| `/api/usage/check/{user_id}` | GET | 检查是否超限 |

## 七、用量限制

默认配置：

```python
LIMIT_5H = 1500  # 每 5 小时调用上限
```

修改 `api/usage.py` 中的 `LIMIT_5H` 值调整限制。

## 八、数据存储

```
data/
├── tagent.db     # SQLite 数据库
└── previews/     # 预览图目录（预留）
```

数据库自动创建，无需手动初始化。

## 九、防火墙配置

如果需要外部访问，确保开放端口：

```bash
# Linux (ufw)
sudo ufw allow 8081/tcp

# Linux (firewalld)
sudo firewall-cmd --add-port=8081/tcp --permanent
sudo firewall-cmd --reload

# Windows
# 控制面板 → 防火墙 → 入站规则 → 新建规则 → 端口 8081
```

## 十、常见问题

### 端口被占用

```
ERROR: [WinError 10013] 以一种访问权限不允许的方式做了一个访问套接字的尝试
```

解决：修改 `config.py` 中的 `SERVER_PORT` 为其他端口。

### 数据库锁定

```
sqlite3.OperationalError: database is locked
```

解决：确保只有一个服务器进程在运行。

### 外部无法访问

检查：
1. `SERVER_HOST` 是否为 `0.0.0.0`
2. 防火墙是否开放端口
3. 云服务器安全组是否配置

## 十一、管理页面

访问以下地址查看管理页面：

| 地址 | 说明 | 权限 |
|------|------|------|
| http://localhost:8081/admin/usage | 用量统计管理页面 | 管理员 |
| http://localhost:8081/admin/assets | 资产管理页面 | 管理员 |
| http://localhost:8081/admin/reviews | 审核管理页面 | 管理员 |
| http://localhost:8081/admin/users | 用户管理页面 | 超级管理员 |
| http://localhost:8081/admin/settings | 系统设置页面 | 超级管理员 |

### 用量统计页面

查看：
- 总用户数
- 今日调用次数
- 今日 Token 消耗
- 每个用户的调用统计和剩余配额

页面每 30 秒自动刷新。

### 资产管理页面

功能：
- 查看所有资产列表
- 按类型、状态筛选
- 按名称搜索
- 查看资产详情
- 删除资产

页面每 30 秒自动刷新。

### 审核管理页面

功能：
- 查看待审核资产列表
- 执行审核操作（通过/拒绝）
- 添加审核意见
- 按状态筛选

页面每 30 秒自动刷新。

### 用户管理页面

功能：
- 查看用户列表
- 添加管理员
- 移除管理员
- 按角色筛选

说明：
- 超级管理员由部署时配置文件指定
- 此页面管理的是普通管理员权限

页面每 30 秒自动刷新。

### 系统设置页面

功能：
- 查看服务器信息
- 查看服务器配置
- 查看 LLM 配置（预留）
- 查看用量限制
- 系统操作（清理数据、导出数据库、重启服务器）

说明：
- 此页面仅限超级管理员访问
- 修改配置后需要重启服务器生效

## 十二、后续扩展

- [ ] Docker 容器化部署
- [ ] PostgreSQL 数据库支持
- [ ] SSO 登录集成
- [ ] WebSocket 实时通知
