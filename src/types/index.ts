/**
 * Core types for group discussion plugin
 */

// Re-export consensus and termination types for convenience
export type { ConsensusConfig, ConsensusReport } from '../core/consensus/types.js';
export type { TerminationCondition, TerminationSignal } from '../core/termination/types.js';
export type {
  ContextCompactorConfig,
  CompactedContext,
  ContextSummary,
  KeyInfo,
  ContextState
} from '../core/context/types.js';

export interface DiscussionMessage {
  agent: string;
  content: string;
  round: number;
  timestamp: number;
}

export type DiscussionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DiscussionError {
  agent?: string;
  round?: number;
  message: string;
  code?: string;
  retryCount?: number;
}

export interface DiscussionResult {
  topic: string;
  messages: DiscussionMessage[];
  conclusion: string;
  consensus: number; // 0-1 的共识度
  rounds: number;
  duration: number; // 讨论耗时（毫秒）
  status?: DiscussionStatus;
  stopReason?: string;
  createdSessionIDs?: string[]; // 本次讨论创建的子 session ID 列表
  errors?: DiscussionError[];
  
  // P0 新增字段
  /** 详细的共识评估报告 */
  consensusReport?: import('../core/consensus/types.js').ConsensusReport;
  /** 终止原因（由 TerminationManager 提供） */
  terminationReason?: string;
  /** 是否提前终止 */
  earlyTermination?: boolean;
}

export interface DiscussionParticipant {
  /**
   * 群聊中显示的名字，同时作为消息的 agent 字段
   */
  name: string;
  /**
   * OpenCode 已注册的 subagent 类型（决定使用哪套 agent 配置）
   * 例如：advocate/critic/moderator/general/explore
   */
  subagentType: string;
  /**
   * 该参与者在本次讨论中的职责描述（用于 Prompt 注入）
   */
  role?: string;
}

export interface DiscussionConfig {
  topic: string;
  /**
   * 供 mode 计算发言顺序使用的参与者列表（通常是 participants.name 的集合）
   */
  agents: string[];
  /**
   * 参与者的完整配置（用于路由 subagent_type、注入 role 等）
   */
  participants?: DiscussionParticipant[];
  mode: DiscussionMode;
  maxRounds: number;
  verbose?: boolean;
  context?: string; // 补充背景描述
  files?: string[]; // 参考文件路径列表
  keepSessions?: boolean; // 是否保留子 session（默认 false，即自动清理）
}

/**
 * Discussion mode interface
 */
export interface DiscussionMode {
  /**
   * 获取当前轮次的发言者列表
   */
  getSpeakers(round: number, totalRounds: number, agents: string[]): Promise<string[]>;
  
  /**
   * 获取 agent 的角色描述
   */
  getAgentRole(agentName: string): string;
  
  /**
   * 判断是否应该提前结束讨论
   * @deprecated 使用 getTerminationConditions() 替代
   */
  shouldStop(messages: DiscussionMessage[], currentRound: number): Promise<boolean>;
  
  /**
   * 生成最终结论
   */
  generateConclusion(messages: DiscussionMessage[], topic: string): Promise<string>;
  
  /**
   * 计算共识度 (0-1)
   * @deprecated 使用 getConsensusConfig() 配合 ConsensusEvaluator 替代
   */
  calculateConsensus(messages: DiscussionMessage[]): number;
  
  // P0 新增可选方法
  
  /**
   * 获取该模式下的自定义终止条件
   */
  getTerminationConditions?(): import('../core/termination/types.js').TerminationCondition[];
  
  /**
   * 获取该模式下的共识评估配置
   */
  getConsensusConfig?(): Partial<import('../core/consensus/types.js').ConsensusConfig>;
}

/**
 * Plugin context from OpenCode
 */
export interface PluginContext {
  project: any;
  client: any;
  $: any;
  directory: string;
  worktree: string;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  agent: string;
  sessionID: string;
  messageID: string;
  client: any;
}
