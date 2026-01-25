# Architecture

本文件描述 `opencode-group-discuss` 的整体架构、关键模块职责、运行时数据流与安全边界。

> 目标：让贡献者/维护者可以快速理解“入口在哪里、状态怎么流、错误怎么处理、配置怎么加载、为什么这么设计”。

---

## 1. High-Level Overview

`opencode-group-discuss` 是一个 OpenCode 插件。

- 入口：`src/index.ts` 导出 `GroupDiscussPlugin`
- 对外能力：通过 OpenCode 的 Tool API 注册工具
  - `group_discuss`：启动多 Agent 群聊讨论
  - `group_discuss_context`：打印预算与派生上限（安全、只读）
  - `session_manage`：管理 group_discuss 创建的子会话

核心目标是把“多角色、多轮、多并发的 prompt 调用”抽象成一个可控的引擎：

- 并发：通过 `ResourceController` + `p-queue` 控制
- 可靠性：超时/重试/AbortSignal 组合
- 可观测：Logger（带 token-like 脱敏）
- 可配置：ConfigLoader（项目级/全局级覆盖）

---

## 2. Source Tree Map

主要目录（以当前实现为准）：

- `src/index.ts`：插件入口，绑定 projectRoot，并注册 tools
- `src/tools/`：OpenCode Tool 定义
  - `src/tools/group-discuss.ts`：讨论工具
  - `src/tools/group-discuss-context.ts`：预算/派生上限工具
  - `src/tools/session-manage.ts`：子会话管理
  - `src/tools/diagnose.ts`：诊断信息收集（presence-only env + client 能力检查）
- `src/core/engine/`：核心引擎
  - `src/core/engine/DiscussionFacade.ts`：输入归一化、参数校验、默认值合并
  - `src/core/engine/DiscussionEngine.ts`：讨论运行循环（round loop + terminate + cleanup）
  - `src/core/engine/ResourceController.ts`：并发、超时、graceful shutdown
  - `src/core/engine/AgentRegistry.ts`：读取 `opencode.json` agent keys，并做 root-aware cache
- `src/modes/`：讨论模式策略
  - `src/modes/DebateMode.ts`
  - `src/modes/CollaborativeMode.ts`
- `src/config/`：配置
  - `src/config/ConfigLoader.ts`：配置加载与合并
  - `src/config/schema.ts`：配置 schema
- `src/utils/`：基础设施
  - `src/utils/Logger.ts`：日志（含脱敏）
  - `src/utils/Sanitizer.ts`：用户可见输出的 scrub + truncate
  - `src/utils/AsyncFS.ts`：文件 IO + `safeResolve`（sandbox）
  - `src/utils/withRetry.ts`：重试

---

## 3. Runtime Data Flow

### 3.1 Plugin Boot

当 OpenCode 加载插件时，会执行 `GroupDiscussPlugin`：

- 创建 Logger
- 用 `getConfigLoader(directory)` 把 ConfigLoader 的 projectRoot 绑定到 OpenCode 当前项目目录
- 注册 tools，并把 `client`/`directory` 注入

对应代码：
- `src/index.ts`

### 3.2 Tool Execution (group_discuss)

`group_discuss` 的 `execute(args, context)` 大致流程：

1) 读取配置：`getConfigLoader(projectRoot).loadConfig()`
2) 合并 defaults/preset/调用参数
3) 创建引擎 `DiscussionEngine`，传入：
   - 模式（debate/collaborative）
   - agents/participants
   - rounds（timeout/concurrency/max_retries 目前未在 tool 参数里暴露；会走 Facade 的默认值，或由程序化调用显式传入）
   - files/context
   - 会话上下文（sessionID）
4) 引擎执行 run loop，返回结果
5) 工具格式化输出（verbose/简洁输出）

对应代码：
- `src/tools/group-discuss.ts`
- `src/core/engine/DiscussionFacade.ts`
- `src/core/engine/DiscussionEngine.ts`

### 3.3 DiscussionEngine Initialize

引擎初始化阶段会做“尽早失败 (fail-closed)”的安全校验：

- files sandbox：
  - 仅允许读取 projectRoot 内文件（`realpath` 边界校验，拒绝 symlink 逃逸）
  - 限制：maxFiles / maxBytesPerFile / maxTotalBytes
  - 初始化阶段预读文件并构造 context block（避免在子会话创建后才失败）

