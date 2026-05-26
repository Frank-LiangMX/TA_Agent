# TA Agent 工程问题排查报告

## 一、总体概览

本次修改涉及 21 个文件，主要变更包括：
1. 新增用户自定义模型管理功能
2. 新增前端启动向导（模式选择、登录、本地配置）
3. 修改运行时数据目录路径
4. 新增阶段建议系统
5. 多标签会话支持优化

---

## 二、已修复的问题

### ✅ 1. server.py 解包错误（已修复）
**问题**：`agent.create_client()` 返回 2 个值，但 server.py 尝试解包 3 个值
**影响**：后端崩溃，所有消息发送失败
**状态**：已修复

### ✅ 2. WebSocket 竞态条件（已修复）
**问题**：MainPanel 的事件监听器设置时，"connected" 事件可能已发送
**影响**：`activeTabId` 为 null，无法发送消息
**状态**：已修复（通过缓存 connected 事件）

### ✅ 3. 运行时目录路径（已修复）
**问题**：开发模式统一使用 AppData，导致配置文件路径混乱
**影响**：配置文件读写位置不一致
**状态**：已修复（开发模式用 `.ta_agent`，打包模式用 AppData）

### ✅ 4. Electron 配置路径不一致（已修复）
**问题**：`electron/main.js` 始终使用 AppData，与 Python 后端不一致
**影响**：Electron 和 Web 读取不同配置文件
**状态**：已修复（开发模式使用项目内 `.ta_agent` 目录）

### ✅ 5. API Key 配置读取优先级混乱（已修复）
**问题**：激活模型没有 API Key 时会 fallback 到旧配置
**影响**：可能调用错误的 API
**状态**：已修复（移除 fallback，模型必须有自己的 API Key）

### ✅ 6. 联机模式代码在本地模式下产生无意义请求（已修复）
**问题**：`logLlmUsage` 函数没有模式检查
**影响**：本地模式下每次工具调用都会尝试同步
**状态**：已修复（添加 `isOnlineMode()` 检查）

### ✅ 7. 旧 LLM 配置 API 与新模型管理 API 共存（已修复）
**问题**：同时存在 `/api/config/llm` 和 `/api/config/models` 两套 API
**影响**：配置冲突
**状态**：已修复（删除旧 API）

---

## 三、当前存在的问题

### 🟡 1. MOCK_MESSAGES 被删除但仍有引用

**位置**：`fronted/src/components/layout/MainPanel.tsx`

**问题描述**：
原始代码中有 `MOCK_MESSAGES` 常量：
```typescript
const MOCK_MESSAGES: ChatMessageType[] = [
  { id: 'mock-1', role: 'assistant', content: '你好！...', timestamp: Date.now() - 60000 }
]
```

修改后删除了这个常量，并将所有 `MOCK_MESSAGES` 替换为 `[]`。

**影响**：
- 新会话打开时没有任何欢迎消息
- 用户体验下降（不知道系统是否正常工作）

**建议**：
- 保留欢迎消息，或者在后端创建会话时自动发送欢迎消息

---

### 🟡 2. config.py 中 LLM_CONFIGS 的 api_key 被清空

**位置**：`config.py` 第 15-36 行

**问题描述**：
```python
LLM_CONFIGS = {
    "deepseek": {
        "api_key": "",  # 原来有值，被清空
    },
    "glm": {
        "api_key": "",  # 原来有值，被清空
    },
}
```

**影响**：
- 如果用户没有配置自定义模型，`get_llm_config()` 会抛出 "API Key 未配置" 错误
- 原本可以直接使用预设配置，现在必须手动配置

**建议**：
- 保留预设配置的 api_key（作为默认值）
- 或者在文档中说明需要手动配置

---

### 🟢 3. getUserQueryParams 函数签名变更

**位置**：`fronted/src/lib/user-config.ts`、`fronted/src/services/websocket.ts`

**问题描述**：
```typescript
// 旧代码
const userParams = getUserQueryParams()

// 新代码
const userParams = getUserQueryParams(this._sessionId ? '&' : '?')
```

**问题**：
- 函数签名从无参数变为接受一个参数
- 但没有看到函数定义的变更（可能在其他分支）

**建议**：
- 确认 `getUserQueryParams` 函数已更新
- 或者使用更清晰的方式处理查询参数

---

## 四、逻辑矛盾分析

### 矛盾 1：配置文件读取路径（已解决）

| 组件 | 开发模式路径 | 打包模式路径 |
|------|-------------|-------------|
| Python 后端 (config.py) | `.ta_agent` | `%APPDATA%/tagent-desktop/agent-running-data` |
| Electron (main.js) | `.ta_agent` | `%APPDATA%/tagent-desktop/agent-running-data` |
| Web 前端 (config.ts) | 后端 API | 后端 API |

**结论**：已修复，现在所有组件在开发模式下都使用 `.ta_agent` 目录

---

### 矛盾 2：模型配置存储位置（已简化）

| 存储位置 | 用途 | 读取方 |
|----------|------|--------|
| `LLM_CONFIGS` (config.py) | 预设模型（已清空 API Key） | `get_llm_config()` fallback |
| `app-config.json` → `models` | 用户模型列表 | `get_active_model()` |

**结论**：已删除旧 API，统一使用 `app-config.json` 中的 `models` 字段

---

## 五、修复优先级建议

### P0（已修复）
1. ✅ server.py 解包错误
2. ✅ WebSocket 竞态条件
3. ✅ Electron 配置路径不一致
4. ✅ API Key 配置读取优先级混乱

### P1（已修复）
5. ✅ 联机模式代码在本地模式下产生无意义请求
6. ✅ 旧 LLM 配置 API 与新模型管理 API 共存

### P2（后续优化）
7. 🟡 MOCK_MESSAGES 被删除
8. 🟡 config.py 中 LLM_CONFIGS 的 api_key 被清空
9. 🟢 getUserQueryParams 函数签名变更

---

## 六、测试建议

修复后需要测试以下场景：

1. **开发模式（Web）**
   - 启动后端，检查配置文件位置
   - 配置模型，重启后端，验证配置是否保留

2. **开发模式（Electron）**
   - 启动 Electron，检查配置文件位置
   - 配置模型，重启 Electron，验证配置是否保留

3. **打包模式**
   - 打包后安装，检查配置文件位置
   - 升级版本，验证配置是否保留

4. **消息发送**
   - 单标签发送消息
   - 多标签切换发送消息
   - 快速连续发送消息

5. **模型切换**
   - 添加新模型
   - 切换激活模型
   - 删除模型
