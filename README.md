# OpenCode Group Discuss

🎯 多Agent群聊讨论插件，让OpenCode的AI agents能够协作辩论和讨论问题。

> ⚠️ **v0.3.0 重要更新**: 本版本引入了破坏性变更（Node >= 20, 错误码标准化）。请参考 [迁移指南 (docs/MIGRATION.md)](./docs/MIGRATION.md)。

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

### 配置文件位置

插件支持两级配置文件，按优先级从高到低：

1. **项目级**：`.opencode/group-discuss.json`（最高优先级）
2. **全局级**：`~/.config/opencode/group-discuss.json`

项目级配置会覆盖全局级配置的对应字段。

### 配置结构

```json
{
  // 默认参数
  "defaults": {
    "mode": "debate",           // 默认讨论模式
    "rounds": 3,                // 默认轮数
    "timeout": 600000,          // 超时时间（毫秒）
    "concurrency": 2,           // 并发调用数
    "verbose": true,            // 显示详细输出
    "keep_sessions": false,     // 保留子会话（调试用）
    "max_retries": 3            // 最大重试次数
  },

  // 预设配置
  "presets": {
    "tech-review": {
      "agents": ["advocate", "critic", "moderator"],
      "mode": "debate",
      "rounds": 3
    },
    "architecture": {
      "participants": [
        { "name": "Architect", "subagent_type": "critic", "role": "系统架构设计" },
        { "name": "DBA", "subagent_type": "general", "role": "数据库选型" },
        { "name": "Security", "subagent_type": "critic", "role": "安全审计" }
      ],
      "mode": "collaborative",
      "rounds": 5
    }
  },

  // 共识评估配置
  "consensus": {
    "threshold": 0.8,                    // 共识度阈值
    "enable_convergence_analysis": true, // 启用趋同分析
    "stalemate_window": 2                // 僵局检测窗口
  },

  // 终止条件配置
  "termination": {
    "min_confidence": 0.7,               // 最小置信度
    "enable_stalemate_detection": true,  // 启用僵局检测
    "stalemate_rounds": 3                // 僵局轮次阈值
  },

  // 上下文压缩配置
  // 推荐：用 context_budget 管理预算，避免手填字符数
  "context_budget": {
    "profile": "balanced",             // small | balanced | large
    "input_tokens": 6000,               // 注入上下文的 token 预算
    "min_output_tokens": 512,           // 预留给模型输出的 token
    "reasoning_headroom_tokens": 0,     // 预留给推理 token（按模型需要调整）
    "chars_per_token": 4                // 估算换算（英文常用 4；CJK 可调小）
  },

  // 上下文压缩配置
  "context_compaction": {
    "max_context_chars": "auto",        // 最大上下文字符数（auto 由 context_budget 推导）
    "compaction_threshold": 0.8,         // 压缩触发阈值
    "max_message_length": "auto",       // 每条消息最大保留字符数（auto 由 profile 推导）
    "preserve_recent_rounds": 1,         // 保留最近 N 轮完整发言
    "enable_key_info_extraction": true,  // 启用关键信息提取
    "include_self_history": false        // 是否包含当前 agent 的历史发言
  },

  // 日志配置
  "logging": {
    "level": "info",                   // error | warn | info | debug
    "console_enabled": true,            // 输出到 console
    "file_enabled": true,               // 输出到文件
    "file_path": "group_discuss.log",  // 日志文件路径（相对路径基于 cwd）
    "include_meta": true,               // 是否输出 meta
    "max_entry_chars": 8000,            // 单条日志最大字符数
    "max_meta_chars": 4000              // meta 最大字符数
  },

  // Debug 开关（会自动提升日志 level 到 debug）
  "debug": {
    "log_prompts": false,               // 记录发给 agent 的 prompt
    "log_context": false,               // 记录注入给 agent 的上下文
    "log_compaction": false             // 记录上下文压缩决策与统计
  }
}
```

日志/诊断安全说明：
- `diagnose=true` 的环境变量输出为 presence-only（`[SET]` / `[NOT SET]`），不会打印实际值。
- 日志会对 token-like 内容做基础脱敏（Bearer/JWT/sk-*/querystring secret）。
- 开启 debug 级别日志仍可能包含 prompt/context 的业务内容，请谨慎用于包含敏感信息的项目。

### 预设使用示例

定义预设后，可以通过 `preset` 参数快速使用：

```json
// 使用 tech-review 预设
{ "topic": "REST vs GraphQL", "preset": "tech-review" }

// 预设 + 覆盖部分参数
{ "topic": "数据库选型", "preset": "tech-review", "rounds": 5 }

// 预设 + 额外上下文
{ "topic": "审查 PR #123", "preset": "code-review", "files": ["src/api/users.ts"] }
```

> **提示**：完整的配置示例请参考 [`examples/group-discuss.example.jsonc`](./examples/group-discuss.example.jsonc)。

## 🔧 开发

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
