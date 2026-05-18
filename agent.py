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

from rich.console import Console
from rich.markdown import Markdown
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TaskProgressColumn, TimeElapsedColumn
from rich.panel import Panel
from rich.table import Table
from rich.live import Live

from prompt_toolkit import PromptSession
from prompt_toolkit.history import InMemoryHistory
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.key_binding import KeyBindings

# 动态命令补全
class _AgentCompleter(Completer):
    def get_completions(self, document, complete_event):
        text = document.text_before_cursor.lower()

        # 一级命令
        commands = [
            ("/mode ", "切换工作流模式"),
            ("/mode step_by_step", "切换到逐步模式"),
            ("/mode auto", "切换到自动模式"),
            ("/status", "查看当前状态"),
            ("/plugins", "查看插件列表"),
            ("/install ", "安装插件"),
            ("/uninstall ", "卸载插件"),
            ("/sessions", "查看会话列表"),
            ("/new", "创建新会话"),
            ("/switch ", "切换会话"),
            ("/delete ", "删除会话"),
            ("/help", "显示帮助"),
            ("quit", "退出"),
        ]

        # 如果输入 /install 后面跟了部分名称，补全可安装的插件
        if text.startswith("/install "):
            partial = text[len("/install "):]
            for name in self._available_plugins():
                if name.lower().startswith(partial):
                    yield Completion(name, start_position=-len(partial), display_meta="可安装")
            return

        # 如果输入 /uninstall 后面跟了部分名称，补全已安装的插件
        if text.startswith("/uninstall "):
            partial = text[len("/uninstall "):]
            for name in self._enabled_plugins():
                if name.lower().startswith(partial):
                    yield Completion(name, start_position=-len(partial), display_meta="已安装")
            return

        # 如果输入 /mode 后面，补全模式
        if text.startswith("/mode "):
            partial = text[len("/mode "):]
            for mode in ["step_by_step", "auto"]:
                if mode.startswith(partial):
                    yield Completion(mode, start_position=-len(partial))
            return

        # 一级命令补全
        for cmd, desc in commands:
            if cmd.lower().startswith(text) or text == "":
                yield Completion(cmd, start_position=-len(document.text_before_cursor), display_meta=desc)

    def _available_plugins(self):
        """可安装的插件（在 plugins_available 但不在 plugins 中）"""
        plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins")
        available_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins_available")
        enabled = set(os.listdir(plugins_dir)) if os.path.isdir(plugins_dir) else set()
        available = set(os.listdir(available_dir)) if os.path.isdir(available_dir) else set()
        return sorted(
            f[:-3] for f in (available - enabled)
            if f.endswith(".py") and not f.startswith("_")
        )

    def _enabled_plugins(self):
        """已安装的插件"""
        plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins")
        if not os.path.isdir(plugins_dir):
            return []
        return sorted(
            f[:-3] for f in os.listdir(plugins_dir)
            if f.endswith(".py") and not f.startswith("_") and f != "count_assets.py"
        )

# 全局 console 实例（延迟初始化，确保 UTF-8 设置后创建）
_console = None

def _get_console():
    global _console
    if _console is None:
        _console = Console()
    return _console

from openai import OpenAI
from config import get_llm_config
from tools import TOOLS, execute_tool
from conventions.context import get_conventions_context, set_conventions_context

# 导入记忆模块
from tools.memory import FileMemoryProvider, NullMemoryProvider
from tools.memory_tools import set_memory_provider

# 导入会话管理模块
import session_manager


def _truncate_tool_result(result: str, max_chars: int = 2000) -> str:
    """
    截断过大的工具结果，避免上下文窗口溢出。

    策略：
    - 超过 max_chars 时截断，保留前半部分 + 截断提示
    - JSON 格式尽量保留结构完整性
    - Markdown 格式保留摘要部分，截掉详情
    """
    if len(result) <= max_chars:
        return result

    # 尝试作为 JSON 处理
    try:
        data = json.loads(result)
        # JSON 结果：保留关键字段，去掉大字段
        truncated = {}
        for key, value in data.items():
            val_str = json.dumps(value, ensure_ascii=False)
            if len(val_str) > 1000:
                # 大字段截断
                if isinstance(value, str):
                    truncated[key] = value[:500] + f"\n... [截断，原长 {len(value)} 字符]"
                elif isinstance(value, list):
                    truncated[key] = value[:5] + [f"... 共 {len(value)} 项，已截断"]
                elif isinstance(value, dict):
                    truncated[key] = {k: v for k, v in list(value.items())[:5]}
                    truncated[key]["_truncated"] = f"共 {len(value)} 个字段，已截断"
                else:
                    truncated[key] = val_str[:500] + "... [截断]"
            else:
                truncated[key] = value
        return json.dumps(truncated, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError):
        pass

    # 非 JSON（如 Markdown 报告）：保留前面部分
    return result[:max_chars] + f"\n\n... [结果已截断，原长 {len(result)} 字符]"


