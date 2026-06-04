import json
import pytest
from backend.config import get_subagent_model, _get_runtime_app_config, CONFIGS_DIR


def _write_app_config(payload: dict, path: str) -> None:
    """Helper: 写一个 app-config.json 风格的 dict。"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


@pytest.fixture
def tmp_app_config(tmp_path, monkeypatch):
    """用 tmp_path 模拟 app-config.json"""
    cfg_path = tmp_path / "app-config.json"
    monkeypatch.setattr("backend.config.CONFIGS_DIR", str(tmp_path))
    return str(cfg_path)


def test_default_model_from_tier(tmp_app_config):
    """无覆盖时，按 tier 返回对应默认模型"""
    _write_app_config(
        {"active_model": "glm-5", "active_provider": "p1"},
        tmp_app_config,
    )
    assert get_subagent_model("explorer") == "glm-4-flash"  # tier=haiku
    assert get_subagent_model("researcher") == "glm-4-flash"
    assert get_subagent_model("code-reviewer") == "glm-5"  # tier=sonnet


def test_user_override_takes_precedence(tmp_app_config):
    _write_app_config(
        {
            "active_model": "glm-5",
            "active_provider": "p1",
            "subagent_model_overrides": {"explorer": "custom-model"},
        },
        tmp_app_config,
    )
    assert get_subagent_model("explorer") == "custom-model"
    assert get_subagent_model("code-reviewer") == "glm-5"  # 未覆盖仍走 tier


def test_unknown_subagent_falls_back_to_active(tmp_app_config):
    _write_app_config(
        {"active_model": "main-model", "active_provider": "p1"},
        tmp_app_config,
    )
    assert get_subagent_model("nonexistent") == "main-model"
