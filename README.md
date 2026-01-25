# OpenCode Group Discuss

🎯 多Agent群聊讨论插件，让OpenCode的AI agents能够协作辩论和讨论问题。

## ✨ 特性

- 🗣️ **多Agent辩论** - 正方、反方、裁判三方讨论
- 🔄 **多轮对话** - 支持1-10轮讨论，默认3轮
- 📊 **智能共识分析** - 多维度评估共识程度（关键词、引用模式、趋同轨迹）
- 🎯 **动态终止** - 智能判断何时结束讨论（高共识、僵局、超时等）
- 📝 **完整记录** - 保存所有讨论历史
- ⚡ **预设配置** - 通过 `preset` 参数快速复用常用配置
- 🔧 **高度可定制** - 独立配置文件支持默认值、预设、共识/终止参数

## 📦 安装

> **Requirements**: Node.js >= 20.0.0

推荐把插件装在你的项目里（便于 OpenCode 在该项目上下文找到依赖）：

```bash
npm install -D opencode-group-discuss
```

也支持全局安装（适合你只在少数项目里临时试用）：

```bash
npm install -g opencode-group-discuss
```

启用插件：在项目根目录的 `opencode.json` 里加入：

```json
{
  "plugin": ["opencode-group-discuss"]
}
```

你也可以直接基于模板开始：

```bash
cp templates/opencode.example.json opencode.json
```

安装校验：在 OpenCode 里调用以下工具（只看帮助，不会执行讨论）：

- `group_discuss(help=true)`
- `group_discuss_context(help=true)`

你可以用 `group_discuss_context` 查看当前生效的预算与推导后的字符上限（便于端到端调试/断言）。

## 🚀 快速开始

想要更短路径的 5 分钟上手：[`docs/QUICKSTART.md`](./docs/QUICKSTART.md)。

### 1. 配置 Agents

在你的 `opencode.json` 中定义参与讨论的 agents：

```json
{
  "$schema": "https://opencode.ai/config.json",
  
  "agent": {
    "advocate": {
      "description": "倡导者，提出并支持观点",
      "mode": "subagent",
      "prompt": "正方/倡导者：按结构输出 主张/论据/收益/代价/风险与应对/回应反方/假设与待确认项。",
      "temperature": 0.7
    },
    "critic": {
      "description": "批评者，质疑和挑战观点",
      "mode": "subagent",
      "prompt": "反方/批评者：按结构输出 关键反对点/逻辑漏洞/失败模式/安全与合规/运维与成本/必要约束/替代方案。",
      "temperature": 0.6
    },
    "moderator": {
      "description": "主持人，评估并裁决",
      "mode": "subagent",
      "prompt": "裁判/主持人：必须输出 Verdict + Constraint List(Must-Haves/Must-Nots/Trade-offs) + Risks & Mitigations + Open Questions + Next Steps，并在最后追加一个 JSON 指令集供 Main Agent 落地。",
      "temperature": 0.3
    },
    "summarizer": {
      "description": "总结者/记录员 - 压缩并提炼讨论要点",
      "mode": "subagent",
      "prompt": "输出 Context Pack：Background/Key Arguments(正反)/Decisions/Constraints/Open Questions，供后续阶段直接复用。",
      "temperature": 0.2
    },
    "researcher": {
      "description": "前期调研员/Researcher - Web research",
      "mode": "subagent",
      "prompt": "先做网络调研并输出 Research Brief（含 Sources/关键事实/风险与约束/待确认问题），为后续辩论提供事实依据。",
      "temperature": 0.2
    },
    "bridge": {
      "description": "桥接者/PO - 战略决策转技术规格",
      "mode": "subagent",
      "prompt": "把裁决 + 约束清单转译为 Tech Spec（Goals/Non-Goals/API 边界/数据模型/验收标准/实现清单）。",
      "temperature": 0.2
    },
    "reviewer": {
      "description": "审计者/Reviewer - 对照约束清单验收",
      "mode": "subagent",
      "prompt": "对照 Constraint List 审计 Tech Spec/设计：逐条 PASS/FAIL/UNKNOWN + 证据 + 修复建议，并补齐最小验收测试建议。",
      "temperature": 0.2
    }
  },
  
  "plugin": ["opencode-group-discuss"]
}
```

### 2. 使用插件

