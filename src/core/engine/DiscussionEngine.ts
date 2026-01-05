import { 
  IDiscussionEngine, 
  IDiscussionState, 
  EngineOptions, 
  EngineState,
  IDispatcher
} from './interfaces.js';
import { ResourceController } from './ResourceController.js';
import { DiscussionResult, DiscussionMessage, DiscussionParticipant } from '../../types/index.js';
import { Logger } from '../../utils/Logger.js';
import { AsyncFS } from '../../utils/AsyncFS.js';
import { withRetry } from '../../utils/withRetry.js';
import { DebateMode } from '../../modes/DebateMode.js';
import { CollaborativeMode } from '../../modes/CollaborativeMode.js';
import * as path from 'path';

export class DiscussionEngine implements IDiscussionEngine {
  private options!: EngineOptions;
  private state!: IDiscussionState;
  private logger: Logger;
  private client: any;
  private sessionID: string;
  private dispatcher!: IDispatcher;
  private modeInstance!: any; // DiscussionMode interface

  constructor(client: any, sessionID: string, logger?: Logger) {
    this.client = client;
    this.sessionID = sessionID;
    this.logger = logger || new Logger(client);
  }

  async init(options: EngineOptions): Promise<void> {
    this.options = options;
    this.dispatcher = new ResourceController(options.concurrency || 2);
    
    // Initialize State
    this.state = {
      id: this.sessionID,
      topic: options.topic,
      status: EngineState.PENDING,
      currentRound: 0,
      maxRounds: options.maxRounds,
      messages: [],
      participants: options.participants,
      subSessionIds: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errors: [],
    };

    // Initialize Mode
    this.modeInstance = this.getModeInstance(options.mode);
    
    await this.logger.debug('DiscussionEngine initialized', { 
      mode: options.mode, 
      participants: options.participants.map(p => p.name) 
    });
  }

