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
import { ConsensusEvaluator } from '../consensus/ConsensusEvaluator.js';
import { TerminationManager } from '../termination/TerminationManager.js';
import { getConfigLoader } from '../../config/ConfigLoader.js';
import { ContextCompactor } from '../context/ContextCompactor.js';
import type { ConsensusReport } from '../consensus/types.js';
import type { TerminationContext } from '../termination/types.js';
import * as path from 'path';
import * as util from 'util';

export class DiscussionEngine implements IDiscussionEngine {
  private options!: EngineOptions;
  private state!: IDiscussionState;
  private logger: Logger;
  private client: any;
  private sessionID: string;
  private projectRoot?: string;
  private dispatcher!: IDispatcher;
  private modeInstance!: any; // DiscussionMode interface
  private abortController!: AbortController;
  private cleanupPromise?: Promise<void>;

  private initialFilesBlock?: string;
  
  // P0: 新增共识评估器和终止管理器
  private consensusEvaluator!: ConsensusEvaluator;
  private terminationManager!: TerminationManager;
  private contextCompactor!: ContextCompactor;
  private latestConsensusReport?: ConsensusReport;
  private terminationReason?: string;
  private earlyTermination: boolean = false;

  constructor(client: any, sessionID: string, logger?: Logger, projectRoot?: string) {
    this.client = client;
    this.sessionID = sessionID;
    this.logger = logger || new Logger(client);
    this.projectRoot = projectRoot;
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
    
    // 加载配置文件中的共识和终止配置
    const configLoader = getConfigLoader(this.projectRoot);
    const fileConfig = await configLoader.loadConfig();

    // P0: fail-closed sandboxing for files[] before any sub-sessions are created
    if (this.options.files && this.options.files.length > 0) {
      const projectRoot = configLoader.getProjectRoot();
      const MAX_FILES = 10;
      const MAX_BYTES_PER_FILE = 262144; // 256 KiB
      const MAX_TOTAL_BYTES = 1048576; // 1 MiB

      if (this.options.files.length > MAX_FILES) {
        const err: any = new Error(`E_FILE_TOO_MANY: maxFiles=${MAX_FILES}`);
        err.code = 'E_FILE_TOO_MANY';
        throw err;
      }

      let totalBytes = 0;
      let block = "\n【参考文件内容】\n";

      for (const file of this.options.files) {
        const resolved = await AsyncFS.safeResolve(projectRoot, file);
        const st = await AsyncFS.stat(resolved);

        if (st.size > MAX_BYTES_PER_FILE) {
          const err: any = new Error(`E_FILE_TOO_LARGE: ${file} maxBytesPerFile=${MAX_BYTES_PER_FILE}`);
          err.code = 'E_FILE_TOO_LARGE';
          throw err;
        }

        totalBytes += st.size;
        if (totalBytes > MAX_TOTAL_BYTES) {
          const err: any = new Error(`E_FILE_TOTAL_TOO_LARGE: maxTotalBytes=${MAX_TOTAL_BYTES}`);
          err.code = 'E_FILE_TOTAL_TOO_LARGE';
          throw err;
        }

        const content = await AsyncFS.readFile(resolved);
        block += `\n--- 文件: ${file} ---\n${content}\n`;
      }

      this.initialFilesBlock = block;
    }
    
    // P0: 初始化共识评估器（合并配置文件 + mode 提供的配置）
    const modeConsensusConfig = this.modeInstance.getConsensusConfig?.() ?? {};
    const mergedConsensusConfig = {
      consensusThreshold: fileConfig.consensus.threshold,
      enableConvergenceAnalysis: fileConfig.consensus.enable_convergence_analysis,
      stalemateWindow: fileConfig.consensus.stalemate_window,
      keywordWeights: fileConfig.consensus.keyword_weights,
      ...modeConsensusConfig, // mode 配置可以覆盖文件配置
    };
    this.consensusEvaluator = new ConsensusEvaluator(mergedConsensusConfig);
    
    // P0: 初始化终止管理器（合并配置文件 + mode 提供的自定义条件）
    const customTerminationConditions = this.modeInstance.getTerminationConditions?.() ?? [];
    const terminationConfig = {
      minConfidence: fileConfig.termination.min_confidence,
      enableStalemateDetection: fileConfig.termination.enable_stalemate_detection,
      stalemateRounds: fileConfig.termination.stalemate_rounds,
    };
    this.terminationManager = new TerminationManager(customTerminationConditions, terminationConfig);
    
    // 移除被禁用的终止条件
    for (const conditionName of fileConfig.termination.disabled_conditions) {
      this.terminationManager.removeCondition(conditionName);
    }

    // Context compactor
    const contextConfig = fileConfig.context_compaction;
    this.contextCompactor = new ContextCompactor({
      maxContextChars: contextConfig.max_context_chars,
      compactionThreshold: contextConfig.compaction_threshold,
      maxMessageLength: contextConfig.max_message_length,
      preserveRecentRounds: contextConfig.preserve_recent_rounds,
      enableKeyInfoExtraction: contextConfig.enable_key_info_extraction,
      keywordWeights: contextConfig.keyword_weights,
      includeSelfHistory: contextConfig.include_self_history,
    });
    
    await this.logger.debug('DiscussionEngine initialized', { 
      mode: options.mode, 
      participants: options.participants.map(p => p.name),
      terminationConditions: this.terminationManager.getConditionNames(),
      consensusThreshold: mergedConsensusConfig.consensusThreshold,
      contextCompactionThreshold: contextConfig.compaction_threshold,
      contextBudget: fileConfig.context_budget,
      maxContextChars: contextConfig.max_context_chars,
      maxMessageLength: contextConfig.max_message_length,
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
      consensus: this.latestConsensusReport?.overallScore ?? this.modeInstance.calculateConsensus(this.state.messages),
      rounds: this.state.currentRound,
      duration: Date.now() - startTime,
      createdSessionIDs: Object.values(this.state.subSessionIds),
      status: this.mapStatus(this.state.status),
      stopReason: this.state.stopReason,
      errors: this.state.errors,
      // P0 新增字段
      consensusReport: this.latestConsensusReport,
      terminationReason: this.terminationReason,
      earlyTermination: this.earlyTermination,
    });

    try {
      // Create transcript session if enabled
      await this.ensureTranscriptSession(engineSignal);

      for (let round = 1; round <= this.state.maxRounds; round++) {
        if (engineSignal.aborted) break;
        this.state.currentRound = round;
        await this.runRound(engineSignal);

        this.state.updatedAt = Date.now();

        if (engineSignal.aborted) break;
        
        // P0: 每轮结束后进行共识评估
        this.latestConsensusReport = await this.consensusEvaluator.evaluate(this.state.messages);
        await this.logger.debug(`Round ${round} consensus: ${(this.latestConsensusReport.overallScore * 100).toFixed(1)}%`, {
          convergenceRate: this.latestConsensusReport.convergenceRate,
          recommendation: this.latestConsensusReport.recommendation,
          disagreements: this.latestConsensusReport.disagreements.length
        });

        // P0: 使用 TerminationManager 检查是否应该终止
        const terminationContext: TerminationContext = {
          messages: this.state.messages,
          currentRound: this.state.currentRound,
          maxRounds: this.state.maxRounds,
          consensusReport: this.latestConsensusReport,
          mode: this.options.mode,
          elapsedTime: Date.now() - startTime
        };

        const terminationSignal = await this.terminationManager.shouldTerminate(terminationContext);
        if (terminationSignal.shouldStop) {
          this.terminationReason = terminationSignal.reason;
          this.earlyTermination = round < this.state.maxRounds;
          await this.logger.info(`Discussion terminated early: ${terminationSignal.reason} (confidence: ${(terminationSignal.confidence * 100).toFixed(0)}%)`);
          break;
        }

        // 兼容旧版 shouldStop 方法（作为备选）
        if (await this.modeInstance.shouldStop(this.state.messages, this.state.currentRound)) {
           await this.logger.info('Discussion stopped early by legacy mode logic.');
           this.terminationReason = 'Legacy mode shouldStop';
           this.earlyTermination = round < this.state.maxRounds;
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
           return await this.executeAgent(name, effectiveSignal);
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

  private async executeAgent(name: string, signal?: AbortSignal): Promise<DiscussionMessage> {
    const participant = this.state.participants.find(p => p.name === name) || 
                        ({ name, subagentType: 'general' } as DiscussionParticipant);

    // 为该 Agent 构建增量上下文（只包含上一轮其他人的发言）
    const context = await this.buildContextForAgent(name);
    const prompt = this.buildPromptForAgent(name, participant, context);

    const dbg = this.logger.getDebugOptions();
    if (dbg.logPrompts && this.logger.isEnabled('debug')) {
      await this.logger.debug('Built agent prompt', {
        agent: name,
        subagent_type: participant.subagentType,
        round: this.state.currentRound,
        promptLength: prompt.length,
        prompt,
      });
    }

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

  /**
   * 构建初始背景信息（仅首轮使用）
   * 包含：话题、补充背景、参与成员、参考文件
   */
  private async buildInitialBackground(): Promise<string> {
    let context = "【讨论背景】\n";
    context += `话题: ${this.state.topic}\n`;

    if (this.options.context) {
      context += `补充背景: ${this.options.context}\n`;
    }

    if (this.state.participants.length) {
      context += "\n【参与成员】\n";
      for (const p of this.state.participants) {
        const role = p.role ? ` | role=${p.role}` : "";
        context += `- @${p.name} | subagent_type=${p.subagentType}${role}\n`;
      }
    }

    if (this.initialFilesBlock) {
      context += this.initialFilesBlock;
    }

    return context;
  }

  /**
   * 为指定 Agent 构建增量上下文
   * - Round 1：返回完整背景
   * - Round 2+：只返回上一轮其他人的发言
   */
  private async buildContextForAgent(agentName: string): Promise<string> {
    const currentRound = this.state.currentRound;

    // 首轮：返回初始背景
    if (currentRound === 1) {
      return await this.buildInitialBackground();
    }

    const compacted = await this.contextCompactor.buildContext(this.state.messages, {
      currentRound,
      agentName,
      baseContext: `话题: ${this.state.topic}`,
    });

    const dbg = this.logger.getDebugOptions();

    if (dbg.logCompaction && this.logger.isEnabled('debug')) {
      await this.logger.debug('Context build result', {
        agent: agentName,
        round: currentRound,
        wasCompacted: compacted.wasCompacted,
        historyEstimatedLength: compacted.historyEstimatedLength ?? compacted.originalLength,
        injectedLength: compacted.compactedLength,
        compressionRatio: compacted.compressionRatio,
        preservedKeyInfoCount: compacted.preservedKeyInfo?.length ?? 0,
        summary: compacted.summary?.progressOverview,
      });
    }

    if (dbg.logContext && this.logger.isEnabled('debug')) {
      await this.logger.debug('Injected context text', {
        agent: agentName,
        round: currentRound,
        contextLength: compacted.content.length,
        context: compacted.content,
      });
    }

    if (!compacted.content) {
      return `话题: ${this.state.topic}\n（暂无历史发言）`;
    }

    return compacted.content;
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
            await this.logger.debug(`[InvokeStart] Calling session.prompt for agent ${agentType} in session ${sessionId}`);
            
            // 短暂延迟确保会话完全初始化
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                const res = await this.client.session.prompt({
                    body: {
                        parts: [{ type: "text", text: prompt }],
                        agent: agentType
                    },
                    path: { id: sessionId },
                    signal: combinedSignal
                });
                
                // Debug: log raw response to help troubleshoot empty messages
                if (this.logger.isEnabled('debug')) {
                    await this.logger.debug(`[RawResponse] Agent ${agentType} returned:`, { 
                        resType: typeof res, 
                        preview: util.inspect(res, { depth: 3, colors: false }).slice(0, 2000) 
                    });
                }
                
                return this.extractTextFromResponse(res);
            } catch (promptError: any) {
                // 尝试获取更多错误信息
                const errorInfo: Record<string, any> = {
                    error: promptError?.message || String(promptError),
                    code: promptError?.code,
                    name: promptError?.name,
                    stack: promptError?.stack?.slice(0, 500),
                };
                
                // 如果有 response 或 request 信息也记录
                if (promptError?.response) {
                    errorInfo.responseStatus = promptError.response.status;
                    errorInfo.responseStatusText = promptError.response.statusText;
                }
                if (promptError?.request) {
                    errorInfo.requestUrl = promptError.request.url;
                }
                
                // 检查是否有嵌套的错误信息
                if (promptError?.error) {
                    errorInfo.nestedError = typeof promptError.error === 'object' 
                        ? JSON.stringify(promptError.error).slice(0, 500)
                        : String(promptError.error);
                }
                
                await this.logger.error(`[PromptError] Agent ${agentType} prompt failed:`, errorInfo);
                throw promptError;
            }
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

            if (this.logger.isEnabled('debug')) {
                await this.logger.debug(`[RawResponse] Client.prompt Agent ${agentType} returned:`, { 
                    resType: typeof res, 
                    preview: util.inspect(res, { depth: 3, colors: false }).slice(0, 2000) 
                });
            }

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
    if (res === null || res === undefined) return '';
    if (typeof res === "string") return res;

    const data = res?.data || res;
    
    // 1. 标准 OpenCode SDK 响应结构 (data.parts)
    if (data?.parts && Array.isArray(data.parts)) {
      // 优先查找 text 类型的 part
      const textPart = data.parts.find((p: any) => p.type === "text");
      if (textPart?.text) return textPart.text;
      
      // 如果没有明确的 text part，尝试拼接所有可能包含文本的 parts
      // 这对于包含 tool_calls 的混合响应很有用
      const allText = data.parts
        .map((p: any) => {
           if (!p) return '';
           return p.text || p.content || (typeof p === 'string' ? p : '');
        })
        .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
        .join('\n');
      
      if (allText) return allText;
    }

    // 2. 直接属性访问 (兼容各种变体)
    if (typeof data?.text === 'string') return data.text;
    if (typeof res?.text === 'string') return res.text;
    if (typeof data?.content === 'string') return data.content;
    if (typeof res?.content === 'string') return res.content;
    if (typeof data?.message === 'string') return data.message;
    
    // 3. 嵌套结构 (data.info.content - 旧版或特定 agent)
    if (typeof data?.info?.content === 'string') return data.info.content;

    // 4. 尝试提取 content 字段（即使它可能深藏在其他结构中）
    if (data && typeof data === 'object') {
        // 如果 data 本身就是一个包含 content 的对象
        if ('content' in data && typeof data.content === 'string') return data.content;
    }

    // 5. 最终兜底：如果 data 是对象但无法识别结构，尝试 stringify
    // 防止因为解析失败导致整轮对话崩溃
    try {
        const str = JSON.stringify(data);
        // 如果 stringify 结果不太长，就作为结果返回，方便调试
        if (str.length < 5000) return str;
    } catch {
        // ignore
    }

    throw new Error(`Failed to extract text from response: ${util.inspect(res, { depth: 2 })}`);
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
              body: {
                parentID: this.sessionID,
                title: `Discussion Agent: ${name}`,
              },
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

  private async ensureTranscriptSession(signal?: AbortSignal): Promise<string | undefined> {
    if (this.state.subSessionIds['_transcript']) {
      return this.state.subSessionIds['_transcript'];
    }

    const baseSignal = signal ?? this.abortController.signal;

    try {
      const config = await getConfigLoader(this.projectRoot).loadConfig();
      if (config.tui?.enable_transcript === false) {
        return undefined;
      }

      if (this.client?.session?.create && this.sessionID) {
        const transcriptSessionID = await withRetry(async (innerSignal) => {
          const combinedSignal = this.combineSignals([baseSignal, innerSignal].filter(Boolean) as AbortSignal[]);
          const res = await this.client.session.create({
            body: {
              parentID: this.sessionID,
              title: "📢 Group Discussion Transcript",
            },
            signal: combinedSignal,
          });
          const session = res?.data || res;
          if (!session?.id) throw new Error('Transcript session creation returned no ID');
          return session.id;
        }, { retries: 3, signal: baseSignal });

        await this.logger.info(`TUI Transcript Session Created`, { transcriptSessionID });
        this.state.subSessionIds['_transcript'] = transcriptSessionID;
        return transcriptSessionID;
      }
    } catch (e) {
      await this.logger.warn(`Failed to create transcript session: ${e}`);
    }

    return undefined;
  }

   private async cleanup(): Promise<void> {
     if (this.cleanupPromise) return this.cleanupPromise;
 
     const cleanupLogic = async () => {
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
     };

     this.cleanupPromise = (async () => {
        let timeoutId: NodeJS.Timeout | undefined;
        try {
            const timeoutPromise = new Promise<void>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
            });
            await Promise.race([cleanupLogic(), timeoutPromise]);
        } catch (error) {
            await this.logger.warn('Cleanup process failed or timed out', error as any);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
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
     // Rely on Node >= 20 AbortSignal.any
     return (AbortSignal as any).any(active) as AbortSignal;
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
