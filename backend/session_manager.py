"""
session_manager.py - 多会话管理器

存储方案：JSONL + 索引文件
- sessions/index.json    — 会话索引（元数据列表）
- sessions/{sessionId}.jsonl — 每会话一个文件，每行一条消息，append-only

设计参考 JSONL append-only 会话管理：
- append-only 写入（崩溃安全）
- 草稿机制（新会话不显示在列表中，发首条消息后才出现）
- 自动归档（超期未活跃的会话）
- 跨会话搜索
"""
import json
import uuid
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


from config import SESSIONS_DIR
from config import (
    WORKSPACES_DIR,
    DEFAULT_WORKSPACE_NAME,
    get_agent_runtime_mode,
    get_default_workspace_path,
)

# 存储根目录
_sessions_dir: str = ""
_index_lock = threading.Lock()  # 索引文件读写锁


def init(base_dir: str = ""):
    """
    初始化会话管理器。

    参数:
        base_dir: 存储根目录，默认使用 config.SESSIONS_DIR
    """
    global _sessions_dir
    if not base_dir:
        _sessions_dir = SESSIONS_DIR
    else:
        _sessions_dir = os.path.join(base_dir, "sessions")
    os.makedirs(_sessions_dir, exist_ok=True)


def _ensure_init():
    if not _sessions_dir:
        init()


# ===== 会话 CRUD =====

def _build_workspace_for_session(session_id: str, workspace_path: str = "") -> tuple[str, str]:
    """为会话生成/标准化工作区路径与显示名。未指定时使用共享默认工作区。"""
    raw = (workspace_path or "").strip()
    if raw:
        abs_path = os.path.abspath(raw)
        workspace_name = os.path.basename(abs_path.rstrip("\\/")) or session_id
    else:
        abs_path = get_default_workspace_path()
        workspace_name = DEFAULT_WORKSPACE_NAME
    os.makedirs(abs_path, exist_ok=True)
    return abs_path, workspace_name


def _ensure_general_workspace(meta: dict, agent_mode: str) -> dict:
    """通用模式会话保证有工作区路径（空则写入默认工作区）。"""
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    if _session_agent_mode(meta, mode) != "general":
        return meta
    if (meta.get("workspacePath") or "").strip():
        return meta
    ws_path, ws_name = _build_workspace_for_session(meta["sessionId"], "")
    updated = update_session(
        meta["sessionId"],
        agent_mode=mode,
        workspacePath=ws_path,
    )
    if updated:
        return updated
    meta["workspacePath"] = ws_path
    meta["workspaceName"] = ws_name
    return meta


def create_session(
    title: str = "新会话",
    workflow_mode: str = "step_by_step",
    user: str = "",
    workspace_path: str = "",
) -> dict:
    """
    创建新会话（草稿状态）。

    返回会话元数据 dict。
    """
    _ensure_init()
    session_id = uuid.uuid4().hex[:12]
    now = datetime.now().isoformat(timespec="seconds")
    mode = get_agent_runtime_mode()
    ws_path = ""
    ws_name = ""
    if mode == "general":
        ws_path, ws_name = _build_workspace_for_session(session_id, workspace_path)

    meta = {
        "sessionId": session_id,
        "agentMode": mode,
        "title": title,
        "createdAt": now,
        "lastActive": now,
        "messageCount": 0,
        "workflowMode": workflow_mode,
        "isDraft": True,
        "isPinned": False,
        "isArchived": False,
        "user": user,
        "tags": [],
        "summary": "",
        "workspacePath": ws_path,
        "workspaceName": ws_name,
    }

    # 创建空 JSONL 文件
    _msg_path(session_id).touch()

    # 更新索引
    with _index_lock:
        index = _read_index()
        index.insert(0, meta)
        _write_index(index)

    return meta


def _session_agent_mode(meta: dict, default_mode: str) -> str:
    """会话记录上的 agentMode；缺省时视为当前运行模式（兼容旧索引）。"""
    return (meta.get("agentMode") or default_mode).strip().lower()


