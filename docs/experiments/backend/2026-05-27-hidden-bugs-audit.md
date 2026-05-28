# 隐藏问题排查报告

> 日期：2026-05-27
> 背景：progress_hook.py 导入路径修复后，排查项目中类似问题

## 会崩溃的 BUG

### 1. agent.py: `project_root` 未定义

```
文件: agent.py
行号: 1084, 1087
问题: 使用了 `project_root`（小写），但该变量从未定义。config.py 导出的是 `PROJECT_ROOT`（大写）
影响: CLI 模式运行 agent.py 时 main() 函数会抛 NameError 崩溃
```

### 2. tools/core/identity.py: `_get_tag_store()` 不存在

```
文件: tools/core/identity.py
行号: 551
问题: update_asset 函数调用了 `_get_tag_store()`，但该函数从未定义。其他函数都用 `_get_analyzer()` 获取 store
影响: update_asset 工具被调用时会抛 NameError 崩溃
```

### 3. batch_render.py: 渲染脚本路径错误

```
文件: batch_render.py
行号: 11
问题: 拼接路径为 tools/blender_asset_renderer.py，实际文件在 tools/core/blender_asset_renderer.py
影响: 批量渲染脚本无法找到渲染器，运行时文件找不到
```

### 4. run_render.py: 渲染脚本路径错误

```
文件: run_render.py
行号: 4
问题: 硬编码路径 F:\ta_agent\tools\blender_asset_renderer.py，缺少 core/ 子目录
影响: 同上，运行时文件找不到
```

## 脆弱/容易出问题的

### 5. core.project_config 导入依赖 sys.path

```
文件: tools/core/intake.py:22, asset_operations.py:19, config_tools.py:11, naming.py:14
问题: 使用 `from core.project_config import ...`，但 core/ 不是顶层包
      只有当 F:\ta_agent 在 sys.path 中时才能工作（launcher.py 会设置）
影响: 如果从其他上下文导入这些模块，会抛 ImportError
```

### 6. server.py 硬编码项目根路径

```
文件: fronted/server/server.py
行号: 25
问题: TA_AGENT_DIR = r"F:\ta_agent" 硬编码绝对路径
影响: 换机器或改目录后 server 无法启动
```

### 7. server.py 绕过 config 常量手动拼路径

```
文件: fronted/server/server.py
行号: 1051, 1286, 1310, 1320
问题: 手动拼 .ta_agent/memory、.ta_agent/pipeline.json 等路径
      没有使用 config.MEMORY_DIR、config.PIPELINE_RUNS_FILE 等常量
影响: 如果 config.py 路径逻辑变更，server.py 不会同步更新
```

### 8. analyzer.py 导入 progress_hook 脆弱

```
文件: analyzer.py
行号: 254
问题: `from progress_hook import is_cancelled` 依赖 fronted/server/ 在 sys.path 中
影响: 非 server 上下文调用时取消检查功能静默失效（有 try/except 保护）
```

### 9. texture.py 读取 identity.py 私有变量

```
文件: tools/core/texture.py
行号: 178
问题: `from tools.core.identity import _active_progress_callback` 跨模块读取私有变量
影响: identity.py 重构进度机制时此处会静默失效
```

### 10. count_assets.py 插件硬编码 tag_store 路径

```
文件: tools/plugins/count_assets.py
行号: 25
问题: 手动拼 tag_store 路径，没有使用 config.TAG_STORE_DIR
影响: store 位置变更后插件找不到数据
```

### 11. tags/inferrer.py 动态附加 dataclass 属性

```
文件: tags/inferrer.py
行号: 360-361
问题: 给 AssetTags dataclass 动态附加 _infer_failed、_infer_error 属性
影响: 如果 dataclass 启用验证或序列化，这些属性会丢失
```

## 修复计划

- [x] 优先修复 3 个会崩溃的 BUG（#1-#4，实际合并为 3 个修复）
- [x] 修复 #6 server.py 硬编码路径 + #7 绕过 config 常量
- [ ] #5, #8-#11 评估后跳过（见下方说明）

## 跳过说明

| # | 问题 | 跳过原因 |
|---|------|---------|
| 5 | core.project_config 导入依赖 sys.path | 当前能工作，改动 4 个文件有连锁风险 |
| 8 | analyzer.py progress_hook 导入 | 已有 try/except 保护，不会崩 |
| 9 | texture.py 读私有变量 | 同项目内可控，改动有回归风险 |
| 10 | count_assets.py 硬编码路径 | 已在 agent.py:93 中被排除加载，遗留代码 |
| 11 | inferrer.py 动态属性 | Python 允许，dataclass 无验证/无 __slots__ |

## 修复记录

### BUG #1: agent.py project_root 未定义 ✅

```
修复: 将 project_root 替换为 config 导出的 RUNTIME_DIR 和 SESSIONS_DIR
文件: agent.py:1067, 1084, 1087
```

### BUG #2: identity.py _get_tag_store() 不存在 ✅

```
修复: _get_tag_store() → _get_analyzer().store
文件: tools/core/identity.py:551
```

### BUG #3-4: 渲染脚本路径错误 ✅

```
修复: batch_render.py 和 run_render.py 中补上 core/ 子目录
文件: batch_render.py:11, run_render.py:4
```

### FRAGILE #6-7: server.py 路径硬编码 ✅

```
修复:
1. TA_AGENT_DIR 改为 os.path.dirname 动态计算（不再硬编码 F:\ta_agent）
2. 手动拼接的路径改为 config 常量：
   - .ta_agent/memory → MEMORY_DIR
   - .ta_agent/pipeline_runs.jsonl → PIPELINE_RUNS_FILE
   - .ta_agent/pipeline.json → os.path.dirname(MEMORY_DIR)（无现成常量）
文件: fronted/server/server.py:25, 33, 1051, 1286, 1310, 1320
```

### 置信度为 0 的问题 ✅

```
根因: LLM prompt 只要求 category 返回 confidence，material_structure 和 visual 没要求
      inferrer.py 解析时也没提取这些字段的 confidence
修复:
1. prompt 增加 material_structure.confidence、visual.style_confidence、visual.condition_confidence
2. 解析逻辑增加对应字段的提取和填充
3. 推断规则增加置信度给值指南
文件: tags/inferrer.py (prompt + 解析逻辑)
```