# ========== 分析进度面板 ==========

# 阶段配置：显示名、emoji
_PHASE_CONFIG = {
    "scan":      ("扫描目录", ""),
    "textures":  ("分析贴图", ""),
    "assets":    ("分析 FBX", ""),
    "inference": ("AI 推断", ""),
    "done":      ("完成", ""),
}

# 阶段顺序
_PHASE_ORDER = ["scan", "textures", "assets", "inference", "done"]


def _create_analysis_progress():
    """
    创建资产分析的 rich 进度面板。

    返回 (progress, callback) 元组：
    - progress: rich.progress.Progress 实例（with 上下文管理器）
    - callback: 传给 analyze_assets 的进度回调函数

    用法：
        progress, callback = _create_analysis_progress()
        with progress:
            set_progress_callback(callback)
            result = execute_tool("analyze_assets", args)
            clear_progress_callback()
    """
    progress = Progress(
        TextColumn("  {task.description}"),
        BarColumn(bar_width=30),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=Console(),
        transient=False,  # 完成后保留显示
    )

    # 阶段状态跟踪
    phase_tasks = {}  # phase -> task_id
    phase_status = {}  # phase -> "pending" | "running" | "done"
    current_phase = None

    def _ensure_task(phase):
        """确保阶段的 task 已创建"""
        if phase in phase_tasks:
            return
        name, _ = _PHASE_CONFIG.get(phase, (phase, ""))
        task_id = progress.add_task(name, total=None, visible=True)
        phase_tasks[phase] = task_id
        phase_status[phase] = "pending"

    def _callback(phase, current, total, detail, elapsed=0):
        nonlocal current_phase

        # "done" 阶段：标记所有完成
        if phase == "done":
            for p, tid in phase_tasks.items():
                if phase_status.get(p) != "done":
                    t = progress.tasks[tid]
                    progress.update(tid, completed=t.total or 1, total=t.total or 1)
                    phase_status[p] = "done"
            return

        # 确保 task 存在
        _ensure_task(phase)

        # 标记之前的阶段为完成
        if phase != current_phase:
            for p in _PHASE_ORDER:
                if p == phase:
                    break
                if phase_status.get(p) == "running":
                    tid = phase_tasks[p]
                    t = progress.tasks[tid]
                    progress.update(tid, completed=t.total or 1)
                    phase_status[p] = "done"
            current_phase = phase
            phase_status[phase] = "running"

        # 更新当前阶段进度
        tid = phase_tasks[phase]
        if total and total > 0:
            progress.update(tid, completed=current, total=total)

        # 更新描述（加上当前文件名）
        name, _ = _PHASE_CONFIG.get(phase, (phase, ""))
        if detail:
            short_name = os.path.basename(detail) if len(detail) > 30 else detail
            progress.update(tid, description=f"{name}  {current}/{total}  {short_name}")
        else:
            progress.update(tid, description=f"{name}  {current}/{total}")

    # 预创建所有阶段 task（保证显示顺序）
    for phase in _PHASE_ORDER:
        _ensure_task(phase)
    # 扫描阶段瞬时完成（无回调）
    scan_tid = phase_tasks["scan"]
    progress.update(scan_tid, completed=1, total=1, description="扫描目录  ✓")
    phase_status["scan"] = "done"

    return progress, _callback


# ========== System Prompt ==========

# 工作流模式
#   "step_by_step" - 逐步模式：每完成一个阶段，建议用户进入下一阶段（适合新用户）
#   "auto"         - 自动模式：分析后自动走完整个流程（适合熟悉 Agent 的用户）
WORKFLOW_MODE = "step_by_step"

