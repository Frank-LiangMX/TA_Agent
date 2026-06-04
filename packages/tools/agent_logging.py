"""SubAgent 运行日志。"""
import json
import os
import time
from typing import Literal


# 路径：同级 llm_calls.jsonl — 找 backend.config 里的 RUNTIME_DIR
def _resolve_log_path() -> str:
    try:
        from backend.config import RUNTIME_DIR
        return os.path.join(RUNTIME_DIR, "subagent_runs.jsonl")
    except Exception:
        return os.path.join(os.path.expanduser("~"), ".tagent", "subagent_runs.jsonl")


SUBAGENT_RUNS_LOG = _resolve_log_path()


def log_subagent_run(
    *,
    session_id: str,
    subagent_type: str,
    task_id: str,
    model: str,
    run_in_background: bool,
    status: Literal["completed", "error", "stopped"],
    total_steps: int,
    total_tokens_in: int,
    total_tokens_out: int,
    duration_ms: int,
    error: str | None = None,
) -> None:
    """追加一行 subagent_runs.jsonl。"""
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int((time.time()%1)*1000):03d}Z",
        "session_id": session_id,
        "subagent_type": subagent_type,
        "task_id": task_id,
        "model": model,
        "run_in_background": run_in_background,
        "status": status,
        "total_steps": total_steps,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "duration_ms": duration_ms,
        "error": error,
    }
    try:
        os.makedirs(os.path.dirname(SUBAGENT_RUNS_LOG), exist_ok=True)
        with open(SUBAGENT_RUNS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # 日志失败不影响主流程
        pass