def list_sessions(include_archived: bool = False, user: str = None, agent_mode: str = "") -> list:
    """
    获取会话列表（按 lastActive 降序，置顶优先）。

    参数:
        include_archived: 是否包含已归档会话
        user: 按用户过滤（None 表示不过滤，返回所有）
    """
    _ensure_init()
    with _index_lock:
        index = _read_index()

    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    index = [s for s in index if _session_agent_mode(s, mode) == mode]

    if not include_archived:
        index = [s for s in index if not s.get("isArchived")]

    # 按用户过滤
    if user:
        index = [s for s in index if s.get("user", "") == user]

    # 置顶优先，然后按 lastActive 降序
    pinned = sorted(
        [s for s in index if s.get("isPinned")],
        key=lambda s: s["lastActive"],
        reverse=True,
    )
    unpinned = sorted(
        [s for s in index if not s.get("isPinned")],
        key=lambda s: s["lastActive"],
        reverse=True,
    )
    return pinned + unpinned


def get_session(session_id: str, agent_mode: str = "") -> Optional[dict]:
    """获取单个会话元数据"""
    _ensure_init()
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    with _index_lock:
        for meta in _read_index():
            if meta["sessionId"] == session_id and _session_agent_mode(meta, mode) == mode:
                return _ensure_general_workspace(meta, mode)
    return None


def update_session(session_id: str, agent_mode: str = "", **kwargs) -> Optional[dict]:
    """
    更新会话元数据。

    可更新字段：title, workflowMode, isPinned, isArchived, tags, summary
    返回更新后的元数据，未找到返回 None。
    """
    _ensure_init()
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    allowed = {"title", "workflowMode", "isPinned", "isArchived", "tags", "summary", "workspacePath", "workspaceName"}

    with _index_lock:
        index = _read_index()
        for meta in index:
            if meta["sessionId"] == session_id and _session_agent_mode(meta, mode) == mode:
                for key, val in kwargs.items():
                    if key in allowed:
                        meta[key] = val
                if "workspacePath" in kwargs:
                    ws_path, ws_name = _build_workspace_for_session(
                        session_id,
                        str(kwargs.get("workspacePath") or ""),
                    )
                    meta["workspacePath"] = ws_path
                    meta["workspaceName"] = ws_name
                _write_index(index)
                return meta
    return None


def delete_session(session_id: str, agent_mode: str = "") -> bool:
    """
    删除会话（同时删除 JSONL 文件和索引记录）。

    返回是否成功。
    """
    _ensure_init()
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    with _index_lock:
        index = _read_index()
        new_index = [s for s in index if not (s["sessionId"] == session_id and _session_agent_mode(s, mode) == mode)]
        if len(new_index) == len(index):
            return False
        _write_index(new_index)

    # 删除 JSONL 文件
    path = _msg_path(session_id)
    if path.exists():
        path.unlink()

    return True


# ===== 消息操作 =====

def append_message(session_id: str, message: dict):
    """
    追加消息到会话（append-only）。

    自动添加 timestamp，自动更新索引（lastActive、messageCount）。
    非 JSON 工具结果超过 2000 字符时自动截断，避免会话文件过大。
    JSON 工具结果需要保留合法结构，供前端历史回放恢复可视化组件；
    对大结果工具会保存轻量展示摘要，而不是完整原始结果。

    消息格式:
        {"role": "user", "content": "..."}
        {"role": "assistant", "content": "...", "toolCalls": [...]}
        {"role": "tool", "toolCallId": "...", "name": "...", "content": "..."}
    """
    _ensure_init()
    msg = {**message}
    msg["timestamp"] = datetime.now().isoformat(timespec="seconds")

    # 截断过大的工具结果。结构化 JSON 截断后会失效，前端历史回放无法渲染专用组件。
    MAX_TEXT_TOOL_CONTENT = 2000
    MAX_JSON_TOOL_CONTENT = 8000
    if msg.get("role") == "tool" and msg.get("content"):
        content = msg["content"]
        try:
            parsed = json.loads(content)
            tool_name = msg.get("name", "")

            # analyze_assets 的完整结果可能很大；历史回放卡片只需要汇总字段。
            if tool_name == "analyze_assets" and isinstance(parsed, dict):
                compact = {
                    key: parsed[key]
                    for key in ("total_assets", "summary", "need_inference_confirm", "message")
                    if key in parsed
                }
                if "report_markdown" in parsed:
                    report = str(parsed.get("report_markdown") or "")
                    compact["report_markdown"] = report[:1200] + ("...[已截断]" if len(report) > 1200 else "")
                msg["content"] = json.dumps(compact, ensure_ascii=False)
                content = msg["content"]

            if len(content) > MAX_JSON_TOOL_CONTENT:
                msg["content"] = json.dumps({
                    "truncated": True,
                    "original_length": len(content),
                    "tool": tool_name,
                    "preview": content[:MAX_JSON_TOOL_CONTENT],
                }, ensure_ascii=False)
        except (TypeError, json.JSONDecodeError):
            if len(content) > MAX_TEXT_TOOL_CONTENT:
                msg["content"] = content[:MAX_TEXT_TOOL_CONTENT] + f"\n... [截断，原长 {len(content)} 字符]"

    # 截断 assistant 消息中的 toolCalls 参数
    if msg.get("role") == "assistant" and msg.get("toolCalls"):
        for tc in msg["toolCalls"]:
            if tc.get("function", {}).get("arguments"):
                args = tc["function"]["arguments"]
                if isinstance(args, str) and len(args) > 1000:
                    tc["function"]["arguments"] = args[:1000] + "...[截断]"

    path = _msg_path(session_id)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    _touch_session(session_id)