MODE_INSTRUCTIONS = {
    "step_by_step": """
## 工作流模式：逐步模式
当前为逐步模式，每完成一个阶段后，你需要：
1. 汇报本阶段的结果
2. 询问用户是否进入下一阶段
3. 等待用户确认后再继续

### 阶段一完成后：
"分析完成，共发现 X 个资产。是否进入审核阶段？"

### 阶段二完成后：
"审核完成，X 个资产已通过，Y 个待确认。是否进入入库阶段？如果入库，请提供 UE5 Content 目录路径。"

### 阶段三完成后：
"入库完成。导入清单和脚本已生成，请在 UE5 Python Console 中运行脚本完成最终导入。"

**注意：不要自动跳到下一阶段，必须等用户确认。**
""",

    "auto": """
## 工作流模式：自动模式
当前为自动模式，分析完成后自动执行后续阶段：

### 完整流程（自动串联）：
1. 分析资产（analyze_assets）
2. 获取待审核列表（get_pending_reviews）
3. 高置信度资产自动批量通过（batch_approve）
4. 如果有低置信度资产：列出并询问用户是否通过，等待确认后继续
5. 如果全部高置信度：自动调用 intake_approved 入库
6. 入库前需要用户提供 UE5 Content 目录路径（如果对话中还没提供）

### 入库路径：
- 如果用户在请求时已提供目标路径，直接使用
- 如果未提供，在入库前询问一次

### 低置信度处理：
- 列出低置信度资产详情
- 询问用户："以下 X 个资产置信度较低，是否全部通过？还是逐个确认？"
- 用户确认后继续入库

**注意：高置信度资产自动通过，低置信度资产必须等用户确认。**
""",
}

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
- 如果没有配置文件，**必须先询问用户**："未找到项目配置文件，是否创建？"，**等用户明确同意后**才能调用 create_project_config
- **禁止**在用户未确认的情况下自动调用 create_project_config
- 使用 **create_project_config** 创建示例配置，创建后告诉用户如何填写
- 使用 **load_project_config** 加载配置，后续检查基于配置执行

## 路径解析（重要）
用户可能会用中文描述路径（如"桌面"、"文档"、"下载"），你需要根据当前系统用户信息解析为实际路径。

{system_context}

### 常见中文路径映射：
- "桌面" → {user_home}/Desktop
- "文档" → {user_home}/Documents
- "下载" → {user_home}/Downloads
- "图片" → {user_home}/Pictures
- "视频" → {user_home}/Videos
- "音乐" → {user_home}/Music

### 注意事项：
- 不要假设用户名是 Administrator，使用上面提供的实际用户主目录
- 如果用户给的路径不存在，提示用户确认，不要猜测

## 完整工作流程（重要）
当用户要求分析或检查一个目录中的资产时，按以下流程执行：

### 阶段一：分析
1. 调用 **check_project_config** 检查是否有项目配置
   - 如果没有配置，**必须停下来**提示用户："未找到项目配置文件，是否创建？"
   - **等用户明确回答"是"或"好"后**，才能调用 **create_project_config** 创建配置
   - **绝对禁止**跳过询问直接创建配置
   - 用户同意后，调用 **create_project_config** 创建配置
2. 调用 **load_project_config** 加载项目配置
3. 调用 **discover_conventions** 扫描该目录，发现项目规范文档
4. 展示候选文档给用户确认，然后调用 **load_conventions** 加载规范
5. 调用 **analyze_assets** 分析资产（设置 enable_ai_inference=true 启用 AI 推断）
   - **重要：不要在 analyze_assets 之前调用 scan_directory！** analyze_assets 内部已包含目录扫描，重复调用浪费迭代次数和上下文。
   - **重要：不要在 analyze_assets 之前调用 check_fbx_info！** analyze_assets 会自动调用 Blender 解析所有 FBX。
   - 如果返回 `need_inference_confirm: true`，说明资产数较多，**必须先汇报基础分析结果，询问用户是否继续 AI 推断**
   - 用户确认后，调用 **run_ai_inference** 执行 AI 推断
   - 资产数较少时（< 50），analyze_assets 会自动完成推断，无需额外确认

### 阶段二：审核
6. 调用 **get_pending_reviews** 获取待审核列表
7. 高置信度资产（≥90%）可调用 **batch_approve** 批量通过
8. 低置信度资产调用 **get_review_detail** 查看详情，然后调用 **submit_review** 提交审核结果
9. 如果用户纠正了分析结果，调用 **record_correction** 记录纠正

### 阶段三：入库
10. 调用 **intake_approved** 一键入库所有已审核通过的资产
    - 需要用户提供 UE5 Content 目录路径（target_engine_dir）
    - 支持 dry_run=true 先预览入库结果
11. 入库完成后，**优先使用 UE5 HTTP Server 直接导入**：
    - 先调用 **ue5_health_check** 检查 UE5 Server 是否在线
    - 如果在线：对每个资产调用 **ue5_import_asset** 直接导入到 UE5
    - 如果不在线：告知用户导入脚本路径（import_assets.py），提示在 UE5 Python Console 中运行
12. **不要生成脚本让用户手动执行**，除非 UE5 Server 不可用

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

## 工具失败处理
当工具调用返回错误时：
1. 分析错误原因（API 不兼容、参数错误、环境问题等）
2. **插件工具**（tools/plugins/ 下的文件）：可以直接修改代码，修复后询问用户是否保存
3. **核心工具**（tools/ 下的其他文件）：**不要直接修改**，只报告问题和修复建议，等用户确认后再改
4. 如果是外部环境问题（如 UE5 API 版本变化），建议修改对应的桥接工具或生成新的适配代码
5. 修复完成后，询问用户是否将修复后的工具保存到插件目录（tools/plugins/）
6. 不要只是报错然后放弃，要有主动解决问题的能力

