"""测试 LLM 配置读取"""
import sys
sys.path.insert(0, r"F:\ta_agent")

from config import _get_runtime_app_config, _get_runtime_llm_config, get_active_model, CONFIGS_DIR, RUNTIME_DIR

print(f"RUNTIME_DIR: {RUNTIME_DIR}")
print(f"CONFIGS_DIR: {CONFIGS_DIR}")

app_config = _get_runtime_app_config()
print(f"\napp_config: {app_config}")

print(f"\nactive_model: {get_active_model()}")

llm_config = _get_runtime_llm_config()
print(f"\nllm_config: {llm_config}")