在 OpenCode 中，你可以通过主 agent 调用讨论工具：

```
用户: 我们团队在考虑数据库选型，PostgreSQL 和 MySQL 各有优劣，
     帮我组织一次讨论分析一下。

Build Agent: 好的，我来启动一个群聊讨论。
            [调用 group_discuss 工具]

💬 群聊讨论开始：PostgreSQL vs MySQL
参与者: @advocate, @critic, @moderator

━━━━━━━━━━ Round 1/3 ━━━━━━━━━━

🤖 @advocate:
我认为应该选择 PostgreSQL。理由如下：
1. 支持更高级的 SQL 特性...
2. JSONB 类型非常适合...

🤖 @critic:
我对此有不同看法。MySQL 的优势在于：
1. 生态系统更成熟...
2. 运维工具更丰富...

━━━━━━━━━━ Round 2/3 ━━━━━━━━━━
...

✅ 讨论完成！
推荐方案: PostgreSQL
支持度: 75%
```

## 🎮 工具参数

`group_discuss` 工具支持以下参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `topic` | string | - | 讨论话题（必填） |
| `preset` | string | - | 使用预设配置名称（定义在 group-discuss.json） |
| `agents` | string[] | `['advocate', 'critic', 'moderator']` | 参与讨论的预注册 agents (opencode.json) |
| `participants` | object[] | `[]` | 临时定义的参与者 (覆盖 agents) |
| `mode` | enum | `'debate'` | 讨论模式: `'debate'` 或 `'collaborative'` |
| `rounds` | number | `3` | 讨论轮数（1-10） |
| `files` | string[] | `[]` | 参考文件路径列表 |
| `context` | string | - | 额外的上下文背景信息 |
| `keep_sessions` | boolean | `false` | 是否保留子会话 (用于调试) |
| `verbose` | boolean | `true` | 是否显示完整对话记录 |

> **提示**: 默认超时时间为 10 分钟，并发数为 2。这些值可在配置文件中修改。

## 🧾 工具自描述（给 LLM/Agent）

本插件的工具都支持自描述用法：调用时传 `help=true` 会返回参数与示例（不会执行实际操作）。

- `group_discuss(help=true)`：讨论工具完整用法
- `group_discuss_context(help=true)`：预算/派生上限输出说明
- `session_manage(help=true)`：子会话管理用法

### `participants` 对象结构

如果你需要临时定义角色或使用特定的 subagent 类型：

```typescript
{
  name: string;          // 显示名称 (如 "Frontend", "PM")
  subagent_type: string; // 对应的 agent 类型 (如 "general", "critic")
  role?: string;         // (可选) 具体的职责描述 prompt
}
```

## 📖 使用场景

### 1. 技术选型 (Debate Mode)

默认模式，适合权衡利弊。

```json
{
  "topic": "应该用 REST API 还是 GraphQL？",
  "mode": "debate",
  "agents": ["advocate", "critic", "moderator"]
}
```

### 2. 协作方案设计 (Collaborative Mode)

适合多角色共同完善一个方案。

```json
{
  "topic": "设计一个高可用的支付系统架构",
  "mode": "collaborative",
  "participants": [
    { "name": "Architect", "subagent_type": "critic", "role": "负责系统整体架构与可用性设计" },
    { "name": "DBA", "subagent_type": "general", "role": "负责数据库选型与一致性保障" },
    { "name": "Security", "subagent_type": "critic", "role": "负责支付安全与合规" }
  ],
  "rounds": 5
}
```

### 3. 代码审查 (With Files)

让 Agent 读取本地文件进行讨论。

安全说明：
- `files` 仅允许读取项目根目录内的文件（会做 `realpath` 边界校验，防止 symlink 逃逸）。
- 不允许读取项目根目录之外的绝对路径。
- 限制：最多 10 个文件；单文件最大 256 KiB；总计最大 1 MiB（超出会直接失败）。

```json
{
  "topic": "审查当前 Auth 模块的安全性",
  "files": ["src/auth/AuthService.ts", "src/auth/jwt.ts"],
  "mode": "collaborative",
  "context": "重点关注 Token 泄露风险和过期处理"
}
```

