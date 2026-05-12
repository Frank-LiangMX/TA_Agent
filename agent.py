"""
游戏 TA Agent - 主程序
单 Agent + 多工具架构，使用 OpenAI 兼容 API
"""
import json
import re
import sys
import io
import os
import time

from openai import OpenAI
from config import get_llm_config
from tools import TOOLS, execute_tool
from conventions.context import get_conventions_context, set_conventions_context

# 导入记忆模块
from tools.memory import FileMemoryProvider, NullMemoryProvider
from tools.memory_tools import set_memory_provider


# ========== System Prompt ==========

BASE_SYSTEM_PROMPT = """你是一个游戏技术美术（TA）AI 助手，专门负责游戏资产的质检、分类和管理。

## 你的能力
1. **项目配置管理**：检测、创建、加载项目配置（命名规则、资产类型、导入预设等）
2. **规范文档发现**：扫描项目目录，自动发现命名规范、制作标准等文档
3. **规范文档加载**：加载项目规范文档，将项目实际规范注入工作上下文
4. **命名规范检查**：检查资产文件是否符合项目命名规范
5. **目录结构检查**：检查资产是否放在正确的目录下
6. **面数预算检查**：检查模型面数是否在预算范围内
7. **FBX 深度解析**：读取 3D 模型的真实顶点数、面数、骨骼、UV、包围盒等几何数据
8. **贴图深度检查**：读取贴图的真实分辨率、格式、通道数、Alpha、色彩空间等信息
9. **贴图批量质检**：批量扫描目录下所有贴图，检查分辨率是否超标、是否是 2 的幂次
10. **资产身份分析**：为资产生成结构化身份证（几何/贴图/命名/关联）
11. **AI 智能推断**：自动推断资产分类、材质结构、视觉风格、状态等（需启用 enable_ai_inference）
12. **资产语义搜索**：按标签条件搜索已入库资产
13. **报告生成**：生成质检报告
14. **项目记忆**：记录用户纠正，学习项目经验，越用越准
15. **人工审核**：支持分级审核，高置信度批量通过，低置信度逐个确认
16. **资产重命名**：根据项目配置的命名规则，生成规范名称并重命名文件
17. **目录管理**：创建目录结构，移动文件到目标位置
18. **资产入库**：审核通过后自动完成入库全流程（重命名+移动+生成UE5导入清单）
19. **批量入库**：一键入库所有已审核通过的资产，生成导入脚本

## 项目配置（重要）
- 使用 **check_project_config** 检查项目是否有配置文件
- 如果没有配置文件，提示用户并询问是否创建
- 使用 **create_project_config** 创建示例配置，创建后告诉用户如何填写
- 使用 **load_project_config** 加载配置，后续检查基于配置执行

## 完整工作流程（重要）
当用户要求分析或检查一个目录中的资产时，按以下流程执行：

### 阶段一：分析
1. 调用 **check_project_config** 检查是否有项目配置
   - 如果没有配置，提示用户："未找到项目配置文件，是否创建？"
   - 用户同意后，调用 **create_project_config** 创建配置
2. 调用 **load_project_config** 加载项目配置
3. 调用 **discover_conventions** 扫描该目录，发现项目规范文档
4. 展示候选文档给用户确认，然后调用 **load_conventions** 加载规范
5. 调用 **analyze_assets** 分析资产（设置 enable_ai_inference=true 启用 AI 推断）

### 阶段二：审核
6. 调用 **get_pending_reviews** 获取待审核列表
7. 高置信度资产（≥90%）可调用 **batch_approve** 批量通过
8. 低置信度资产调用 **get_review_detail** 查看详情，然后调用 **submit_review** 提交审核结果
9. 如果用户纠正了分析结果，调用 **record_correction** 记录纠正

### 阶段三：入库
10. 调用 **intake_approved** 一键入库所有已审核通过的资产
    - 需要用户提供 UE5 Content 目录路径（target_engine_dir）
    - 支持 dry_run=true 先预览入库结果
11. 入库完成后，告知用户：
    - 导入清单路径（import_manifest.json）
    - 导入脚本路径（import_assets.py）
    - 提示用户在 UE5 Python Console 中运行导入脚本完成最终导入

### 单资产入库
如果用户只需要入库单个资产（而非批量），可以：
1. 调用 **intake_asset** 入库单个资产（需要 asset_id 和 target_engine_dir）

## 重要：审核流程独立，不需要重新分析
- **审核和分析是两个独立操作**
- 用户查看待审核列表、审核资产时，**不要调用 analyze_assets**
- 只有用户明确要求"重新分析"或"分析某个目录"时才调用 analyze_assets
- 审核操作包括：查看待审核列表、查看详情、通过、驳回、修改
- 审核完成后直接汇报结果即可，不需要再走分析流程

## 入库说明
- 入库前必须确保资产状态为 approved（已审核通过）
- 入库操作会：重命名文件、移动到引擎目录、更新数据库状态为 imported
- 入库后会生成两个文件供 UE5 使用：
  - import_manifest.json：导入配置（资产路径、导入参数、元数据）
  - import_assets.py：UE5 导入脚本（在 UE5 Python Console 中运行）
- 入库操作支持 dry_run=true 模式，可以先预览再执行

## 审核工作流
- **分级审核**：AI 推断结果带置信度，高置信度可批量通过，低置信度需人工确认
- **审核操作**：approve（通过）、reject（驳回）、modify（修改后通过）
- **自动学习**：用户修改推断结果时，系统会自动记录纠正用于改进

## 记忆系统
- 当用户指出分析错误时，调用 **record_correction** 记录纠正
- 系统会自动学习用户纠正，后续分析会参考历史经验
- 调用 **get_memory_stats** 查看当前记忆状态
- 调用 **update_project_profile** 更新项目画像（风格、命名约定等）

## 默认规范（当项目没有自定义规范时使用）
- 文件名格式：前缀_PascalCase描述_编号（如 SM_WoodenTable_01）
- 前缀含义：SM=静态网格体, SK=骨骼网格体, M=材质, MI=材质实例, T=贴图, BP=蓝图
- 面数预算：角色<30K, 武器<10K, 道具<5K, 建筑<20K, 自然<8K
- 贴图规范：最大 2048x2048，必须是 2 的幂次，推荐正方形

## 输出风格
- 简洁专业，使用 TA 术语
- 问题用 ❌ 标记，通过用 ✅ 标记，警告用 ⚠️ 标记
- 给出具体的修复建议，而不是笼统的"需要优化"
"""


