# Config Reference

本插件支持通过 JSON/JSONC 配置文件设置默认参数、预设、共识/终止策略、上下文预算、日志与调试开关。

---

## 1) 配置文件位置与优先级

按优先级从高到低：

1. 项目级：`<projectRoot>/.opencode/group-discuss.json`
2. 全局级：`~/.config/opencode/group-discuss.json`

合并规则：项目级覆盖全局级同名字段；不存在则回退到内置默认值。

### JSONC 支持

配置文件支持 JSONC：允许 `//` 单行注释与 `/* ... */` 多行注释。

如果配置文件 JSON 解析失败，插件会打印 warning 并忽略该文件（退回空配置）。

---

## 2) 执行时参数优先级（非常重要）

当你调用 `group_discuss` 时，最终参数按优先级合并：

1. 显式参数（本次调用传入）
2. `preset`（如果指定）
3. `defaults`（配置文件默认）
4. 内置默认值

一些字段还有额外合并语义：

- `context`：会把 `preset.context` 与本次调用 `context` 拼接（中间用空行分隔）。
- `presets`：同名 preset 会跨文件逐字段合并（全局→项目级覆盖）。

说明（当前实现的关键点）：

- `group_discuss` tool 当前会从 `defaults` 读取：`mode`、`rounds`、`verbose`、`keep_sessions`。
- `defaults.timeout/defaults.concurrency/defaults.max_retries` 当前不会被 `group_discuss` tool 读取（等价于未接入）。
  - 这些值在程序化调用/其他入口（或未来版本）可能会接入。
  - 目前 `timeout/concurrency/maxRetries` 会使用 Facade 的默认值（见 `src/core/engine/DiscussionFacade.ts` 的 schema defaults）。

---

## 3) Top-Level 字段说明

配置文件结构（顶层字段）：

- `defaults`：默认值
- `presets`：预设
- `consensus`：共识评估配置
- `termination`：终止条件配置
- `context_budget`：token 预算（推荐）
- `context_compaction`：上下文压缩（可用 auto 由预算推导）
- `logging`：日志
- `debug`：调试开关

参考：`src/config/schema.ts`、`examples/group-discuss.example.jsonc`。

---

## 4) defaults

用于指定调用时的缺省值。

字段：

- `mode`: `debate` | `collaborative`
- `rounds`: number（1-10）
- `timeout`: number（毫秒）
- `concurrency`: number（>=1）
- `verbose`: boolean
- `keep_sessions`: boolean
- `max_retries`: number（>=0）

示例：

```jsonc
{
  "defaults": {
    "mode": "debate",
    "rounds": 3,
    "timeout": 600000,
    "concurrency": 2,
    "verbose": true,
    "keep_sessions": false,
    "max_retries": 3
  }
}
```

---

## 5) presets

预设是一组可复用参数，通过调用参数 `preset: "xxx"` 启用。

字段：

- `agents?: string[]`：已注册 agent key 列表（来自项目根 `opencode.json` 的 `agent` keys + 内置兜底）
- `participants?: { name, subagent_type, role? }[]`：临时参与者（要求 `subagent_type` 也是已注册 agent key）
- `mode?: debate|collaborative`
- `rounds?: number`
- `context?: string`
- `files?: string[]`：参考文件列表（受 sandbox 限制，详见 `ARCHITECTURE.md`）

示例：

```jsonc
{
  "presets": {
    "tech-review": {
      "agents": ["advocate", "critic", "moderator"],
      "mode": "debate",
      "rounds": 3
    },
    "architecture": {
      "participants": [
        { "name": "Architect", "subagent_type": "critic", "role": "系统架构与可用性" },
        { "name": "DBA", "subagent_type": "general", "role": "数据一致性与容量" }
      ],
      "mode": "collaborative",
      "rounds": 5,
      "context": "请输出可落地的约束清单和验收标准"
    }
  }
}
```

合并语义：

- 同名 preset 会按字段合并（后加载的配置覆盖先加载的）。
- `participants`/`agents` 在单个 preset 内是互斥偏好：如果调用时显式传了 `participants`，通常不会再注入默认辩论三人组。

---

## 6) consensus

用于共识评估（收敛/一致性检测）。

- `threshold`: number（0.5-1.0）
- `enable_convergence_analysis`: boolean
- `stalemate_window`: number
- `keyword_weights`: Record<string, number>

`keyword_weights` 会做深合并（全局→项目级叠加）。

---

## 7) termination

用于终止条件（达到高共识、超时、僵局等）。

- `min_confidence`: number（0.5-1.0）
- `enable_stalemate_detection`: boolean
- `stalemate_rounds`: number
- `disabled_conditions`: string[]（数组替换，不做合并）

---

## 8) context_budget（推荐）

用 token 预算描述“注入给模型的上下文”预算，避免手工猜字符数。

- `profile`: `small` | `balanced` | `large`
- `input_tokens`: number
- `min_output_tokens`: number
- `reasoning_headroom_tokens`: number
- `chars_per_token`: number（英文常用 4；CJK 可用 2-3）

派生规则（实现细节）：

- `max_context_chars`：按 `available = input_tokens - min_output_tokens - reasoning_headroom_tokens` 计算，并乘以 `chars_per_token`，且有硬下限（避免过小）。
- `max_message_length`：由 `profile` 推导（small/balanced/large 对应不同上限）。

用 `group_discuss_context` 查看当前生效预算与派生结果。

---

## 9) context_compaction

用于上下文压缩。

- `max_context_chars`: number | `"auto"`
- `compaction_threshold`: number（0-1）
- `max_message_length`: number | `"auto"`
- `preserve_recent_rounds`: number
- `enable_key_info_extraction`: boolean
- `keyword_weights`: Record<string, number>（深合并）
- `include_self_history`: boolean

当 `max_context_chars`/`max_message_length` 为 `"auto"` 时，会由 `context_budget` 推导。

---

## 10) logging

- `level`: `error` | `warn` | `info` | `debug`
- `console_enabled`: boolean
- `file_enabled`: boolean
- `file_path`: string（相对路径基于 `process.cwd()`）
- `include_meta`: boolean
- `max_entry_chars`: number
- `max_meta_chars`: number

Logger 会对 token-like 内容做基础脱敏（Bearer/JWT/sk-*/querystring secret）。

---

## 11) debug

- `log_prompts`: boolean
- `log_context`: boolean
- `log_compaction`: boolean

当任一 debug 开关为 true 时，工具会把有效日志级别提升到 debug（即使 `logging.level` 没设为 debug）。
