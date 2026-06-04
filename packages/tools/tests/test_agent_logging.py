import json
import os
import tempfile
from packages.tools.agent_logging import log_subagent_run, SUBAGENT_RUNS_LOG


def test_log_subagent_run_writes_jsonl(tmp_path, monkeypatch):
    log_path = tmp_path / "subagent_runs.jsonl"
    monkeypatch.setattr("packages.tools.agent_logging.SUBAGENT_RUNS_LOG", str(log_path))

    log_subagent_run(
        session_id="s1",
        subagent_type="explorer",
        task_id="t1",
        model="glm-4-flash",
        run_in_background=False,
        status="completed",
        total_steps=3,
        total_tokens_in=100,
        total_tokens_out=20,
        duration_ms=1234,
        error=None,
    )

    assert log_path.exists()
    content = log_path.read_text(encoding="utf-8").strip()
    record = json.loads(content)
    assert record["subagent_type"] == "explorer"
    assert record["status"] == "completed"
    assert record["duration_ms"] == 1234


def test_log_appends_multiple_records(tmp_path, monkeypatch):
    log_path = tmp_path / "subagent_runs.jsonl"
    monkeypatch.setattr("packages.tools.agent_logging.SUBAGENT_RUNS_LOG", str(log_path))

    for i in range(3):
        log_subagent_run(
            session_id="s1", subagent_type="explorer", task_id=f"t{i}",
            model="m", run_in_background=False, status="completed",
            total_steps=1, total_tokens_in=0, total_tokens_out=0, duration_ms=0,
        )

    lines = log_path.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 3
    for line in lines:
        json.loads(line)  # 都能解析