## 输出风格
- 简洁专业，使用 TA 术语
- 问题用 ❌ 标记，通过用 ✅ 标记，警告用 ⚠️ 标记
- 给出具体的修复建议，而不是笼统的"需要优化"
"""


def _get_system_context() -> tuple[str, str]:
    """获取系统上下文信息，返回 (system_context, user_home)"""
    user_home = os.path.expanduser("~")
    username = os.path.basename(user_home)

    # 检测常见桌面路径
    desktop_path = os.path.join(user_home, "Desktop")
    if not os.path.isdir(desktop_path):
        # Windows 中文系统可能用"桌面"而非"Desktop"
        desktop_cn = os.path.join(user_home, "桌面")
        if os.path.isdir(desktop_cn):
            desktop_path = desktop_cn

    system_context = f"""### 当前系统信息：
- 操作系统：{sys.platform}
- 用户名：{username}
- 用户主目录：{user_home}
- 桌面路径：{desktop_path}"""

    return system_context, user_home


def build_system_prompt(workflow_mode: str = None) -> str:
    """构建完整的系统提示（基础 + 工作流模式 + 已加载的规范文档）"""
    mode = workflow_mode or WORKFLOW_MODE
    system_context, user_home = _get_system_context()

    # 注入系统上下文到基础提示
    prompt = BASE_SYSTEM_PROMPT.format(
        system_context=system_context,
        user_home=user_home,
    )

    # 注入工作流模式指令
    mode_instruction = MODE_INSTRUCTIONS.get(mode, "")
    if mode_instruction:
        prompt += mode_instruction

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


def _compress_history(history: list, keep_recent: int = 12) -> list:
    """
    智能压缩对话历史，避免请求体过大同时保留关键上下文。

    策略：
    - 保留前 2 条（初始上下文）
    - 保留最近 keep_recent 条（近期上下文）
    - 中间部分只保留 user 消息和非工具调用的 assistant 消息（关键决策）
    - tool 消息和工具调用中间过程丢弃
    - 对保留的消息中的大内容也做截断
    """
    if len(history) <= keep_recent + 4:
        return history

    # 前 2 条（初始上下文）
    head = history[:2]

    # 中间部分：只保留 user 消息和 assistant 的最终回复（非工具调用）
    middle_raw = history[2:-keep_recent]
    middle = []
    for msg in middle_raw:
        if msg.get("role") == "user":
            middle.append(msg)
        elif msg.get("role") == "assistant" and msg.get("content") and not msg.get("tool_calls"):
            # 只保留有内容且不是工具调用的 assistant 消息
            # 截断过长的回复
            content = msg["content"]
            if len(content) > 2000:
                msg = {**msg, "content": content[:2000] + "\n... [历史消息已截断]"}
            middle.append(msg)

    # 最近的消息：也截断过大的 tool 结果
    tail = []
    for msg in history[-keep_recent:]:
        if msg.get("role") == "tool" and msg.get("content") and len(msg["content"]) > 2000:
            msg = {**msg, "content": _truncate_tool_result(msg["content"])}
        tail.append(msg)

    compressed = head + middle + tail

    # 如果压缩后还是太长，进一步丢弃中间部分
    if len(compressed) > 30:
        compressed = head + tail

    return compressed


def agent_loop(user_message: str, history: list = None, workflow_mode: str = None, interrupt_event=None, context_cutoff: int = 0):
    """
    Agent 主循环
    接收用户消息，调用 LLM，处理工具调用，返回最终结果

    参数:
        user_message: 用户消息
        history: 对话历史（完整）
        workflow_mode: 工作流模式（"step_by_step" 或 "auto"），None 使用默认值
        interrupt_event: threading.Event，设置后中断当前 Agent 循环
        context_cutoff: 上下文分割点，history[:context_cutoff] 不发送给 LLM（保留用于持久化）
    """
    client, model = create_client()

    if history is None:
        history = []

    # 构建消息列表（只发送 cutoff 之后的历史）
    messages = [{"role": "system", "content": build_system_prompt(workflow_mode)}]

    # 智能压缩历史：保留关键消息，丢弃中间过程
    active_history = history[context_cutoff:]
    if len(active_history) > 20:
        compressed = _compress_history(active_history)
        messages.extend(compressed)
    else:
        messages.extend(active_history)

    messages.append({"role": "user", "content": user_message})

    print(f"\n{'='*60}")
    print(f"用户: {user_message}")
    print(f"{'='*60}")

    # Agent 循环：LLM 可能需要多次调用工具
    max_iterations = 15  # 防止无限循环
    iteration = 0

    while iteration < max_iterations:
        iteration += 1

        # 检查是否被打断
        if interrupt_event and interrupt_event.is_set():
            print(f"\n⏹️ Agent 已中断（用户打断）")
            sys.stdout.flush()
            return "（已中断）", history

        print(f"\n--- Agent 思考中... (第 {iteration} 轮) ---")
        sys.stdout.flush()

        # 启动后台计时线程，每 10 秒打印一次等待提示
        import threading
        _stop_timer = threading.Event()

        def _wait_indicator():
            elapsed = 10
            while not _stop_timer.wait(10):
                print(f"  ⏳ 仍在等待 LLM 响应... ({elapsed}s)")
                sys.stdout.flush()
                elapsed += 10

        timer_thread = threading.Thread(target=_wait_indicator, daemon=True)
        timer_thread.start()

        # 调用 LLM
        try:
            llm_start = time.time()

            # 重试机制：最多重试 3 次，指数退避
            max_retries = 3
            response = None
            for attempt in range(max_retries):
                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=messages,
                        tools=TOOLS,
                        tool_choice="auto",
                        temperature=0.1,
                        stream=True,  # 流式输出
                    )
                    break  # 成功，跳出重试循环
                except Exception as api_err:
                    err_msg = str(api_err)
                    # 输入过长：压缩历史后重试（不计入重试次数）
                    if "InvalidParameter" in err_msg or "input length" in err_msg or "202745" in err_msg:
                        print(f"  ⚠️ 输入过长，压缩历史后重试...")
                        sys.stdout.flush()
                        # 保留 system + 最近 6 条消息
                        if len(messages) > 8:
                            messages = messages[:1] + _compress_history(messages[1:], keep_recent=6)
                        continue  # 不计入重试次数
                    is_retryable = any(k in err_msg for k in ["504", "502", "503", "timeout", "Timeout", "overloaded", "rate_limit", "429"])
                    if is_retryable and attempt < max_retries - 1:
                        wait = (attempt + 1) * 10  # 10s, 20s, 30s
                        print(f"  ⚠️ API 调用失败（{err_msg[:80]}），{wait}秒后重试 ({attempt + 1}/{max_retries})...")
                        sys.stdout.flush()
                        time.sleep(wait)
                    else:
                        raise  # 不可重试或最后一次重试，抛出异常

            _stop_timer.set()  # 停止等待提示

            # 流式读取响应
            content_buffer = ""
            tool_calls_buffer = {}  # {index: {id, function: {name, arguments}}}
            finish_reason = None

            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue

                # 内容流式输出
                if delta.content:
                    content_buffer += delta.content
                    # 实时打印（不换行，最后统一渲染 markdown）
                    print(delta.content, end="", flush=True)

                # 工具调用累积
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {"id": "", "function": {"name": "", "arguments": ""}}
                        if tc.id:
                            tool_calls_buffer[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                if chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason

            # 内容输出后换行
            if content_buffer:
                print()  # 换行

            llm_elapsed = time.time() - llm_start
            if llm_elapsed >= 60:
                m = int(llm_elapsed) // 60
                s = llm_elapsed - m * 60
                print(f"  (LLM 思考耗时: {m}m {s:.1f}s)")
            else:
                print(f"  (LLM 思考耗时: {llm_elapsed:.1f}s)")
            sys.stdout.flush()

            # 构造模拟的 response message 对象
            from openai.types.chat import ChatCompletionMessage
            from openai.types.chat.chat_completion import ChatCompletion, Choice

            # 构造 tool_calls 对象
            parsed_tool_calls = None
            if tool_calls_buffer:
                from openai.types.chat.chat_completion_message_tool_call import ChatCompletionMessageToolCall, Function
                parsed_tool_calls = []
                for idx in sorted(tool_calls_buffer.keys()):
                    tc = tool_calls_buffer[idx]
                    parsed_tool_calls.append(ChatCompletionMessageToolCall(
                        id=tc["id"],
                        type="function",
                        function=Function(
                            name=tc["function"]["name"],
                            arguments=tc["function"]["arguments"],
                        ),
                    ))

            message = ChatCompletionMessage(
                role="assistant",
                content=content_buffer if content_buffer else None,
                tool_calls=parsed_tool_calls,
            )
        except KeyboardInterrupt:
            _stop_timer.set()
            raise  # 向上传递给 main() 处理
        except Exception as e:
            _stop_timer.set()  # 停止等待提示
            print(f"\n❌ LLM API 调用失败: {e}")
            sys.stdout.flush()
            return f"LLM API 调用失败: {e}", history

        # 情况1：LLM 直接回复（不需要调用工具）
        if message.tool_calls is None:
            final_answer = message.content or "(LLM 返回了空回复)"
            # 内容已在流式输出中打印，此处只更新历史
            sys.stdout.flush()

            # 更新历史
            history.append({"role": "user", "content": user_message})
            history.append({"role": "assistant", "content": final_answer})

            return final_answer, history

        # 情况2：LLM 要调用工具
        tool_calls = message.tool_calls

        # 思考内容已在流式输出中打印，此处只加分隔
        if message.content:
            print()  # 换行分隔
            sys.stdout.flush()

        print(f"\n🔧 Agent 调用工具:")
        sys.stdout.flush()

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
            sys.stdout.flush()

            # 执行工具（分析类工具使用 rich 进度面板）
            tool_start = time.time()
            _ANALYSIS_TOOLS = ("analyze_assets", "run_ai_inference")

            if func_name in _ANALYSIS_TOOLS:
                # 创建进度面板
                progress, progress_cb = _create_analysis_progress()
                with progress:
                    from tools.identity import set_progress_callback, clear_progress_callback
                    set_progress_callback(progress_cb)
                    try:
                        result = execute_tool(func_name, func_args)
                    finally:
                        clear_progress_callback()
            else:
                print(f"  ⏳ 执行中...")
                sys.stdout.flush()
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
                        messages[0] = {"role": "system", "content": build_system_prompt(workflow_mode)}
                        print(f"  ✓ 已加载 {conv_result.get('loaded', 0)} 份规范文档到上下文")
                except (json.JSONDecodeError, KeyError):
                    pass

            # 把工具结果加入消息（截断过大的结果避免上下文溢出）
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": _truncate_tool_result(result),
            })

    # 如果循环次数用完
    final_answer = "抱歉，处理过程中遇到了问题，请尝试简化您的请求。"
    print(f"\n⚠️ 达到最大迭代次数")
    return final_answer, history


def _session_msgs_to_history(messages: list) -> list:
    """将会话 JSONL 消息转为 agent_loop 需要的 history 格式"""
    history = []
    for msg in messages:
        role = msg.get("role")
        if role == "user":
            history.append({"role": "user", "content": msg.get("content", "")})
        elif role == "assistant":
            entry = {"role": "assistant", "content": msg.get("content") or ""}
            if msg.get("toolCalls"):
                entry["tool_calls"] = msg["toolCalls"]
            history.append(entry)
        elif role == "tool":
            history.append({
                "role": "tool",
                "tool_call_id": msg.get("toolCallId", ""),
                "content": msg.get("content", ""),
            })
    return history


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
    mode_name = {"step_by_step": "逐步模式", "auto": "自动模式"}.get(WORKFLOW_MODE, WORKFLOW_MODE)
    print(f"  工作流:  {mode_name}")
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

    # 初始化会话管理器
    session_manager.init(os.path.join(project_root, ".ta_agent"))
    session_stats = session_manager.get_stats()
    print(f"\n  会话管理: OK")
    print(f"  存储位置: {os.path.join(project_root, '.ta_agent', 'sessions')}")
    print(f"  历史会话: {session_stats['active_sessions']} 个, {session_stats['total_messages']} 条消息")

    # 加载最近的活跃会话，或创建新会话
    active_sessions = session_manager.list_sessions()
    # 过滤掉草稿
    non_draft = [s for s in active_sessions if not s.get("isDraft")]
    if non_draft:
        current_session = non_draft[0]
        # 从会话恢复历史（转为 agent_loop 需要的格式）
        raw_messages = session_manager.get_messages(current_session["sessionId"], limit=50)
        history = _session_msgs_to_history(raw_messages)
        print(f"  当前会话: {current_session['title']}")
        print(f"  历史消息: {len(history)} 条")
    else:
        current_session = session_manager.create_session()
        history = []
        print(f"  当前会话: 新建 (草稿)")

    current_session_id = current_session["sessionId"]
    context_cutoff = 0  # 上下文分割点（history 中从此位置开始发送给 LLM）

    print(f"\n{'='*60}")
    print("输入消息与 Agent 对话，输入 'quit' 退出")
    print("输入 / 后按 Tab 可自动补全命令，/help 查看所有命令")
    print(f"当前模式：{WORKFLOW_MODE}\n")

    current_mode = WORKFLOW_MODE

    # 自定义按键
    bindings = KeyBindings()

    @bindings.add("enter")
    def _(event):
        """回车：关闭补全菜单并发送"""
        event.current_buffer.complete_state = None
        event.current_buffer.validate_and_handle()

    @bindings.add("tab")
    def _(event):
        """Tab：接受当前选中的候选"""
        buffer = event.current_buffer
        if buffer.complete_state:
            # 有候选菜单时，接受当前选中项
            completion = buffer.complete_state.current_completion
            if completion:
                buffer.apply_completion(completion)
            else:
                buffer.complete_next()
        else:
            # 没有候选菜单时，触发补全
            buffer.start_completion(select_first=True)

    # 使用 prompt_toolkit 处理输入
    prompt_session = PromptSession(
        history=InMemoryHistory(),
        completer=_AgentCompleter(),
        complete_while_typing=True,
        key_bindings=bindings,
    )

    while True:
        try:
            user_input = prompt_session.prompt("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not user_input:
            continue
        if user_input.lower() in ('quit', 'exit', 'q'):
            print("再见！")
            break

        # 命令处理
        if user_input.startswith('/'):
            cmd = user_input.lower().strip()
            if cmd.startswith('/mode'):
                parts = cmd.split()
                if len(parts) >= 2 and parts[1] in ('step_by_step', 'auto'):
                    current_mode = parts[1]
                    mode_name = {"step_by_step": "逐步模式", "auto": "自动模式"}[current_mode]
                    print(f"[系统] 已切换到：{mode_name}")
                else:
                    print("[系统] 用法：/mode step_by_step 或 /mode auto")
            elif cmd == '/status':
                mode_name = {"step_by_step": "逐步模式", "auto": "自动模式"}[current_mode]
                print(f"[系统] 当前模式：{mode_name}")
            elif cmd == '/plugins':
                # 列出可用插件和已启用插件
                plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins")
                available_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins_available")
                enabled = [f for f in os.listdir(plugins_dir) if f.endswith(".py") and not f.startswith("_")] if os.path.isdir(plugins_dir) else []
                available = [f for f in os.listdir(available_dir) if f.endswith(".py") and not f.startswith("_")] if os.path.isdir(available_dir) else []
                print(f"\n[系统] 已启用插件 ({len(enabled)}):")
                for f in enabled:
                    print(f"  ✓ {f}")
                not_installed = [f for f in available if f not in enabled]
                if not_installed:
                    print(f"\n[系统] 可安装插件 ({len(not_installed)}):")
                    for f in not_installed:
                        print(f"  ○ {f}  (安装: /install {f[:-3]})")
                else:
                    print("\n[系统] 所有可用插件已启用")
            elif cmd.startswith('/install'):
                parts = cmd.split()
                if len(parts) < 2:
                    print("[系统] 用法：/install <插件名>（不含 .py 后缀）")
                else:
                    plugin_name = parts[1]
                    if not plugin_name.endswith(".py"):
                        plugin_name += ".py"
                    available_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins_available")
                    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins")
                    src = os.path.join(available_dir, plugin_name)
                    dst = os.path.join(plugins_dir, plugin_name)
                    if not os.path.exists(src):
                        print(f"[系统] 未找到插件：{plugin_name}")
                    elif os.path.exists(dst):
                        print(f"[系统] 插件已启用：{plugin_name}")
                    else:
                        import shutil
                        shutil.copy2(src, dst)
                        print(f"[系统] 已安装插件：{plugin_name}（重启后生效）")
            elif cmd.startswith('/uninstall'):
                parts = cmd.split()
                if len(parts) < 2:
                    print("[系统] 用法：/uninstall <插件名>（不含 .py 后缀）")
                else:
                    plugin_name = parts[1]
                    if not plugin_name.endswith(".py"):
                        plugin_name += ".py"
                    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "plugins")
                    target = os.path.join(plugins_dir, plugin_name)
                    if os.path.exists(target):
                        os.remove(target)
                        print(f"[系统] 已卸载插件：{plugin_name}（重启后生效）")
                    else:
                        print(f"[系统] 插件未安装：{plugin_name}")
            elif cmd == '/help':
                print("\n[系统] 可用命令：")
                print("  /mode step_by_step   切换到逐步模式")
                print("  /mode auto           切换到自动模式")
                print("  /status              查看当前模式")
                print("  /plugins             查看已启用和可安装的插件")
                print("  /install <name>      安装插件")
                print("  /uninstall <name>    卸载插件")
                print("  /sessions            查看会话列表")
                print("  /new                 创建新会话")
                print("  /switch <id>         切换到指定会话")
                print("  /delete <id>         删除会话")
                print("  /clear               清空上下文（保留历史，LLM 不再看到之前的消息）")
                print("  /llm                 查看当前 LLM 配置")
                print("  /llm switch <name>   切换 LLM")
                print("  /llm add <key> <url> <model>  添加自建模型")
                print("  /help                显示此帮助")
                print("  quit                 退出")
                print("\n  输入 / 后按 Tab 可自动补全命令")
            elif cmd == '/clear':
                context_cutoff = len(history)
                print(f"[系统] 上下文已清空（保留 {len(history)} 条历史，后续消息不发送旧上下文给 LLM）")
            elif cmd.startswith('/llm'):
                from config import list_llm_configs, set_active_llm, add_llm_config, ACTIVE_LLM
                parts = cmd.split()
                if len(parts) == 1:
                    # 显示当前 LLM 状态
                    configs = list_llm_configs()
                    print(f"\n[系统] 当前 LLM: {ACTIVE_LLM}")
                    for c in configs:
                        marker = "→" if c["active"] else " "
                        type_tag = f"({c['type']})" if c.get("type") else ""
                        print(f"  {marker} {c['key']:15s} {c['name']:20s} {type_tag}")
                    print(f"\n  用法: /llm switch <name> 或 /llm add <key> <url> <model>")
                elif len(parts) >= 2 and parts[1] == "switch":
                    if len(parts) < 3:
                        print("[系统] 用法: /llm switch <name>")
                    else:
                        result = set_active_llm(parts[2])
                        if result.get("success"):
                            print(f"[系统] 已切换到: {result['name']}")
                        else:
                            print(f"[系统] {result.get('error')}")
                elif len(parts) >= 2 and parts[1] == "add":
                    if len(parts) < 5:
                        print("[系统] 用法: /llm add <key> <base_url> <model>")
                    else:
                        result = add_llm_config(key=parts[2], name=parts[2], base_url=parts[3], model=parts[4])
                        print(f"[系统] {result.get('message')}")
                else:
                    print("[系统] 用法: /llm | /llm switch <name> | /llm add <key> <url> <model>")
            elif cmd == '/sessions':
                sessions = session_manager.list_sessions()
                if not sessions:
                    print("[系统] 没有历史会话")
                else:
                    print(f"\n[系统] 会话列表 ({len(sessions)} 个):")
                    for s in sessions:
                        marker = "→" if s["sessionId"] == current_session_id else " "
                        pin = "📌" if s.get("isPinned") else "  "
                        draft = " (草稿)" if s.get("isDraft") else ""
                        print(f"  {marker} {pin} {s['sessionId'][:8]}  {s['title']}{draft}  [{s['messageCount']}条]")
                    print(f"\n  当前会话: {current_session_id[:8]}")
            elif cmd == '/new':
                current_session = session_manager.create_session()
                current_session_id = current_session["sessionId"]
                history = []
                context_cutoff = 0
                print(f"[系统] 已创建新会话: {current_session_id[:8]}")
            elif cmd.startswith('/switch'):
                parts = cmd.split()
                if len(parts) < 2:
                    print("[系统] 用法：/switch <会话ID前缀>")
                else:
                    prefix = parts[1]
                    sessions = session_manager.list_sessions(include_archived=True)
                    matches = [s for s in sessions if s["sessionId"].startswith(prefix)]
                    if not matches:
                        print(f"[系统] 未找到匹配的会话: {prefix}")
                    elif len(matches) > 1:
                        print(f"[系统] 多个匹配，请提供更长的前缀:")
                        for s in matches:
                            print(f"  {s['sessionId'][:12]}  {s['title']}")
                    else:
                        current_session = matches[0]
                        current_session_id = current_session["sessionId"]
                        raw_msgs = session_manager.get_messages(current_session_id, limit=50)
                        history = _session_msgs_to_history(raw_msgs)
                        context_cutoff = 0
                        print(f"[系统] 已切换到: {current_session['title']} ({len(history)} 条消息)")
            elif cmd.startswith('/delete'):
                parts = cmd.split()
                if len(parts) < 2:
                    print("[系统] 用法：/delete <会话ID前缀>")
                else:
                    prefix = parts[1]
                    sessions = session_manager.list_sessions(include_archived=True)
                    matches = [s for s in sessions if s["sessionId"].startswith(prefix)]
                    if not matches:
                        print(f"[系统] 未找到匹配的会话: {prefix}")
                    elif len(matches) > 1:
                        print(f"[系统] 多个匹配，请提供更长的前缀:")
                        for s in matches:
                            print(f"  {s['sessionId'][:12]}  {s['title']}")
                    else:
                        target = matches[0]
                        if target["sessionId"] == current_session_id:
                            print("[系统] 不能删除当前会话，请先 /switch 或 /new")
                        else:
                            session_manager.delete_session(target["sessionId"])
                            print(f"[系统] 已删除: {target['title']}")
            else:
                print("[系统] 未知命令。输入 /help 查看可用命令")
            continue

        try:
            answer, history = agent_loop(user_input, history, workflow_mode=current_mode, context_cutoff=context_cutoff)

            # 持久化消息到会话文件
            session_manager.append_message(current_session_id, {
                "role": "user",
                "content": user_input,
            })
            session_manager.append_message(current_session_id, {
                "role": "assistant",
                "content": answer,
            })
        except KeyboardInterrupt:
            print(f"\n⏹️ Agent 已中断")
            continue
        except Exception as e:
            print(f"\n❌ 错误: {e}")
            print("请检查 API 配置是否正确（config.py）")


if __name__ == "__main__":
    main()
