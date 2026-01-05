import type {
  DiscussionConfig,
  DiscussionMessage,
  DiscussionParticipant,
  DiscussionResult,
} from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import * as fs from "fs";
import * as path from "path";

export class Discussion {
  private config: DiscussionConfig;
  private messages: DiscussionMessage[] = [];
  private currentRound = 0;
  private startTime = 0;
  private client: any;
  private sessionID?: string;
  private logger: Logger;

  private readonly CONCURRENCY_LIMIT = 5;
  private readonly COMPRESSION_THRESHOLD = 15;

  private participantByName: Map<string, DiscussionParticipant>;
  private agentSessionIDs: Map<string, string> = new Map();
  private createdSessionIDs: Set<string> = new Set();

  constructor(config: DiscussionConfig, client: any, sessionID?: string, logger?: Logger) {
    this.config = config;
    this.client = client;
    this.sessionID = sessionID;
    this.logger = logger || new Logger(client);

    const participants = (config.participants || []).length
      ? config.participants!
      : (config.agents || []).map((name) => ({
          name,
          subagentType: name,
        }));

    this.participantByName = new Map(
      participants.map((p) => [p.name, p] as const)
    );
  }

  async start(): Promise<DiscussionResult> {
    this.startTime = Date.now();
    await this.logger.info(`🚀 动态群聊启动：${this.config.topic}`);

    try {
      for (let round = 1; round <= this.config.maxRounds; round++) {
        this.currentRound = round;
        await this.runRound();
        if (await this.config.mode.shouldStop(this.messages, this.currentRound)) break;
      }

      const conclusion = await this.config.mode.generateConclusion(
        this.messages,
        this.config.topic
      );

      return {
        topic: this.config.topic,
        messages: this.messages,
        conclusion,
        consensus: this.config.mode.calculateConsensus(this.messages),
        rounds: this.currentRound,
        duration: Date.now() - this.startTime,
        createdSessionIDs: Array.from(this.createdSessionIDs),
      };
    } finally {
      await this.cleanup();
    }
  }

  private async runRound(): Promise<void> {
    const speakers = await this.config.mode.getSpeakers(
      this.currentRound,
      this.config.maxRounds,
      this.config.agents
    );
    
    const roundContext = await this.buildContext();
    const results: (DiscussionMessage | null)[] = [];

    for (let i = 0; i < speakers.length; i += this.CONCURRENCY_LIMIT) {
      const chunk = speakers.slice(i, i + this.CONCURRENCY_LIMIT);
      const tasks = chunk.map(async (name) => {
        try {
          const participant =
            this.participantByName.get(name) ||
            ({ name, subagentType: "general" } as DiscussionParticipant);

          const prompt = this.buildPromptForAgent(name, participant, roundContext);
          
          // Get dedicated session ID for this agent
          const agentSessionID = await this.getAgentSessionID(name);
          if (!agentSessionID) {
            throw new Error(`无法获取可用的 session（agent=${name}）`);
          }
          const content = await this.invokeDirect(participant.subagentType, prompt, agentSessionID);

          return {
            agent: name,
            content,
            round: this.currentRound,
            timestamp: Date.now(),
          };
        } catch (e) {
          await this.logger.error(`Error in agent execution for ${name}:`, e);
          return null;
        }
      });

      results.push(...(await Promise.all(tasks)));
    }

    for (const res of results) {
      if (res) {
        this.messages.push(res);
        await this.logger.info(`[@${res.agent}]: ${res.content}`);
      }
    }
  }

  private async buildContext(): Promise<string> {
    // 首轮：注入背景 + 参与成员清单 + 参考文件
    if (this.messages.length === 0) {
      let initialContext = "【讨论背景】\n";
      initialContext += `话题: ${this.config.topic}\n`;

      if (this.config.context) {
        initialContext += `补充背景: ${this.config.context}\n`;
      }

      const participants = Array.from(this.participantByName.values());
      if (participants.length) {
        initialContext += "\n【参与成员】\n";
        for (const p of participants) {
          const role = p.role ? ` | role=${p.role}` : "";
          initialContext += `- @${p.name} | subagent_type=${p.subagentType}${role}\n`;
        }
      }

      if (this.config.files && this.config.files.length > 0) {
        initialContext += "\n【参考文件内容】\n";
        for (const file of this.config.files) {
          try {
            const resolved = path.isAbsolute(file)
              ? file
              : path.resolve(process.cwd(), file);
            const content = fs.readFileSync(resolved, "utf-8");
            initialContext += `\n--- 文件: ${file} ---\n${content}\n`;
          } catch (e) {
            await this.logger.warn(`无法读取文件 ${file}: ${this.formatError(e)}`);
          }
        }
      }

      return initialContext;
    }

    if (this.messages.length > this.COMPRESSION_THRESHOLD) {
      return await this.summarizeHistory();
    }

    return this.messages
      .map((m) => `Round ${m.round} | @${m.agent}: ${m.content}`)
      .join("\n\n");
  }