def build_system_prompt() -> str:
    """构建完整的系统提示（基础 + 已加载的规范文档）"""
    prompt = BASE_SYSTEM_PROMPT

    conventions = get_conventions_context()
    if conventions:
        prompt += f"""

## 项目规范文档（已加载）
以下是当前项目加载的规范文档内容，在执行所有检查时必须优先参考这些规范：

{conventions}

---
注意：以上项目规范优先级高于默认规范。当项目规范与默认规范冲突时，以项目规范为准。
"""

    return prompt


def create_client():
    """创建 LLM 客户端"""
    config = get_llm_config()
    return OpenAI(
        base_url=config["base_url"],
        api_key=config["api_key"],
        timeout=120.0,  # 2 分钟超时，防止 API 无响应卡死
    ), config["model"]


def agent_loop(user_message: str, history: list = None):
    """
    Agent 主循环
    接收用户消息，调用 LLM，处理工具调用，返回最终结果
    """
    client, model = create_client()

    if history is None:
        history = []

    # 构建消息列表
    messages = [{"role": "system", "content": build_system_prompt()}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    print(f"\n{'='*60}")
    print(f"用户: {user_message}")
    print(f"{'='*60}")

    # Agent 循环：LLM 可能需要多次调用工具
    max_iterations = 10  # 防止无限循环
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n--- Agent 思考中... (第 {iteration} 轮) ---")
        sys.stdout.flush()

        # 调用 LLM
        try:
            llm_start = time.time()
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",  # 让 LLM 自动决定是否调用工具
                temperature=0.1,     # 低温度，保证稳定性
            )
            llm_elapsed = time.time() - llm_start
            if llm_elapsed >= 60:
                m = int(llm_elapsed) // 60
                s = llm_elapsed - m * 60
                print(f"  (LLM 思考耗时: {m}m {s:.1f}s)")
            else:
                print(f"  (LLM 思考耗时: {llm_elapsed:.1f}s)")
            sys.stdout.flush()
        except Exception as e:
            print(f"\n❌ LLM API 调用失败: {e}")
            sys.stdout.flush()
            return f"LLM API 调用失败: {e}", history

        message = response.choices[0].message

        # 情况1：LLM 直接回复（不需要调用工具）
        if message.tool_calls is None:
            final_answer = message.content or "(LLM 返回了空回复)"
            print(f"\n🤖 Agent 回复:\n{final_answer}")
            sys.stdout.flush()

            # 更新历史
            history.append({"role": "user", "content": user_message})
            history.append({"role": "assistant", "content": final_answer})

            return final_answer, history

        # 情况2：LLM 要调用工具
        print(f"\n🔧 Agent 需要调用工具:")
        sys.stdout.flush()
        tool_calls = message.tool_calls

        # 把 LLM 的回复（包含 tool_calls）加入消息
        messages.append(message)

        # 逐个执行工具
        for tool_call in tool_calls:
            func_name = tool_call.function.name

            # 解析工具参数，处理 JSON 解析失败的情况
            try:
                func_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError as e:
                # 尝试修复 Windows 路径反斜杠未转义的问题
                raw_args = tool_call.function.arguments
                print(f"  ⚠️ JSON 解析失败，尝试修复路径转义...")
                sys.stdout.flush()
                try:
                    # 将单个反斜杠替换为双反斜杠（但不改已转义的）
                    fixed = re.sub(r'\\(?!["\\/bfnrt])', r'\\\\', raw_args)
                    func_args = json.loads(fixed)
                    print(f"  ✓ 路径修复成功")
                except json.JSONDecodeError:
                    print(f"  ❌ 无法解析工具参数: {raw_args[:200]}")
                    sys.stdout.flush()
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps({"error": f"参数解析失败: {e}", "raw": raw_args[:500]}, ensure_ascii=False),
                    })
                    continue

            print(f"  → {func_name}({json.dumps(func_args, ensure_ascii=False)})")
            print(f"  ⏳ 执行中...")
            sys.stdout.flush()

            # 执行工具
            tool_start = time.time()
            result = execute_tool(func_name, func_args)
            tool_elapsed = time.time() - tool_start
            print(f"  ← 结果: {result[:200]}{'...' if len(result) > 200 else ''}")
            if tool_elapsed >= 60:
                m = int(tool_elapsed) // 60
                s = tool_elapsed - m * 60
                print(f"  (工具耗时: {m}m {s:.1f}s)")
            else:
                print(f"  (工具耗时: {tool_elapsed:.1f}s)")
            sys.stdout.flush()

            # 拦截 load_conventions：将规范内容注入上下文
            if func_name == "load_conventions":
                try:
                    conv_result = json.loads(result)
                    if conv_result.get("combined_context"):
                        set_conventions_context(conv_result["combined_context"])
                        # 更新系统提示，让后续 LLM 调用能看到新规范
                        messages[0] = {"role": "system", "content": build_system_prompt()}
                        print(f"  ✓ 已加载 {conv_result.get('loaded', 0)} 份规范文档到上下文")
                except (json.JSONDecodeError, KeyError):
                    pass

            # 把工具结果加入消息
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    # 如果循环次数用完
    final_answer = "抱歉，处理过程中遇到了问题，请尝试简化您的请求。"
    print(f"\n⚠️ 达到最大迭代次数")
    return final_answer, history


