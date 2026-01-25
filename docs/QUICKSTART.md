# 快速开始指南

## 🚀 5分钟上手

### 1. 安装插件

```bash
npm install -g opencode-group-discuss
```

### 2. 配置 Agents

在你的项目根目录创建 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  
  "agent": {
    "advocate": {
      "description": "倡导者",
      "mode": "subagent",
      "prompt": "你是正方，提出并支持观点。",
      "temperature": 0.7
    },
    "critic": {
      "description": "批评者",
      "mode": "subagent",
      "prompt": "你是反方，质疑和挑战观点。",
      "temperature": 0.6
    },
    "moderator": {
      "description": "裁判",
      "mode": "subagent",
      "prompt": "你是裁判，综合评估并裁决。",
      "temperature": 0.3
    }
  },
  
  "plugin": ["opencode-group-discuss"]
}
```

### 3. 使用

在 OpenCode 中：

```
你: 我想讨论一下数据库选型，PostgreSQL vs MySQL

AI: 我来组织一个讨论
    [调用 group_discuss 工具]
    
    💬 群聊讨论开始...
    ━━━━━━ Round 1/3 ━━━━━━
    🤖 @advocate: ...
    🤖 @critic: ...
    
    ✅ 结论: PostgreSQL
```

## 💡 示例场景

### 技术选型

```
话题: "REST API vs GraphQL"
```

### 架构设计

```
话题: "微服务 vs 单体架构"
```

### 代码审查

```
话题: "这段代码的两种重构方案哪个更好？"
```

## ⚙️ 高级配置

### 自定义轮数

```json
{
  "rounds": 5
}
```

### 简洁输出

```json
{
  "verbose": false
}
```

### 自定义 Agents

```json
{
  "agents": ["tech-lead", "security-expert", "performance-expert"]
}
```

## 🆘 获取帮助

- GitHub Issues: https://github.com/yourusername/opencode-group-discuss/issues
- 文档: README.md
- 开发指南: DEVELOPMENT.md

## 📄 许可证

MIT License