  private buildPromptForAgent(
    name: string,
    participant: DiscussionParticipant,
    context: string
  ): string {
    const isCollab = String(this.config.mode?.constructor?.name || "").includes(
      "Collaborative"
    );

    const roleText = participant.role
      ? participant.role
      : `（该参与者未提供 role；当前使用 subagent_type=${participant.subagentType}）`;

    return `
# 任务：多 Agent 群聊讨论
你现在是 @${name}
subagent_type: ${participant.subagentType}
职责: ${roleText}

话题: ${this.config.topic}

## 历史回顾
${context}

## 你的任务
1. ${isCollab
      ? "请基于你的职责，补充/完善方案，给出具体接口/步骤/风险与对策。"
      : "请基于你的职责提出观点，并对其他成员的观点做回应（可反驳/补充）。"}
2. 保持简洁，200 字以内。
`;
  }

  private async invokeDirect(name: string, prompt: string, targetSessionID?: string): Promise<string> {
    const sessionID = targetSessionID || this.sessionID;

    if (!sessionID) {
      throw new Error(`Missing sessionID for agent ${name}`);
    }

    // 使用 client.session.prompt (Direct SDK call)
    if (this.client?.session?.prompt) {
      try {
        await this.logger.debug(`Invoking agent ${name} via session.prompt`, { sessionID });
        
        // SDK 正确格式: { body: { parts, agent }, path: { id } }
        const res = await this.client.session.prompt({
          body: {
            parts: [{ type: "text", text: prompt }],
            agent: name,
          },
          path: {
            id: sessionID,
          },
        });
        
        return this.extractTextFromResponse(res);
      } catch (err) {
        const message = this.formatError(err);
        await this.logger.warn(`session.prompt failed for agent ${name}: ${message}`);
        throw err;
      }
    }

    // Fallback for client.prompt (if available and session.prompt is not)
    if (this.client?.prompt) {
      try {
        const res = await this.client.prompt({
          body: {
            parts: [{ type: "text", text: prompt }],
            agent: name,
          },
          path: {
            id: sessionID,
          },
        });
        return this.extractTextFromResponse(res);
      } catch (err) {
        throw err;
      }
    }

    throw new Error(`OpenCode client prompt function not available for agent ${name}`);
  }

  /**
   * 从 SDK 响应中提取文本内容
   * 处理不同版本 SDK 的响应格式差异
   */
  private extractTextFromResponse(res: any): string {
    // 尝试多种可能的响应格式
    if (typeof res === "string") return res;
    
    // SDK 可能返回 { data: { info, parts } } 或直接返回对象
    const data = res?.data || res;
    
    // 检查是否有 parts 数组
    if (data?.parts && Array.isArray(data.parts)) {
      const textPart = data.parts.find((p: any) => p.type === "text");
      if (textPart?.text) return textPart.text;
    }
    
    // 检查直接的 text 属性
    if (data?.text) return data.text;
    if (res?.text) return res.text;
    
    // 检查 info.content
    if (data?.info?.content) return data.info.content;
    
    return "...";
  }

  private async getAgentSessionID(name: string): Promise<string | undefined> {
    // If we already have a session for this agent, return it
    if (this.agentSessionIDs.has(name)) {
      return this.agentSessionIDs.get(name);
    }

    // Attempt to create a new session
    if (this.client?.session?.create && this.sessionID) {
      try {
        const res = await this.client.session.create({
          parentID: this.sessionID,
          title: `Discussion Agent: ${name}`,
        });
        // 处理不同的 SDK 响应格式
        // SDK 可能返回 Session 对象或 { data: Session } 结构
        const session = res?.data || res;
        const newSessionID = session?.id;
        if (newSessionID) {
          await this.logger.debug(`Created sub-session for agent ${name}: ${newSessionID}`);
          this.agentSessionIDs.set(name, newSessionID);
          this.createdSessionIDs.add(newSessionID);
          return newSessionID;
        }
      } catch (e) {
        const message = this.formatError(e);
        await this.logger.warn(`Failed to create sub-session for agent ${name}, falling back to root session. Error: ${message}`);
      }
    }

    // Fallback: use root session
    return this.sessionID;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private async summarizeHistory(): Promise<string> {
    const history = this.messages
      .map((m) => `@${m.agent}: ${m.content}`)
      .join("\n");

    const prompt = `总结论点：\n${history}`;

    // 直接使用 invokeDirect 调用 summarizer agent
    return await this.invokeDirect("summarizer", prompt);
  }

  private async cleanup(): Promise<void> {
    if (this.config.keepSessions) {
      await this.logger.info("keep_sessions=true, 跳过清理。子会话列表已保留在返回结果中。");
      return;
    }

    if (this.createdSessionIDs.size === 0) return;

    await this.logger.info(`开始清理 ${this.createdSessionIDs.size} 个临时子会话...`);
    
    // 如果 client.session.delete 不可用，无法清理
    if (!this.client?.session?.delete) {
      await this.logger.warn("client.session.delete API 不可用，无法清理临时子会话。");
      return;
    }

    const tasks = Array.from(this.createdSessionIDs).map(async (id) => {
      try {
        await this.client.session.delete({
          path: { id }
        });
        await this.logger.debug(`已删除临时 session: ${id}`);
      } catch (e) {
        // 删除失败只记录警告，不阻断
        await this.logger.warn(`删除临时 session ${id} 失败: ${this.formatError(e)}`);
      }
    });

    await Promise.all(tasks);
    await this.logger.info("临时子会话清理完成");
  }
}