  async run(): Promise<DiscussionResult> {
    if (!this.state) throw new Error('Engine not initialized');
    
    this.state.status = EngineState.RUNNING;
    this.state.updatedAt = Date.now();
    const startTime = Date.now();

    await this.logger.info(`🚀 动态群聊启动：${this.state.topic}`);

    try {
      for (let round = 1; round <= this.state.maxRounds; round++) {
        this.state.currentRound = round;
        await this.runRound();
        
        // Update state
        this.state.updatedAt = Date.now();
        
        if (await this.modeInstance.shouldStop(this.state.messages, this.state.currentRound)) {
           await this.logger.info('Discussion stopped early by mode logic.');
           break;
        }
      }

      this.state.status = this.state.stopReason ? EngineState.CANCELLED : EngineState.COMPLETED;
      const conclusion = await this.modeInstance.generateConclusion(
        this.state.messages,
        this.state.topic
      );

      return {
        topic: this.state.topic,
        messages: this.state.messages,
        conclusion,
        consensus: this.modeInstance.calculateConsensus(this.state.messages),
        rounds: this.state.currentRound,
        duration: Date.now() - startTime,
        createdSessionIDs: Object.values(this.state.subSessionIds),
        status: this.state.status === EngineState.COMPLETED ? 'completed' : this.state.status === EngineState.CANCELLED ? 'cancelled' : 'failed',
        stopReason: this.state.stopReason,
        errors: this.state.errors,
      };

    } catch (error) {
      this.state.status = EngineState.FAILED;
      this.state.error = error as Error;
      this.state.stopReason = error instanceof Error ? error.message : String(error);
      await this.logger.error('Discussion execution failed', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async pause(): Promise<void> {
    this.state.status = EngineState.PAUSED;
    // Implementation for pausing would involve checking status in the loop
  }

  async resume(): Promise<void> {
    if (this.state.status === EngineState.PAUSED) {
        this.state.status = EngineState.RUNNING;
    }
  }

  async stop(reason?: string): Promise<void> {
    this.state.status = EngineState.CANCELLED;
    this.state.stopReason = reason;
    await this.logger.warn(`Discussion stopped: ${reason}`);
    await this.cleanup();
  }

  getState(): IDiscussionState {
    return this.state;
  }

  // --- Private Methods ---

  private async runRound(): Promise<void> {
    const speakers = await this.modeInstance.getSpeakers(
      this.state.currentRound,
      this.state.maxRounds,
      this.state.participants.map(p => p.name)
    );

    await this.logger.debug(`Round ${this.state.currentRound} speakers: ${speakers.join(', ')}`);

    const roundContext = await this.buildContext();
    const results: (DiscussionMessage | null)[] = [];
    const errors = this.state.errors ?? (this.state.errors = []);

    // Dispatch tasks in parallel (controlled by ResourceController)
    const promises = speakers.map((name: string) => {
      return this.dispatcher.dispatch(async (signal) => {
        if (signal.aborted) return null;

        // Validate speaker exists
        const participantExists = this.state.participants.some(p => p.name === name);
        if (!participantExists) {
          errors.push({ agent: name, round: this.state.currentRound, message: 'Speaker not found in participants' });
          return null;
        }
        
        try {
           return await this.executeAgent(name, roundContext, signal);
        } catch (e) {
           errors.push({ agent: name, round: this.state.currentRound, message: e instanceof Error ? e.message : String(e) });
           await this.logger.error(`Error executing agent ${name}`, e);
           return null;
        }
      }, { timeoutMs: this.options.timeout });
    });

    const outcomes = await Promise.all(promises);
    
    for (const res of outcomes) {
      if (res) {
        this.state.messages.push(res);
        await this.logger.info(`[@${res.agent}]: ${res.content}`);
      }
    }
  }

  private async executeAgent(name: string, context: string, signal?: AbortSignal): Promise<DiscussionMessage> {
    const participant = this.state.participants.find(p => p.name === name) || 
                        ({ name, subagentType: 'general' } as DiscussionParticipant);

    const prompt = this.buildPromptForAgent(name, participant, context);
    
    const agentSessionID = await this.getAgentSessionID(name, signal);
    if (!agentSessionID) {
      throw new Error(`Unable to get session for agent ${name}`);
    }

    // Use withRetry for the API call
    const content = await withRetry(async (innerSignal) => {
        return await this.invokeDirect(participant.subagentType, prompt, agentSessionID, { signal: innerSignal, timeoutMs: this.options.timeout });
    }, {
        retries: this.options.maxRetries,
        minTimeout: 1000,
        factor: 2,
        signal,
    });

    return {
      agent: name,
      content,
      round: this.state.currentRound,
      timestamp: Date.now()
    };
  }

  private async buildContext(): Promise<string> {
    // Initial Context
    if (this.state.messages.length === 0) {
      let initialContext = "【讨论背景】\n";
      initialContext += `话题: ${this.state.topic}\n`;

      if (this.options.context) {
        initialContext += `补充背景: ${this.options.context}\n`;
      }

      if (this.state.participants.length) {
        initialContext += "\n【参与成员】\n";
        for (const p of this.state.participants) {
          const role = p.role ? ` | role=${p.role}` : "";
          initialContext += `- @${p.name} | subagent_type=${p.subagentType}${role}\n`;
        }
      }

      if (this.options.files && this.options.files.length > 0) {
        initialContext += "\n【参考文件内容】\n";
        for (const file of this.options.files) {
          try {
            const resolved = path.isAbsolute(file)
              ? file
              : path.resolve(process.cwd(), file);
            // Async Read
            const content = await AsyncFS.readFile(resolved);
            initialContext += `\n--- 文件: ${file} ---\n${content}\n`;
          } catch (e) {
            await this.logger.warn(`无法读取文件 ${file}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      return initialContext;
    }

    // Compression/Summarization Logic (Phase 3 Todo, currently keeping logic simple)
    // Using simple concatenation or existing summarization
    const COMPRESSION_THRESHOLD = 15;
    if (this.state.messages.length > COMPRESSION_THRESHOLD) {
      return await this.summarizeHistory();
    }

    return this.state.messages
      .map((m) => `Round ${m.round} | @${m.agent}: ${m.content}`)
      .join("\n\n");
  }

  private buildPromptForAgent(name: string, participant: DiscussionParticipant, context: string): string {
    const isCollab = this.options.mode === 'collaborative';
    const roleText = participant.role
      ? participant.role
      : `（该参与者未提供 role；当前使用 subagent_type=${participant.subagentType}）`;

    return `
# 任务：多 Agent 群聊讨论
你现在是 @${name}
subagent_type: ${participant.subagentType}
职责: ${roleText}

话题: ${this.state.topic}

## 历史回顾
${context}

## 你的任务
1. ${isCollab
      ? "请基于你的职责，补充/完善方案，给出具体接口/步骤/风险与对策。"
      : "请基于你的职责提出观点，并对其他成员的观点做回应（可反驳/补充）。"}
2. 保持简洁，200 字以内。
`;
  }

  private async invokeDirect(agentType: string, prompt: string, sessionId: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<string> {
      const { signal, timeoutMs } = opts;

      const runCall = async () => {
        if (this.client?.session?.prompt) {
            const res = await this.client.session.prompt({
                body: {
                    parts: [{ type: "text", text: prompt }],
                    agent: agentType
                },
                path: { id: sessionId },
                signal
            });
            return this.extractTextFromResponse(res);
        }

        if (this.client?.prompt) {
            const res = await this.client.prompt({
                body: {
                    parts: [{ type: "text", text: prompt }],
                    agent: agentType
                },
                path: { id: sessionId },
                signal
            });
            return this.extractTextFromResponse(res);
        }

        throw new Error('OpenCode client prompt function not available');
      };

      if (timeoutMs && timeoutMs > 0) {
        return await Promise.race([
          runCall(),
          new Promise<string>((_, reject) => {
            const timeout = setTimeout(() => {
              const err = new Error('invokeDirect timeout');
              (err as any).name = 'TimeoutError';
              reject(err);
            }, timeoutMs);
            // cleanup handled by settle
          })
        ]);
      }

      return await runCall();
  }

  private extractTextFromResponse(res: any): string {
    if (typeof res === "string") return res;
    const data = res?.data || res;
    if (data?.parts && Array.isArray(data.parts)) {
      const textPart = data.parts.find((p: any) => p.type === "text");
      if (textPart?.text) return textPart.text;
    }
    if (data?.text) return data.text;
    if (res?.text) return res.text;
    if (data?.info?.content) return data.info.content;
    throw new Error('Failed to extract text from response');
  }

  private async getAgentSessionID(name: string, signal?: AbortSignal): Promise<string | undefined> {
    if (this.state.subSessionIds[name]) {
      return this.state.subSessionIds[name];
    }

    if (this.client?.session?.create && this.sessionID) {
      // Create session with Retry
      try {
        const newSessionID = await withRetry(async (innerSignal) => {
            const res = await this.client.session.create({
              parentID: this.sessionID,
              title: `Discussion Agent: ${name}`,
              signal: innerSignal || signal,
            });
            const session = res?.data || res;
            if (!session?.id) throw new Error('Session creation returned no ID');
            return session.id;
        }, { retries: 3, signal });

        await this.logger.debug(`Created sub-session for agent ${name}: ${newSessionID}`);
        this.state.subSessionIds[name] = newSessionID;
        return newSessionID;
      } catch (e) {
        await this.logger.warn(`Failed to create sub-session for agent ${name}: ${e}`);
      }
    }
    return this.sessionID;
  }

  private async summarizeHistory(): Promise<string> {
    const history = this.state.messages
      .map((m) => `@${m.agent}: ${m.content}`)
      .join("\n");
    const prompt = `总结论点：\n${history}`;
    
    // Summarize also needs retry
    return await withRetry((signal) => this.invokeDirect("summarizer", prompt, this.sessionID, { signal, timeoutMs: this.options.timeout }), {
      retries: this.options.maxRetries,
      signal: undefined,
    });
  }

  private async cleanup(): Promise<void> {
    await this.dispatcher.shutdown();

    if (this.options.keepSessions) {
      await this.logger.info("keep_sessions=true, skipping cleanup.");
      return;
    }

    const ids = Object.values(this.state.subSessionIds);
    if (ids.length === 0) return;

    await this.logger.info(`Cleaning up ${ids.length} sub-sessions...`);

    if (!this.client?.session?.delete) return;

    // Parallel cleanup
    await Promise.all(ids.map(async (id) => {
        try {
            await this.client.session.delete({ path: { id } });
        } catch (e) {
            await this.logger.warn(`Failed to delete session ${id}`, { error: e });
        }
    }));
  }

  private getModeInstance(modeName: string) {
    switch (modeName) {
      case "debate": return new DebateMode();
      case "collaborative": return new CollaborativeMode();
      default: return new DebateMode();
    }
  }
}
