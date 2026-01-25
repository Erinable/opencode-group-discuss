/**
 * Dynamic Termination Types
 * 动态终止条件相关类型定义
 */

import type { DiscussionMessage } from '../../types/index.js';
import type { ConsensusReport } from '../consensus/types.js';

/**
 * 终止条件检查上下文
 */
export interface TerminationContext {
  /** 所有讨论消息 */
  messages: DiscussionMessage[];
  
  /** 当前轮次 */
  currentRound: number;
  
  /** 最大轮次 */
  maxRounds: number;
  
  /** 共识评估报告 */
  consensusReport: ConsensusReport;
  
  /** 讨论模式 */
  mode: string;
  
  /** 已用时间 (ms) */
  elapsedTime: number;
}

/**
 * 终止信号
 */
export interface TerminationSignal {
  /** 是否应该终止 */
  shouldStop: boolean;
  
  /** 终止原因 */
  reason?: string;
  
  /** 置信度 0-1 */
  confidence: number;
}

/**
 * 终止条件
 */
export interface TerminationCondition {
  /** 条件名称 */
  name: string;
  
  /** 优先级 (数值越大优先级越高) */
  priority: number;
  
  /** 检查函数 */
  check: (ctx: TerminationContext) => Promise<TerminationSignal>;
}

/**
 * 终止管理器配置
 */
export interface TerminationConfig {
  /** 最小置信度阈值 (低于此值的信号会被忽略) */
  minConfidence: number;
  
  /** 是否启用僵局检测 */
  enableStalemateDetection: boolean;
  
  /** 僵局轮次阈值 */
  stalemateRounds: number;
}

/**
 * 默认终止配置
 */
export const DEFAULT_TERMINATION_CONFIG: TerminationConfig = {
  minConfidence: 0.7,
  enableStalemateDetection: true,
  stalemateRounds: 3
};
