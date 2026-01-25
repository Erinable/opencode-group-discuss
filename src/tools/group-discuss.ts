/**
 * group_discuss tool - start a multi-agent group discussion
 */

import { tool } from "@opencode-ai/plugin";
import { Discussion } from "../core/Discussion.js";
import { DebateMode } from "../modes/DebateMode.js";
import { CollaborativeMode } from "../modes/CollaborativeMode.js";
import type { DiscussionResult } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { scrubString, truncateString } from "../utils/Sanitizer.js";
import { getConfigLoader } from "../config/ConfigLoader.js";
import type { DiscussionPreset } from "../config/schema.js";
import { buildDiagnoseClientInfo, buildDiagnoseEnvInfo } from "./diagnose.js";
import * as fs from "fs";
import * as path from "path";

const MAX_ERROR_CHARS = 1024;

export function createGroupDiscussTool(client: any, projectRoot?: string): any {
  return tool({
    description: `启动多 Agent 群聊讨论（支持已注册 agent 与临时参与者）。

适用场景：
- 技术方案选型（REST vs GraphQL 等）
- 代码架构设计评审
- 多角度分析复杂问题
- 团队决策辅助

讨论模式：
- debate: 辩论模式（强调对抗/质疑，最后给裁决/结论）
- collaborative: 协作模式（强调补充/完善，输出共识方案）

⚠️ 关键用法（避免 LLM 误用）：
- 如果你要调用 opencode.json 里已注册的 subagent（有专属 prompt/model/tools），用 agents。
- 如果你需要 Frontend/Backend/PM 这类“临时角色”，用 participants，并显式指定 subagent_type。
- participants[].subagent_type 必须是 OpenCode 已注册的 agent key（例如 advocate/critic/moderator/summarizer 或内置 general/explore）。

示例：
1) 全注册：{ "topic": "...", "agents": ["advocate","critic","moderator"], "mode": "debate", "rounds": 3 }
2) 全临时：{ "topic": "...", "participants": [{"name":"Frontend","subagent_type":"explore","role":"..."}], "mode": "collaborative" }
3) 混合：同时传 agents + participants（同名时 participants 覆盖）

提示：传 help=true 可返回此说明。

⚠️ 资源管理说明：
默认情况下（keep_sessions=false），讨论结束后会自动删除创建的临时子会话，以避免服务端资源累积。
如果你需要调试或保留子会话历史，请设置 keep_sessions=true。
保留的子会话可以使用 'session_manage' 工具进行查看和清理。`,

    args: {
      topic: tool.schema
        .string()
        .describe("讨论话题，例如：'应该用 PostgreSQL 还是 MySQL？'"),

      preset: tool.schema
        .string()
        .optional()
        .describe("使用预设配置名称（定义在 group-discuss.json 的 presets 中）。预设会提供 agents/participants/mode/rounds 等默认值，可被其他参数覆盖。"),

      help: tool.schema
        .boolean()
        .default(false)
        .describe("返回工具用法说明（不实际启动讨论）"),

      diagnose: tool.schema
        .boolean()
        .default(false)
        .describe("诊断模式：检查 client 配置和授权状态（不启动讨论）"),

      agents: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "参与讨论的已注册 agent key 列表（必须存在于 opencode.json.agent）。如果你需要临时角色请用 participants。若不指定且未提供 participants，则使用默认辩论三人组。"
        ),

      participants: tool.schema
        .array(
          tool.schema.object({
            name: tool.schema.string().describe("在群聊中显示的名字"),
            subagent_type: tool.schema
              .string()
              .default("general")
              .describe("要调用的 subagent 类型（必须是 OpenCode 已注册的 agent key）"),
            role: tool.schema
              .string()
              .optional()
              .describe("该参与者在本次讨论中的职责描述，用于 prompt 注入"),
          })
        )
        .optional()
        .describe(
          "临时参与者列表（无需写入 opencode.json）。可与 agents 同时使用；同名时以 participants 覆盖。"
        ),

      mode: tool.schema
        .enum(["debate", "collaborative"])
        .default("debate")
        .describe("讨论模式：debate=辩论模式，collaborative=协作模式"),

      rounds: tool.schema
        .number()
        .default(3)
        .describe("讨论轮数，默认3轮，范围1-10"),

      context: tool.schema
        .string()
        .optional()
        .describe("补充背景信息，例如：'该项目目前正处于重构阶段'"),

      files: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("讨论相关的参考文件路径列表，框架会自动读取内容并提供给 Agent"),

      verbose: tool.schema
        .boolean()
        .default(true)
        .describe("是否详细输出讨论过程，false则只显示结论"),

      keep_sessions: tool.schema
        .boolean()
        .default(false)
        .describe("调试用：是否保留本次讨论创建的子会话（默认自动清理）"),
    },

    async execute(args, context) {
      const {
        topic,
        preset,
        help,
        diagnose,
        agents: argsAgents,
        participants: argsParticipants,
        mode: argsMode,
        rounds: argsRounds,
        verbose: argsVerbose,
        context: extraContext,
        files: argsFiles,
        keep_sessions: argsKeepSessions,
      } = args;
      // ToolContext 只包含 sessionID, messageID, agent, abort
      const { sessionID } = context;
      // 加载配置文件
      const configLoader = getConfigLoader(projectRoot);
      const config = await configLoader.loadConfig();
      const defaults = config.defaults;

      const forceDebugLevel = !!(config.debug.log_prompts || config.debug.log_context || config.debug.log_compaction);
      const effectiveLevel = forceDebugLevel ? "debug" : config.logging.level;

      const logger = new Logger(client, "group-discuss", {
        logging: {
          level: effectiveLevel,
          consoleEnabled: config.logging.console_enabled,
          fileEnabled: config.logging.file_enabled,
          filePath: config.logging.file_path,
          includeMeta: config.logging.include_meta,
          maxEntryChars: config.logging.max_entry_chars,
          maxMetaChars: config.logging.max_meta_chars,
        },
        debug: {
          logPrompts: config.debug.log_prompts,
          logContext: config.debug.log_context,
          logCompaction: config.debug.log_compaction,
        },
      });

      // 如果指定了 preset，加载预设配置
      let presetConfig: DiscussionPreset | undefined;
      if (preset) {
        presetConfig = await configLoader.getPreset(preset);
        if (!presetConfig) {
          const availablePresets = await configLoader.getPresetNames();
          return `❌ 预设 "${preset}" 不存在。\n\n可用预设：${availablePresets.length > 0 ? availablePresets.join(', ') : '（无）'}\n\n请在 .opencode/group-discuss.json 或 ~/.config/opencode/group-discuss.json 中定义预设。`;
        }
      }

      // 合并参数优先级：显式参数 > 预设 > 配置默认值
      const agents = argsAgents ?? presetConfig?.agents;
      const participants = argsParticipants ?? presetConfig?.participants?.map(p => ({
        name: p.name,
        subagent_type: p.subagent_type,
        role: p.role,
      }));
      const mode = argsMode ?? presetConfig?.mode ?? defaults.mode;
      const rounds = argsRounds ?? presetConfig?.rounds ?? defaults.rounds;
      const verbose = argsVerbose ?? defaults.verbose;
      const files = argsFiles ?? presetConfig?.files;
      const keep_sessions = argsKeepSessions ?? defaults.keep_sessions;
      const mergedContext = [presetConfig?.context, extraContext].filter(Boolean).join('\n\n') || undefined;

      await logger.info("启动讨论工具", {
        topic,
        preset,
        mode,
        rounds,
        verbose,
        sessionID,
      });
      await logger.info(`话题: ${topic}`, { topic });
      await logger.info(`模式: ${mode}, 轮数: ${rounds}${preset ? `, 预设: ${preset}` : ''}`, { mode, rounds, preset });

      if (help) {
        const root = projectRoot ?? getConfigLoader().getProjectRoot();
        const known = Array.from(loadKnownAgentIDs(root)).sort().join(", ");
        const presetNames = await configLoader.getPresetNames();
        const presetsInfo = presetNames.length > 0 
          ? `可用预设：${presetNames.join(', ')}`
          : '可用预设：（无，请在 .opencode/group-discuss.json 中定义）';
        return `
## group_discuss 用法

已注册 subagent_type 列表（从 opencode.json 读取 + 内置兜底）：
${known}

${presetsInfo}

### 0) 使用预设（推荐）

通过 preset 参数快速复用预定义配置：

\`\`\`json
{
  "topic": "...",
  "preset": "tech-review"
}
\`\`\`

预设在 .opencode/group-discuss.json 或 ~/.config/opencode/group-discuss.json 中定义。

### 1) 全注册 subagent

参数：
- \`agents\`：填写 opencode.json 里已注册的 agent key（如 \`advocate\`/\`critic\`/\`moderator\`/\`summarizer\`）

示例：
\`\`\`json
{
  "topic": "...",
  "agents": ["advocate", "critic", "moderator"],
  "mode": "debate",
  "rounds": 3,
  "verbose": true
}
\`\`\`

### 2) 全临时参与者（Frontend/Backend/PM 等）

参数：
- \`participants\`：每个对象必须包含 \`name\` + \`subagent_type\`（承载该临时角色的已注册 agent key）

示例：
\`\`\`json
{
  "topic": "...",
  "participants": [
    {"name": "Frontend", "subagent_type": "explore", "role": "关注交互与字段"},
    {"name": "Backend", "subagent_type": "explore", "role": "关注API与数据模型"},
    {"name": "PM", "subagent_type": "general", "role": "关注目标与排期"}
  ],
  "mode": "collaborative",
  "rounds": 2
}
\`\`\`

### 3) 混合（agents + participants 同时存在）
- 两者合并；同名时 participants 覆盖。

提示：参数 agents 只接受已注册 subagent key。如果你需要临时角色（例如 Frontend/Backend/temp_advocate），请使用 participants 并显式指定 subagent_type。
`;
      }

      // 诊断模式：检查 client 配置和授权状态
      if (diagnose) {
        const clientInfo = await buildDiagnoseClientInfo(client, sessionID);
        const envInfo = buildDiagnoseEnvInfo();

        return `## group_discuss 诊断报告

### Client 信息
\`\`\`json
${JSON.stringify(clientInfo, null, 2)}
\`\`\`

### 环境变量
\`\`\`json
${JSON.stringify(envInfo, null, 2)}
\`\`\`

### 诊断说明
- 如果 testCall.hasError 为 true 且 message 包含 "Unauthorized"，说明 client 没有正确的认证信息
- 这是 OpenCode Desktop 的已知 bug (Issue #8676)
- 临时解决方案：使用 CLI 版本 \`opencode\` 代替 Desktop 版本
`;
      }

      try {
        // 检查 client 能力：至少需要 prompt 或 callTool
        const hasPrompt = !!client?.session?.prompt;
        const hasCallTool = typeof (client as any)?.callTool === "function";
        if (!hasPrompt && !hasCallTool) {
          const msg = "client.session.prompt 和 client.callTool 均不可用";
          await logger.error(msg, undefined, {
            topic,
            mode,
            rounds,
            sessionID,
            hasClient: !!client,
            clientKeys: client ? Object.keys(client) : [],
            hasSession: !!client?.session,
            sessionKeys: client?.session ? Object.keys(client.session) : [],
          });
          return `❌ 无法启动讨论：${msg}`;
        }

        // sessionID：Task 子代理要求以 ses 开头；若缺失则生成一个
        const rootSessionID = sessionID
          ? sessionID.startsWith("ses")
            ? sessionID
            : `ses_${sessionID}`
          : `ses_group_discuss_${Date.now()}`;
        if (!sessionID) {
          await logger.warn("sessionID 缺失，已生成临时 sessionID", {
            rootSessionID,
            topic,
          });
        }

      const knownAgentIDs = loadKnownAgentIDs(projectRoot ?? configLoader.getProjectRoot());
        const knownList = Array.from(knownAgentIDs).sort().join(", ");

        // agents：仅允许已注册 agent key；若未传且 participants 存在，则不注入默认辩论三人组
        const inputAgentIDs: string[] = Array.isArray(agents)
          ? agents
          : participants && Array.isArray(participants) && participants.length > 0
            ? []
            : getDefaultAgents(mode);

        if (Array.isArray(agents) && agents.length > 0) {
          const unknown = agents.filter((id) => !knownAgentIDs.has(id));
          if (unknown.length > 0) {
            return `❌ 参数错误：agents 只支持已注册的 subagent key。\n\n` +
              `检测到未注册 agents：${unknown.join(", ")}\n\n` +
              `可用 subagent key：${knownList}\n\n` +
              `如果你想用 Frontend/Backend/temp_advocate 这类临时角色，请改用 participants 并显式指定 subagent_type。`;
          }
        }

        // participants：subagent_type 必须是已注册 agent key
        const tempConfigs =
          participants && Array.isArray(participants)
            ? participants.map((p: any) => ({
                name: String(p.name),
                subagentType: String(p.subagent_type ?? "general"),
                role: p.role ? String(p.role) : undefined,
              }))
            : [];

        const invalidParticipantTypes = tempConfigs
          .map((p: any) => p.subagentType)
          .filter((t: string) => !knownAgentIDs.has(t));

        if (invalidParticipantTypes.length > 0) {
          const uniq = Array.from(new Set(invalidParticipantTypes));
          return `❌ 参数错误：participants[].subagent_type 必须是已注册的 subagent key。\n\n` +
            `检测到未注册 subagent_type：${uniq.join(", ")}\n\n` +
            `可用 subagent key：${knownList}`;
        }

        // 参与者来源：agents（已注册 agent ID） + participants（临时角色）可同时存在
        const registeredConfigs = inputAgentIDs.map((id: string) => ({
          name: id,
          subagentType: id,
          role: undefined,
        }));

        // 去重：同名时以 participants 覆盖（更显式）
        const byName = new Map<string, any>();
        const order: string[] = [];

        for (const p of registeredConfigs) {
          if (!p?.name) continue;
          if (!byName.has(p.name)) order.push(p.name);
          byName.set(p.name, p);
        }
        for (const p of tempConfigs) {
          if (!p?.name) continue;
          if (!byName.has(p.name)) order.push(p.name);
          byName.set(p.name, p);
        }

        const participantConfigs = order.map((name) => byName.get(name)).filter(Boolean);

        const participantNames = participantConfigs.map((p: any) => p.name);
        if (participantNames.length === 0) {
          return `❌ 无法启动讨论：未提供有效的参与者或 agents。\n\n请至少提供一个 agents 或 participants。\n可用 subagent_type：${knownList}`;
        }

        await logger.debug(`参与 members: ${participantNames.join(", ")}`, {
          participants: participantConfigs,
        });

        // 创建讨论实例
        // 注意：ToolContext 不包含 callTool，我们只使用 client 的标准 API
        // agents 应该传已注册的 agent key 列表（inputAgentIDs），而不是参与者显示名称
        const discussion = new Discussion(
          {
            topic,
            agents: inputAgentIDs,
            participants: participantConfigs,
            mode: getModeInstance(mode),
            maxRounds: rounds,
            verbose,
            context: mergedContext,
            files,
            keepSessions: keep_sessions,
          },
          client,
          rootSessionID,
          logger
        );

        // 启动讨论
        const result: DiscussionResult = await discussion.start();

        // 格式化输出结果
        return formatDiscussionResult(result, verbose, keep_sessions);
      } catch (error) {
        await logger.error("讨论过程发生错误", error, {
          topic,
          mode,
          rounds,
          agents: agents || getDefaultAgents(mode),
          sessionID,
        });
        const rawMessage = error instanceof Error ? error.message : String(error);
        const safeMessage = truncateString(scrubString(rawMessage), MAX_ERROR_CHARS);
        return `❌ 讨论过程发生错误: ${safeMessage}`;
      }
    },
  });
}

