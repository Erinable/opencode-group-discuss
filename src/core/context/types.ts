/**
 * Context Compactor Types
 * 
 * 上下文压缩保留模块的类型定义
 * 借鉴 oh-my-opencode 的 compaction-context-injector hook
 */

import type { DiscussionMessage } from '../../types/index.js';

/**
 * 上下文压缩配置
 */
export interface ContextCompactorConfig {
  /**
   * 最大上下文字符数
   * 超过此阈值时触发压缩
   * @default 32000 (~8k tokens)
   */
  maxContextChars: number;

  /**
   * 压缩触发阈值（0-1）
   * 当上下文达到 maxContextChars * threshold 时开始压缩
   * @default 0.8
   */
  compactionThreshold: number;

  /**
   * 每条消息保留的最大字符数
   * 超过此长度的消息会被截断并保留摘要
   * @default 500
   */
  maxMessageLength: number;

  /**
   * 保留最近 N 轮的完整消息
   * 较早的轮次会被压缩为摘要
   * @default 2
   */
  preserveRecentRounds: number;

  /**
   * 是否启用关键信息提取
   * @default true
   */
  enableKeyInfoExtraction: boolean;

  /**
   * 关键词权重映射
   * 包含这些关键词的内容会被优先保留
   */
  keywordWeights: Record<string, number>;

  /**
   * 是否包含当前 agent 自己的历史发言
   * 关闭可减少重复与自洽偏差；开启可增强一致性记忆
   * @default false
   */
  includeSelfHistory: boolean;
}

/**
 * 压缩后的上下文结构
 */
export interface CompactedContext {
  /**
   * 压缩后的上下文文本
   */
  content: string;

  /**
   * 原始字符数
   */
  originalLength: number;

  /**
   * Estimated length of full history (including baseContext if provided).
   * This is useful for observability even when wasCompacted=false.
   */
  historyEstimatedLength?: number;

  /**
   * 压缩后字符数
   */
  compactedLength: number;

  /**
   * 压缩比率 (compacted / original)
   */
  compressionRatio: number;

  /**
   * 是否触发了压缩
   */
  wasCompacted: boolean;

  /**
   * 保留的关键信息列表
   */
  preservedKeyInfo: KeyInfo[];

  /**
   * 压缩摘要（如果进行了压缩）
   */
  summary?: ContextSummary;
}

/**
 * 关键信息条目
 */
export interface KeyInfo {
  /**
   * 信息类型
   */
  type: 'agreement' | 'disagreement' | 'decision' | 'action_item' | 'critical_quote';

  /**
   * 来源 agent
   */
  agent: string;

  /**
   * 来源轮次
   */
  round: number;

  /**
   * 信息内容
   */
  content: string;

  /**
   * 重要性评分 (0-1)
   */
  importance: number;
}

/**
 * 上下文摘要
 */
export interface ContextSummary {
  /**
   * 讨论进展概述
   */
  progressOverview: string;

  /**
   * 已达成的共识点
   */
  agreements: string[];

  /**
   * 仍存在的分歧点
   */
  disagreements: string[];

  /**
   * 待决定的事项
   */
  pendingDecisions: string[];

  /**
   * 被压缩的轮次范围
   */
  compactedRounds: { from: number; to: number };

  /**
   * 各参与者的立场摘要
   */
  participantStances: Record<string, string>;
}

/**
 * 上下文状态追踪
 */
export interface ContextState {
  /**
   * 当前总字符数
   */
  totalChars: number;

  /**
   * 当前 token 估算数（chars / 4）
   */
  estimatedTokens: number;

  /**
   * 已压缩次数
   */
  compactionCount: number;

  /**
   * 最后压缩时间
   */
  lastCompactionTime?: number;

  /**
   * 历史摘要（多次压缩时累积）
   */
  historicalSummaries: ContextSummary[];
}

/**
 * 压缩策略
 */
export type CompactionStrategy = 
  | 'summarize'      // 生成摘要替换旧内容
  | 'truncate'       // 直接截断旧内容
  | 'selective'      // 选择性保留关键信息
  | 'hybrid';        // 混合策略（推荐）

/**
 * 消息重要性评估结果
 */
export interface MessageImportance {
  message: DiscussionMessage;
  score: number;
  reasons: string[];
  shouldPreserve: boolean;
}
