# 开发文档

## 项目状态

✅ **MVP 已完成！**

- [x] 核心讨论引擎
- [x] Debate 模式实现
- [x] group_discuss 工具
- [x] TypeScript 编译通过
- [x] 基础功能测试通过

## 项目结构

```
opencode-group-discuss/
├── src/
│   ├── index.ts                 # 插件入口
│   ├── core/
│   │   └── Discussion.ts        # 讨论引擎
│   ├── modes/
│   │   └── DebateMode.ts        # 辩论模式
│   ├── tools/
│   │   └── group-discuss.ts     # 自定义工具
│   ├── types/
│   │   └── index.ts             # 类型定义
│   └── utils/                   # 工具函数（待扩展）
├── templates/
│   └── opencode.example.json    # 示例配置
├── dist/                        # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **TypeScript** 5.3.0
- **Bun** - 包管理和运行时
- **@opencode-ai/plugin** ^1.0.0 - OpenCode 插件 API

## 本地开发

### 安装依赖

```bash
bun install
```

### 开发模式

```bash
bun run dev
```

### 编译构建

```bash
bun run build
```

### 运行测试

```bash
bun test.js
```

## 核心功能

### 1. Discussion 类

负责管理整个讨论流程：

- 多轮讨论执行
- Agent 调用管理
- Context 构建
- 结果生成

### 2. DebateMode 类

实现 MAD 风格的辩论模式：

- 正反方辩论
- 裁判总结
- 共识度计算

### 3. group_discuss 工具

OpenCode 自定义工具，支持：

- 话题指定
- Agents 选择
- 轮数配置
- 详细程度控制

## 待实现功能

### Phase 2（可选）

- [ ] BrainstormMode - 头脑风暴模式
- [ ] ConsensusMode - 共识寻求模式
- [ ] discussion_status 工具 - 查看讨论状态
- [ ] 真实的 OpenCode client 集成（目前使用模拟数据）
- [ ] Context 压缩机制
- [ ] 讨论历史持久化

### Phase 3（可选）

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 更丰富的配置选项
- [ ] 文档完善

## 集成 OpenCode

### 方法 1：本地开发测试

1. 在 OpenCode 项目中创建 `.opencode/plugin/` 目录
2. 复制编译后的 `dist/` 内容到该目录
3. 配置 agents（参考 `templates/opencode.example.json`）

### 方法 2：npm 包（推荐生产）

1. 发布到 npm：
   ```bash
   npm publish
   ```

2. 在 `opencode.json` 中配置：
   ```json
   {
     "plugin": ["opencode-group-discuss"]
   }
   ```

## 重要说明

### 模拟数据

⚠️ **当前版本使用模拟数据进行 agent 响应**

在 `src/core/Discussion.ts` 的 `simulateAgentResponse()` 方法中：

```typescript
// TODO: 实际调用
// const response = await this.client.chat({
//   message: prompt,
//   agent: agentName,
//   stream: false,
// });
// return response.text;

// 模拟响应（用于开发测试）
return this.simulateAgentResponse(agentName, context);
```

在实际部署时，需要：
1. 移除 `simulateAgentResponse()` 方法
2. 取消注释真实的 client.chat 调用
3. 确保 client 正确传递

### OpenCode Plugin API

参考官方文档：
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/custom-tools/
- https://opencode.ai/docs/agents/

## 调试技巧

### 查看日志

所有 console.log 输出会在 OpenCode 终端显示：

```typescript
console.log("[GroupDiscuss] 调试信息");
```

### 检查编译结果

```bash
cat dist/index.js
```

### 验证 TypeScript 类型

```bash
bunx tsc --noEmit
```

## 常见问题

### Q: 编译错误 "tsc: command not found"

A: 使用 `bunx tsc` 代替 `tsc`

### Q: 如何修改 agent 行为？

A: 修改 `templates/opencode.example.json` 中的 prompt

### Q: 如何添加新的讨论模式？

A: 
1. 创建新的 Mode 类（参考 DebateMode）
2. 实现 DiscussionMode 接口
3. 在 `group-discuss.ts` 中注册

## 发布清单

发布到 npm 前确保：

- [ ] 所有测试通过
- [ ] README 完善
- [ ] 版本号更新
- [ ] CHANGELOG 更新
- [ ] 移除模拟数据
- [ ] 集成测试通过
- [ ] 文档审查

## 许可证

MIT License - 详见 LICENSE 文件
