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

## 核心架构

### 1. DiscussionEngine
引擎主类，负责：
- 维护讨论状态 (`IDiscussionState`)
- 执行 Run Loop (`runRound`)
- 生成最终结论 (`generateConclusion`)
- 统一错误处理 (`DiscussionError` with `code/cause`)

### 2. ResourceController (Dispatcher)
负责并发任务管理：
- `dispatch()`: 包装任务，注入 `AbortSignal`，处理超时
- `shutdown()`: 双阶段停机
    1. **Reject New**: 拒绝新任务 (`E_SHUTTING_DOWN`)
    2. **Drain**: 等待 `onIdle()` (默认 30s 超时)
    3. **Cleanup**: 强制 abort 剩余任务

### 3. Graceful Shutdown 生命周期
当用户调用 `stop()` 或系统退出时：
1. `DiscussionEngine.stop()` 触发 `abortController.abort()`。
2. 运行中的任务接收到 signal，尽快清理退出。
3. `run().finally` 块调用 `cleanup()`。
4. `cleanup()` 调用 `ResourceController.shutdown({ awaitIdle: true })`，等待队列排干。
5. 删除所有子 Session。

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
