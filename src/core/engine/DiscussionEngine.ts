import { 
  IDiscussionEngine, 
  IDiscussionState, 
  EngineOptions, 
  EngineState,
  IDispatcher
} from './interfaces.js';
import { ResourceController } from './ResourceController.js';
import { DiscussionResult, DiscussionMessage, DiscussionParticipant, DiscussionStatus } from '../../types/index.js';
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
  private abortController!: AbortController;
  private cleanupPromise?: Promise<void>;

  constructor(client: any, sessionID: string, logger?: Logger) {
    this.client = client;
    this.sessionID = sessionID;
    this.logger = logger || new Logger(client);
    this.abortController = new AbortController();
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

    const engineSignal = this.abortController.signal;
    this.state.status = EngineState.RUNNING;
    this.state.updatedAt = Date.now();
    const startTime = Date.now();

    await this.logger.info(`🚀 动态群聊启动：${this.state.topic}`);

    const buildResult = (conclusion: string): DiscussionResult => ({
      topic: this.state.topic,
      messages: this.state.messages,
      conclusion,
      consensus: this.modeInstance.calculateConsensus(this.state.messages),
      rounds: this.state.currentRound,
      duration: Date.now() - startTime,
      createdSessionIDs: Object.values(this.state.subSessionIds),
      status: this.mapStatus(this.state.status),
      stopReason: this.state.stopReason,
      errors: this.state.errors,
    });

    try {
      for (let round = 1; round <= this.state.maxRounds; round++) {
        if (engineSignal.aborted) break;
        this.state.currentRound = round;
        await this.runRound(engineSignal);

        this.state.updatedAt = Date.now();

        if (engineSignal.aborted) break;
        if (await this.modeInstance.shouldStop(this.state.messages, this.state.currentRound)) {
           await this.logger.info('Discussion stopped early by mode logic.');
           break;
        }
      }

      let status: EngineState;
      if (this.state.stopReason) {
        status = EngineState.CANCELLED;
      } else if (engineSignal.aborted) {
        status = EngineState.CANCELLED;
      } else {
        status = EngineState.COMPLETED;
      }
      this.state.status = status;

      const conclusion = await this.safeGenerateConclusion();

      return buildResult(conclusion);

    } catch (error) {
      if (this.isAbortLike(error)) {
        this.state.status = EngineState.CANCELLED;
        this.state.stopReason = this.state.stopReason || (error as Error).message;
        await this.logger.warn('Discussion cancelled', error as any);
        const conclusion = await this.safeGenerateConclusion();
        return buildResult(conclusion);
      }

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
    if (this.abortController.signal.aborted) return;
    this.state.status = EngineState.CANCELLED;
    this.state.stopReason = reason;
    const abortError = new Error(reason ?? 'Discussion stopped');
    abortError.name = 'AbortError';
    this.abortController.abort(abortError);
    await this.logger.warn(`Discussion stopped: ${reason ?? 'cancelled'}`);
  }

  getState(): IDiscussionState {
    return this.state;
  }

  // --- Private Methods ---

  private async runRound(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;

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
      return this.dispatcher.dispatch(async (dispatchSignal) => {
        const effectiveSignal = this.combineSignals([signal, dispatchSignal].filter(Boolean) as AbortSignal[]);
        if (effectiveSignal.aborted) return null;

        // Validate speaker exists
        const participantExists = this.state.participants.some(p => p.name === name);
        if (!participantExists) {
          errors.push({ agent: name, round: this.state.currentRound, message: 'Speaker not found in participants' });
          return null;
        }
        
        try {
           return await this.executeAgent(name, roundContext, effectiveSignal);
        } catch (e) {
           if (this.isAbortLike(e)) return null;
           const errorObj = e instanceof Error ? e : new Error(String(e));
           errors.push({ 
             agent: name, 
             round: this.state.currentRound, 
             message: errorObj.message,
             code: (errorObj as any).code,
             retryCount: (errorObj as any).retryCount,
           });
           await this.logger.error(`Error executing agent ${name}`, e);
           return null;
        }
      }, { timeoutMs: this.options.timeout, signal });
    });

    let outcomes: (DiscussionMessage | null)[] = [];
    try {
      outcomes = await Promise.all(promises);
    } catch (err) {
      if (this.isAbortLike(err)) return;
      throw err;
    }
    
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
    const engineSignal = signal ?? this.abortController.signal;
    
    const agentSessionID = await this.getAgentSessionID(name, engineSignal);
    if (!agentSessionID) {
      throw new Error(`Unable to get session for agent ${name}`);
    }

    // Use withRetry for the API call
    const content = await withRetry(async (innerSignal) => {
        const combinedSignal = this.combineSignals([engineSignal, innerSignal].filter(Boolean) as AbortSignal[]);
        return await this.invokeDirect(participant.subagentType, prompt, agentSessionID, { signal: combinedSignal, timeoutMs: this.options.timeout });
    }, {
        retries: this.options.maxRetries,
        minTimeout: 1000,
        factor: 2,
        signal: engineSignal,
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
      const signals: AbortSignal[] = [this.abortController.signal];
      let timeoutId: NodeJS.Timeout | undefined;
      let timeoutController: AbortController | undefined;

      if (signal) signals.push(signal);

      if (timeoutMs && timeoutMs > 0) {
        timeoutController = new AbortController();
        const err = new Error('invokeDirect timeout');
        err.name = 'TimeoutError';
        (err as any).code = 'ETIMEDOUT';
        timeoutId = setTimeout(() => timeoutController?.abort(err), timeoutMs);
        signals.push(timeoutController.signal);
      }

      const combinedSignal = this.combineSignals(signals);

      const runCall = async () => {
        if (this.client?.session?.prompt) {
            const res = await this.client.session.prompt({
                body: {
                    parts: [{ type: "text", text: prompt }],
                    agent: agentType
                },
                path: { id: sessionId },
                signal: combinedSignal
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
                signal: combinedSignal
            });
            return this.extractTextFromResponse(res);
        }

        throw new Error('OpenCode client prompt function not available');
      };

      try {
        return await runCall();
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
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

    const baseSignal = signal ?? this.abortController.signal;

    if (this.client?.session?.create && this.sessionID) {
      // Create session with Retry
      try {
        const newSessionID = await withRetry(async (innerSignal) => {
            const combinedSignal = this.combineSignals([baseSignal, innerSignal].filter(Boolean) as AbortSignal[]);
            const res = await this.client.session.create({
              parentID: this.sessionID,
              title: `Discussion Agent: ${name}`,
              signal: combinedSignal,
            });
            const session = res?.data || res;
            if (!session?.id) throw new Error('Session creation returned no ID');
            return session.id;
        }, { retries: 3, signal: baseSignal });

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
      signal: this.abortController.signal,
    });
  }
 
   private async cleanup(): Promise<void> {
     if (this.cleanupPromise) return this.cleanupPromise;
 
     this.cleanupPromise = (async () => {
       try {
         await this.dispatcher.shutdown({ awaitIdle: true, timeoutMs: 30000 });
       } catch (e) {
         await this.logger.warn('Dispatcher shutdown failed', e as any);
       }
 
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
     })();
 
     await this.cleanupPromise;
   }
 
   private async safeGenerateConclusion(): Promise<string> {
     try {
       return await this.modeInstance.generateConclusion(this.state.messages, this.state.topic);
     } catch (e) {
       await this.logger.warn('Failed to generate conclusion', e as any);
       return '';
     }
   }
 
   private mapStatus(state: EngineState): DiscussionStatus {
     switch (state) {
       case EngineState.COMPLETED:
         return 'completed';
       case EngineState.CANCELLED:
         return 'cancelled';
       case EngineState.RUNNING:
         return 'running';
       default:
         return 'failed';
     }
   }
 
   private combineSignals(signals: AbortSignal[]): AbortSignal {
     const active = signals.filter(Boolean);
     if (active.length === 0) return this.abortController.signal;
     if (active.length === 1) return active[0];
     if ((AbortSignal as any).any) {
       return (AbortSignal as any).any(active) as AbortSignal;
     }
     
     const controller = new AbortController();
     const onAbort = (evt: Event) => {
        const reason = (evt.target as AbortSignal).reason;
        controller.abort(reason);
     };

     // Clean up listeners when combined signal is aborted
     const cleanup = () => {
        controller.signal.removeEventListener('abort', cleanup);
        for (const sig of active) {
            sig.removeEventListener('abort', onAbort);
        }
     };
     controller.signal.addEventListener('abort', cleanup);

     for (const sig of active) {
       if (sig.aborted) {
         controller.abort(sig.reason);
         return controller.signal;
       }
       sig.addEventListener('abort', onAbort, { once: true });
     }
     return controller.signal;
   }
 
   private isAbortLike(error: any): boolean {
     if (!error) return false;
     const code = (error as any).code;
     const message: string = (error as any).message || '';
     return error.name === 'AbortError'
       || code === 'ABORT_ERR'
       || code === 'SHUTDOWN_TIMEOUT'
       || code === 'ETIMEDOUT'
       || message.includes('Dispatcher is shutting down');
   }
 
   private getModeInstance(modeName: string) {
     switch (modeName) {
       case "debate": return new DebateMode();
       case "collaborative": return new CollaborativeMode();
       default: return new DebateMode();
     }
   }
 }