话题: \"应该用 REST API 还是 GraphQL？\"
```

### 4. 使用预设配置

通过配置文件预定义常用的讨论设置，使用 `preset` 参数快速调用：

```json
{
  "topic": "评审新的用户认证模块",
  "preset": "code-review",
  "files": ["src/auth/AuthService.ts"]
}
```

## ⚙️ 配置文件

配置详解见：[`docs/CONFIG.md`](./docs/CONFIG.md)。

提示：当前 `group_discuss` tool 只会从配置的 `defaults` 读取 `mode/rounds/verbose/keep_sessions`，其余 defaults 字段请以 `docs/CONFIG.md` 的“当前实现说明”为准。

### 配置文件位置

插件支持两级配置文件，按优先级从高到低：

1. **项目级**：`.opencode/group-discuss.json`（最高优先级）
2. **全局级**：`~/.config/opencode/group-discuss.json`

项目级配置会覆盖全局级配置的对应字段。

### 配置结构

README 里不再复制完整字段清单（避免与配置文档重复）。

- 字段/合并规则详解：[`docs/CONFIG.md`](./docs/CONFIG.md)
- 最小配置示例：[`examples/group-discuss.example.jsonc`](./examples/group-discuss.example.jsonc)
- 全字段示例：`examples/group-discuss.full.jsonc`

安全与边界说明：见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 🧰 Troubleshooting / FAQ

### 1) OpenCode 找不到工具（没有 `group_discuss` / `group_discuss_context`）

- 确认你在项目根目录安装了依赖（推荐）：

```bash
npm ls opencode-group-discuss
```

- 确认项目根目录 `opencode.json` 启用了插件：

```json
{ "plugin": ["opencode-group-discuss"] }
```

- 在 OpenCode 内调用 `group_discuss(help=true)` 看是否能返回自描述帮助。
- 安装/配置变更后，重启 OpenCode 进程（避免旧的插件加载状态）。

### 2) `diagnose=true` 怎么用？

- `group_discuss({ diagnose: true, topic: "..." })` 会输出：client 能力（是否有 session.create/delete）、以及简化的 env presence-only 信息。
- 如果看到 `Unauthorized`/`401`，通常是 OpenCode Desktop 的认证信息未正确注入（已知问题）。
  - 临时方案：用 CLI 版本 `opencode` 运行，或确认 Desktop 已登录/已配置 token。

### 3) 配置文件加载失败（JSON 语法错误）

- 报错示例：`Failed to load config ... SyntaxError: ...`
- 配置位置：
  - 项目级：`.opencode/group-discuss.json`
  - 全局级：`~/.config/opencode/group-discuss.json`
- 处理方式：
  - 先用最小配置验证能跑通，再逐步加字段
  - 避免不合法的 JSON（比如多余逗号、未加引号的 key 等）

### 4) `files` 被拒绝/读取失败（`E_FILE_SANDBOX` / `E_FILE_NOT_FOUND` / `E_FILE_TOO_LARGE`）

- `files` 只允许读取“OpenCode 项目根目录”内的文件，并做了 `realpath` 边界校验（防止 symlink 逃逸）。
- 常见原因：
  - 传了项目外的绝对路径（会被拒绝）
  - 传了 `../` 逃逸路径（会被拒绝）
  - 文件确实不存在或拼写错误（`E_FILE_NOT_FOUND`）
  - 超过限制：最多 10 个文件；单文件最大 256 KiB；总计最大 1 MiB（会 fail-closed）
- 建议：用相对路径（相对项目根目录），并先手动确认文件存在。

### 5) 预算/字符上限相关问题

- 用 `group_discuss_context(help=true)` 查看预算推导规则
- 用 `group_discuss_context({ help: false })` 查看当前生效的 context_budget 与派生上限

## 🔧 开发

## 🏗️ 架构文档

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)：整体架构、数据流、安全边界与扩展点

```bash
# 克隆仓库
git clone https://github.com/opencode-ai/opencode-group-discuss
cd opencode-group-discuss

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 📄 许可证

MIT License

## 🙏 致谢

本项目受以下研究启发：

- [Multi-Agent Debate (MAD)](https://github.com/Skytliang/Multi-Agents-Debate) - "真理越辩越明"
- [Microsoft AutoGen](https://github.com/microsoft/autogen) - 多Agent对话框架
- [OpenCode](https://github.com/anomalyco/opencode) - 开源AI编程助手

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系

如有问题或建议，请通过 GitHub Issues 联系。