/**
 * 根据模式获取默认 agents
 */
function getDefaultAgents(mode: string): string[] {
  switch (mode) {
    case "debate":
      return ["advocate", "critic", "moderator"];
    default:
      return ["advocate", "critic", "moderator"];
  }
}

/**
 * 获取讨论模式实例
 */
function getModeInstance(modeName: string) {
  switch (modeName) {
    case "debate":
      return new DebateMode();
    case "collaborative":
      return new CollaborativeMode();
    default:
      return new DebateMode();
  }
}

function loadKnownAgentIDs(projectRoot: string): Set<string> {
  // 兜底：general/explore 通常为内置类型
  const ids = new Set<string>(["general", "explore"]);

  // 尝试从项目根目录加载 opencode.json 的 agent keys
  try {
    const configPath = path.resolve(projectRoot, "opencode.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      const agent = parsed?.agent;
      if (agent && typeof agent === "object") {
        for (const key of Object.keys(agent)) {
          ids.add(key);
        }
      }
    }
  } catch {
    // ignore
  }

  return ids;
}

/**
 * 格式化讨论结果
 */
function formatDiscussionResult(
  result: DiscussionResult,
  verbose: boolean,
  keepSessions?: boolean
): string {
  const { topic, messages, conclusion, consensus, rounds, duration } = result;

  let output = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `✅ 讨论完成：${topic}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 统计信息
  output += `📊 讨论统计：\n`;
  output += `   轮数: ${rounds}\n`;
  output += `   消息数: ${messages.length}\n`;
  output += `   共识度: ${(consensus * 100).toFixed(0)}%\n`;
  output += `   耗时: ${(duration / 1000).toFixed(1)}秒\n\n`;

  // 结论
  output += `🎯 讨论结论：\n`;
  output += conclusion;
  if (result.terminationReason) {
    output += `\n*(终止原因: ${result.terminationReason})*\n`;
  }
  output += `\n\n`;

  // 错误信息
  if (result.errors && result.errors.length > 0) {
    output += `❌ 讨论过程中出现错误：\n`;
    for (const err of result.errors) {
      const agentInfo = err.agent ? `@${err.agent} ` : "";
      const roundInfo = err.round ? `(Round ${err.round}) ` : "";
      const codeInfo = err.code ? `[${err.code}] ` : "";
      output += `- ${agentInfo}${roundInfo}${codeInfo}${err.message}\n`;
    }
    output += `\n`;
  }

  // 如果需要详细输出，添加完整对话记录
  if (verbose) {
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    output += `📝 完整对话记录\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let currentRound = 0;
    for (const msg of messages) {
      if (msg.round !== currentRound) {
        currentRound = msg.round;
        output += `\n━━━━━━ Round ${currentRound}/${rounds} ━━━━━━\n\n`;
      }
      output += `🤖 @${msg.agent}:\n${msg.content}\n\n`;
    }
  }

  // 如果保留了子会话，输出 ID 列表方便后续清理
  if (keepSessions && result.createdSessionIDs && result.createdSessionIDs.length > 0) {
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    output += `🐛 Debug: 已保留子会话 (可使用 session_manage 清理)\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    output += result.createdSessionIDs.map((id) => `- ${id}`).join("\n");
    output += `\n\n`;
  }

  return output;
}