对应代码：
- `src/core/engine/DiscussionEngine.ts`
- `src/utils/AsyncFS.ts`

### 3.4 Round Loop

每一轮 (round) 的核心步骤：

1) 模式决定发言人顺序
   - Debate：通常是 advocate/critic 交替，moderator 最后裁决
   - Collaborative：每轮所有 agents 都发言，并做收敛判断
2) 并发调度（受 concurrency 限制）：
   - 为每个 agent 创建子 session（`client.session.create`）
   - 调用 `client.session.prompt` 获取输出
3) 收集输出并进行共识评估/终止判断
4) 进入下一轮或结束

并发/超时/停止控制：

- `ResourceController.dispatch()` 包装每个调用：
  - 超时
  - AbortSignal
  - 重试（可配置）

对应代码：
- `src/core/engine/DiscussionEngine.ts`
- `src/core/engine/ResourceController.ts`
- `src/modes/*`

### 3.5 Cleanup

讨论结束或异常时：

- `ResourceController.shutdown()` 拒绝新任务并等待队列排空
- 根据 `keep_sessions` 决定是否删除子 session

对应代码：
- `src/core/engine/ResourceController.ts`
- `src/tools/session-manage.ts`

---

## 4. Configuration Model

### 4.1 Config Locations (Priority)

从高到低：

1) 项目级：`.opencode/group-discuss.json`
2) 全局级：`~/.config/opencode/group-discuss.json`

合并规则：项目级覆盖全局级同名字段；不存在则使用默认。

### 4.2 Defaults + Presets

- `defaults`：每次调用未显式传入的字段会从 defaults 补齐（注意：当前 `group_discuss` tool 只会从 defaults 读取部分字段，详见 `CONFIG.md`）
- `presets`：以 preset 名称引用一组预设参数，并允许调用参数覆盖 preset

### 4.3 Context Budget

推荐用 `context_budget` 描述预算，再由系统推导：

- max_context_chars
- max_message_length
- 以及压缩阈值/保留轮数等

`group_discuss_context` 用于可视化这些“派生值”，便于调参/写 e2e 断言。

对应代码：
- `src/config/ConfigLoader.ts`
- `src/tools/group-discuss-context.ts`

---

## 5. Logging & Redaction

### 5.1 Logger (for logs)

`Logger` 用于日志输出：

- Console/File/Remote (SDK)
- 支持 includeMeta
- 对 token-like 内容做基础脱敏（Bearer/JWT/sk-*/querystring secret）

对应代码：
- `src/utils/Logger.ts`

### 5.2 Sanitizer (for user-visible outputs)

面向“返回给用户的字符串/诊断 JSON”，使用 `Sanitizer`：

- scrubString：复用 Logger 的脱敏规则
- truncateString：限制长度，避免错误消息携带过多敏感内容

对应代码：
- `src/utils/Sanitizer.ts`
- `src/tools/diagnose.ts`
- `src/tools/group-discuss.ts`

---

## 6. Security Boundaries

### 6.1 File Sandbox

`files` 读取遵循 fail-closed：

- 不允许读取 projectRoot 外路径（包括绝对路径与 symlink 逃逸）
- 超过大小/数量/总量限制直接报错

### 6.2 Env Presence-Only

`diagnose=true` 不打印 env 实际值，只输出 `[SET] / [NOT SET]`。

### 6.3 Debug Options

debug 模式可能记录 prompt/context 的业务内容（不一定包含 token，但可能包含业务敏感信息），建议在敏感项目中谨慎开启。

---

## 7. Extensibility Guide

### 7.1 Adding a New Mode

1) 在 `src/modes/` 增加 Mode 类
2) 实现：speaker selection、termination policy（如果需要）
3) 在 `src/tools/group-discuss.ts` 的 mode 选择逻辑里注册
4) 增加单元测试 + 集成测试

### 7.2 Adding a New Tool

1) 在 `src/tools/` 新增 `createXTool()`
2) 在 `src/index.ts` 注册
3) 如果依赖 projectRoot，确保传入 directory 并使用 `getConfigLoader(projectRoot)`

---

## 8. Testing Strategy

- 测试框架：Node 内置 `node:test`（通过 `npm test` 运行）
- 测试 import：多数测试从 `dist/*` 导入（确保测试覆盖构建产物行为）
- 集成测试：用 `tests/integration/MockAgentClient.js` 模拟 OpenCode client