def get_messages(session_id: str, limit: int = 0) -> list:
    """
    获取会话消息列表。

    参数:
        limit: 最大返回条数，0 表示全部。
               正数时只返回最后 N 条（高效：跳过前面的内容）。
    """
    _ensure_init()
    path = _msg_path(session_id)
    if not path.exists():
        return []

    if limit <= 0:
        # 全量读取
        messages = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        return messages
    else:
        # 只读最后 N 条（从文件尾部反向扫描）
        return _read_tail(path, limit)


def search_messages(query: str, max_results: int = 30, agent_mode: str = "") -> list:
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    """
    跨会话搜索消息内容。

    返回匹配结果列表，每项包含 sessionId、sessionTitle、message。
    """
    _ensure_init()
    query_lower = query.lower()
    results = []

    with _index_lock:
        index = _read_index()

    for meta in index:
        if meta.get("agentMode") != mode:
            continue
        if meta.get("isArchived"):
            continue
        path = _msg_path(meta["sessionId"])
        if not path.exists():
            continue

        with open(path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if query_lower in line.lower():
                    try:
                        msg = json.loads(line.strip())
                    except json.JSONDecodeError:
                        continue
                    results.append({
                        "sessionId": meta["sessionId"],
                        "sessionTitle": meta["title"],
                        "lineNumber": i,
                        "message": msg,
                    })
                    if len(results) >= max_results:
                        return results

    return results


def get_message_count(session_id: str) -> int:
    """获取会话消息总数（高效：逐行计数，不解析 JSON）"""
    _ensure_init()
    path = _msg_path(session_id)
    if not path.exists():
        return 0
    count = 0
    with open(path, "r", encoding="utf-8") as f:
        for _ in f:
            count += 1
    return count


# ===== 批量操作 =====

def auto_archive(days_threshold: int = 7):
    """
    自动归档超过阈值天数的会话。

    置顶会话不受影响。
    """
    _ensure_init()
    cutoff = (datetime.now() - timedelta(days=days_threshold)).isoformat(timespec="seconds")

    with _index_lock:
        index = _read_index()
        changed = False
        for meta in index:
            if not meta.get("isPinned") and not meta.get("isArchived"):
                if meta["lastActive"] < cutoff:
                    meta["isArchived"] = True
                    changed = True
        if changed:
            _write_index(index)


def rebuild_index() -> int:
    """
    从 JSONL 文件重建索引（修复索引损坏的情况）。

    返回重建的会话数。
    """
    _ensure_init()
    new_index = []

    for filename in os.listdir(_sessions_dir):
        if not filename.endswith(".jsonl"):
            continue
        session_id = filename[:-6]  # 去掉 .jsonl
        path = _msg_path(session_id)

        # 读取首条和最后一条消息
        first_msg = None
        last_msg = None
        count = 0
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                count += 1
                try:
                    msg = json.loads(line)
                    if first_msg is None:
                        first_msg = msg
                    last_msg = msg
                except json.JSONDecodeError:
                    continue

        # 生成标题：首条用户消息的前 50 字符
        title = "新会话"
        if first_msg and first_msg.get("role") == "user":
            content = first_msg.get("content", "")
            title = content[:50] + ("..." if len(content) > 50 else "")

        now = datetime.now().isoformat(timespec="seconds")
        created = first_msg.get("timestamp", now) if first_msg else now
        last_active = last_msg.get("timestamp", now) if last_msg else now

        meta = {
            "sessionId": session_id,
            "agentMode": get_agent_runtime_mode(),
            "title": title,
            "createdAt": created,
            "lastActive": last_active,
            "messageCount": count,
            "workflowMode": "step_by_step",
            "isDraft": count == 0,
            "isPinned": False,
            "isArchived": False,
            "tags": [],
            "summary": "",
            "workspacePath": "",
            "workspaceName": "",
        }
        new_index.append(meta)

    # 排序
    new_index.sort(key=lambda s: s["lastActive"], reverse=True)

    with _index_lock:
        _write_index(new_index)

    return len(new_index)


def get_stats(agent_mode: str = "") -> dict:
    """获取会话统计"""
    _ensure_init()
    with _index_lock:
        index = _read_index()

    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    index = [s for s in index if _session_agent_mode(s, mode) == mode]

    total = len(index)
    active = sum(1 for s in index if not s.get("isArchived"))
    pinned = sum(1 for s in index if s.get("isPinned"))
    drafts = sum(1 for s in index if s.get("isDraft"))
    total_messages = sum(s.get("messageCount", 0) for s in index)

    return {
        "total_sessions": total,
        "active_sessions": active,
        "archived_sessions": total - active,
        "pinned_sessions": pinned,
        "draft_sessions": drafts,
        "total_messages": total_messages,
    }


# ===== 内部辅助函数 =====

def _msg_path(session_id: str) -> Path:
    """获取会话 JSONL 文件路径"""
    return Path(_sessions_dir) / f"{session_id}.jsonl"


def _read_index() -> list:
    """读取索引文件（调用者需持有 _index_lock）"""
    path = os.path.join(_sessions_dir, "index.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def _write_index(index: list):
    """写入索引文件（调用者需持有 _index_lock）"""
    path = os.path.join(_sessions_dir, "index.json")
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    # 原子替换
    if os.name == "nt":
        # Windows 不支持 atomic rename 覆盖已存在文件
        if os.path.exists(path):
            os.remove(path)
    os.rename(tmp_path, path)


def _touch_session(session_id: str):
    """
    更新会话的 lastActive 和 messageCount。
    如果是草稿且是首条消息，自动取消草稿并生成标题。
    """
    with _index_lock:
        index = _read_index()
        for meta in index:
            if meta["sessionId"] == session_id:
                meta["lastActive"] = datetime.now().isoformat(timespec="seconds")
                meta["messageCount"] = meta.get("messageCount", 0) + 1

                # 首条消息：取消草稿，生成标题
                if meta.get("isDraft"):
                    meta["isDraft"] = False
                    path = _msg_path(session_id)
                    if path.exists():
                        with open(path, "r", encoding="utf-8") as f:
                            first_line = f.readline().strip()
                        if first_line:
                            try:
                                first_msg = json.loads(first_line)
                                content = first_msg.get("content", "")
                                meta["title"] = content[:50] + ("..." if len(content) > 50 else "")
                            except json.JSONDecodeError:
                                pass
                break
        _write_index(index)


def _read_tail(path: Path, n: int) -> list:
    """
    高效读取文件最后 N 行（不加载整个文件）。

    从文件尾部反向扫描，找到第 N 个换行符的位置，然后只读取后面的内容。
    """
    file_size = path.stat().st_size
    if file_size == 0:
        return []

    # 小文件直接全量读取
    if file_size < 100_000:  # < 100KB
        messages = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        return messages[-n:] if len(messages) > n else messages

    # 大文件：从尾部反向扫描
    with open(path, "rb") as f:
        # 从尾部开始，每次读 8KB
        chunk_size = 8192
        pos = file_size
        newline_count = 0
        lines_data = b""

        while pos > 0 and newline_count <= n:
            read_size = min(chunk_size, pos)
            pos -= read_size
            f.seek(pos)
            chunk = f.read(read_size)
            lines_data = chunk + lines_data
            newline_count += chunk.count(b"\n")

    # 解析最后 n 行
    all_lines = lines_data.decode("utf-8", errors="replace").strip().split("\n")
    tail_lines = all_lines[-n:] if len(all_lines) > n else all_lines

    messages = []
    for line in tail_lines:
        line = line.strip()
        if line:
            try:
                messages.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return messages
