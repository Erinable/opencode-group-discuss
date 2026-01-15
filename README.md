# OpenCode Group Discuss

🎯 多Agent群聊讨论插件，让OpenCode的AI agents能够协作辩论和讨论问题。

> ⚠️ **v0.3.0 重要更新**: 本版本引入了破坏性变更（Node >= 20, 错误码标准化）。请参考 [迁移指南 (MIGRATION.md)](./MIGRATION.md)。

## ✨ 特性

- 🗣️ **多Agent辩论** - 正方、反方、裁判三方讨论
- 🔄 **多轮对话** - 支持1-10轮讨论，默认3轮
- 📊 **共识分析** - 自动计算agents之间的共识度
- 📝 **完整记录** - 保存所有讨论历史
- ⚡ **实时输出** - 流式显示讨论进展

## 📦 安装

> **Requirements**: Node.js >= 20.0.0

```bash
npm install -g opencode-group-discuss
```

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
| `agents` | string[] | `['advocate', 'critic', 'moderator']` | 参与讨论的预注册 agents (opencode.json) |
| `participants` | object[] | `[]` | 临时定义的参与者 (覆盖 agents) |
| `mode` | enum | `'debate'` | 讨论模式: `'debate'` 或 `'collaborative'` |
| `rounds` | number | `3` | 讨论轮数（1-10） |
| `files` | string[] | `[]` | 参考文件路径列表 |
| `context` | string | - | 额外的上下文背景信息 |
| `keep_sessions` | boolean | `false` | 是否保留子会话 (用于调试) |
| `verbose` | boolean | `true` | 是否显示完整对话记录 |

> **提示**: 默认超时时间为 10 分钟，并发数为 2。

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

```json
{
  "topic": "审查当前 Auth 模块的安全性",
  "files": ["src/auth/AuthService.ts", "src/auth/jwt.ts"],
  "mode": "collaborative",
  "context": "重点关注 Token 泄露风险和过期处理"
}
```

话题: "应该用 REST API 还是 GraphQL？"
```

### 架构设计评审

```
话题: "微服务架构 vs 单体架构，哪个更适合我们的项目？"
```

### 代码审查辩论

```
话题: "这段代码的重构方案A和方案B，哪个更好？"
```

## 🔧 开发

```bash
# 克隆仓库
git clone https://github.com/yourusername/opencode-group-discuss
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