def _print_status():
    """启动时打印系统状态"""
    from config import (
        ACTIVE_LLM, get_llm_config, BLENDER_PATH,
        USE_VISION, FBX_PARSE_TIMEOUT, RENDER_TIMEOUT,
        MESH_BUDGETS, TEXTURE_BUDGETS,
    )
    from core.project_config import find_project_config, list_project_configs

    llm_config = get_llm_config()

    # LLM 状态
    llm_name = {"glm": "GLM-5", "deepseek": "DeepSeek-V4-pro"}.get(ACTIVE_LLM, ACTIVE_LLM)
    print(f"\n  LLM:     {llm_name} ({llm_config['model']})")
    print(f"  API:     {llm_config['base_url']}")

    # Blender 状态
    blender_ok = os.path.isfile(BLENDER_PATH)
    print(f"  Blender: {'OK ' + BLENDER_PATH if blender_ok else 'NOT FOUND (' + BLENDER_PATH + ')'}")

    # 项目配置状态
    configs = list_project_configs()
    if configs:
        # 默认加载第一个配置
        current_config = configs[0]
        print(f"  配置:    {current_config['name']} ({current_config['project_name']})")
        if len(configs) > 1:
            other_names = [c['name'] for c in configs[1:]]
            print(f"           其他配置: {', '.join(other_names)}")
    else:
        print(f"  配置:    未创建（使用默认规范）")

    # 数据库状态
    store_dir = os.path.join(os.path.dirname(__file__), "tag_store")
    db_path = os.path.join(store_dir, "tags.db")
    db_exists = os.path.isfile(db_path)
    if db_exists:
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            total = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
            with_cat = conn.execute("SELECT COUNT(*) FROM assets WHERE category != ''").fetchone()[0]
            conn.close()
            print(f"  数据库:  {db_path}")
            print(f"           {total} 条资产, {with_cat} 条已分类")
        except Exception:
            print(f"  数据库:  {db_path} (读取失败)")
    else:
        print(f"  数据库:  {db_path} (尚未创建)")

    # 可配置参数
    print(f"\n  --- 配置参数 ---")
    print(f"  视觉分析: {'ON' if USE_VISION else 'OFF'}")
    print(f"  FBX 超时: {FBX_PARSE_TIMEOUT}s")
    print(f"  渲染超时: {RENDER_TIMEOUT}s")
    print(f"  面数预算: 角色<{MESH_BUDGETS['character']:,}  武器<{MESH_BUDGETS['weapon']:,}  "
          f"道具<{MESH_BUDGETS['prop']:,}  建筑<{MESH_BUDGETS['building']:,}")
    print(f"  贴图预算: 角色<={TEXTURE_BUDGETS['character']['diffuse']}  "
          f"武器<={TEXTURE_BUDGETS['weapon']['diffuse']}  "
          f"道具<={TEXTURE_BUDGETS['prop']['diffuse']}")


