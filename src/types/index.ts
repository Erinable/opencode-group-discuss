/**
 * Core types for group discussion plugin
 */

export interface DiscussionMessage {
  agent: string;
  content: string;
  round: number;
  timestamp: number;
}

export interface DiscussionResult {
  topic: string;
  messages: DiscussionMessage[];
  conclusion: string;
  consensus: number; // 0-1 的共识度
  rounds: number;
  duration: number; // 讨论耗时（毫秒）
  createdSessionIDs?: string[]; // 本次讨论创建的子 session ID 列表
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
   */
  shouldStop(messages: DiscussionMessage[], currentRound: number): Promise<boolean>;
  
  /**
   * 生成最终结论
   */
  generateConclusion(messages: DiscussionMessage[], topic: string): Promise<string>;
  
  /**
   * 计算共识度 (0-1)
   */
  calculateConsensus(messages: DiscussionMessage[]): number;
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
