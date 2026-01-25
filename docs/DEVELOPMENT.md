# 开发文档

## 项目状态 (v0.3.0)

✅ **Production Ready** - 已完成核心重构，支持 Node 20+ 并发模型与优雅停机。

- [x] **DiscussionEngine**: 核心调度器，支持多 Agent 并发与状态管理
- [x] **ResourceController**: 资源控制器，实现 `p-queue` 并发限制与 Graceful Shutdown
- [x] **Robustness**: 信号合并 (AbortSignal.any)、超时控制、错误码标准化
- [x] **Modes**: Debate (辩论) & Collaborative (协作)
- [x] **Integration**: 真实 Client 调用 (`session.prompt`), Mock 测试覆盖

## 项目结构

```
opencode-group-discuss/
├── src/
│   ├── index.ts                 # 插件入口
│   ├── core/
│   │   ├── Discussion.ts        # 兼容层 (Facade Adapter)
│   │   └── engine/
│   │       ├── DiscussionEngine.ts    # 核心引擎 (Run Loop)
│   │       ├── ResourceController.ts  # 资源调度 (Concurrency/Shutdown)
│   │       ├── DiscussionFacade.ts    # 输入归一化与验证
│   │       └── AgentRegistry.ts       # Agent 配置加载
│   ├── modes/
│   │   ├── DebateMode.ts        # 辩论模式逻辑
│   │   └── CollaborativeMode.ts # 协作模式逻辑
│   ├── tools/
│   │   └── group-discuss.ts     # Tool 定义
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── withRetry.ts         # 指数退避重试
│       └── AsyncFS.ts           # 异步文件操作
├── tests/
│   ├── integration/             # 集成测试 (Mock Client)
│   └── ResourceController.test.js # 单元测试
├── templates/
├── dist/
├── package.json
└── README.md
```

## 技术栈

- **TypeScript** 5.3+
- **Node.js** >= 20.0.0 (Required for `AbortSignal.any`)
- **p-queue**: 并发控制
- **async-retry**: 网络请求重试

## 安全注意事项

- `group_discuss.files` 仅允许读取项目根目录内文件（`realpath` 边界校验，拒绝 symlink 逃逸）。
- 超限会 fail-closed：maxFiles=10、maxBytesPerFile=256KiB、maxTotalBytes=1MiB。
- `group_discuss(diagnose=true)` 的环境变量输出为 `[SET]/[NOT SET]`，不会打印实际值。
- Logger 会对 token-like 内容做基础脱敏；但 debug 模式仍可能包含业务上下文。

## 核心架构

架构与数据流说明已迁移到：

- `ARCHITECTURE.md`

本文件（DEVELOPMENT）聚焦本地开发、调试、发布与贡献工作流，避免与架构文档重复导致过期。

## 错误处理标准

所有错误通过 `DiscussionError` 结构抛出：

| Error Code | 含义 |
|---|---|
| `ETIMEDOUT` | 任务或网络超时 |
| `E_SHUTTING_DOWN` | 引擎正在关闭，拒绝新请求 |
| `ABORT_ERR` | 任务被显式取消 |
| `SHUTDOWN_TIMEOUT` | 停机等待超时，强制清理 |

## 本地开发

### 环境准备
```bash
npm install
```

### 构建
```bash
npm run build
```

### 测试
运行所有测试（单元 + 集成）：
```bash
# 运行单元测试
node tests/ResourceController.test.js

# 运行集成测试
node --test tests/integration/DiscussionEngine.test.js
```

## 待办事项 (Backlog)

- [ ] BrainstormMode 实现
- [ ] ConsensusMode 实现
- [ ] Context 压缩/总结机制优化
- [ ] 更多集成测试场景 (Fault Injection)