def main():
    """交互式命令行入口"""
    # Windows 终端 UTF-8 支持
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

    print("=" * 60)
    print("   游戏 TA Agent v0.3")
    print("   单 Agent + 多工具架构")
    print("=" * 60)

    # 系统状态
    _print_status()

    # 初始化记忆系统
    # 默认使用当前目录作为项目根目录，记忆存储在 .ta_agent/memory/
    project_root = os.getcwd()
    memory_dir = os.path.join(project_root, ".ta_agent", "memory")

    try:
        memory_provider = FileMemoryProvider(project_root)
        set_memory_provider(memory_provider)
        stats = memory_provider.get_memory_stats()
        print(f"\n  记忆系统: OK")
        print(f"  存储位置: {memory_dir}")
        print(f"  项目画像: {'已设置' if memory_provider.get_project_profile() else '未设置'}")
        print(f"  规则数量: {stats['rule_count']}")
        print(f"  纠正记录: {stats['correction_count']}")
    except Exception as e:
        print(f"\n  记忆系统: FAIL ({e})")
        print("  将使用空记忆（不记录纠正）")
        set_memory_provider(NullMemoryProvider())

    print(f"\n{'='*60}")
    print("输入消息与 Agent 对话，输入 'quit' 退出\n")

    history = []

    while True:
        try:
            user_input = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not user_input:
            continue
        if user_input.lower() in ('quit', 'exit', 'q'):
            print("再见！")
            break

        try:
            answer, history = agent_loop(user_input, history)
        except Exception as e:
            print(f"\n❌ 错误: {e}")
            print("请检查 API 配置是否正确（config.py）")


if __name__ == "__main__":
    main()
