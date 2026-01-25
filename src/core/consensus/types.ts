/**
 * Consensus Evaluation Types
 * 共识评估相关类型定义
 */

import type { DiscussionMessage } from '../../types/index.js';

/**
 * 核心主张/观点
 */
export interface Claim {
  id: string;
  text: string;
  author: string;
  round: number;
}

/**
 * Agent 对某个主张的立场
 */
export interface Stance {
  agentName: string;
  claimId: string;
  position: 'support' | 'oppose' | 'neutral' | 'conditional';
  confidence: number; // 0-1
  conditions?: string[]; // 如果是 conditional，记录条件
}

/**
 * 分歧点
 */
export interface Disagreement {
  claimId: string;
  topic?: string;
  supporters: string[];
  opposers: string[];
  severity: 'minor' | 'major' | 'blocking';
}

/**
 * 共识评估报告
 */
export interface ConsensusReport {
  /** 总体共识度 0-1 */
  overallScore: number;
  
  /** 观点趋同速度 (正值=趋同, 负值=分歧加剧, 0=稳定) */
  convergenceRate: number;
  
  /** Agent 两两间的一致性矩阵 */
  agreementMatrix: Record<string, Record<string, number>>;
  
  /** 核心主张列表 */
  mainClaims: Claim[];
  
  /** 各 Agent 立场 */
  stances: Stance[];
  
  /** 分歧点列表 */
  disagreements: Disagreement[];
  
  /** 建议: continue=继续讨论, conclude=可以结束, pivot=需要转向 */
  recommendation: 'continue' | 'conclude' | 'pivot';
}

/**
 * 共识评估配置
 */
export interface ConsensusConfig {
  /** 共识度阈值 (达到此值建议终止) */
  consensusThreshold: number;
  
  /** 是否启用趋同分析 */
  enableConvergenceAnalysis: boolean;
  
  /** 僵局检测窗口 (连续N轮无变化视为僵局) */
  stalemateWindow: number;
  
  /** 关键词权重配置 */
  keywordWeights?: Record<string, number>;
}

/**
 * 默认共识配置
 */
export const DEFAULT_CONSENSUS_CONFIG: ConsensusConfig = {
  consensusThreshold: 0.8,
  enableConvergenceAnalysis: true,
  stalemateWindow: 2,
  keywordWeights: {
    // 正向关键词
    '同意': 0.8,
    '认同': 0.8,
    '一致': 0.9,
    '支持': 0.7,
    '赞成': 0.8,
    '没问题': 0.7,
    '可以': 0.5,
    '可行': 0.6,
    '确认': 0.7,
    'agree': 0.8,
    'support': 0.7,
    'lgtm': 1.0,
    'concur': 0.8,
    
    // 负向关键词
    '反对': -0.8,
    '不同意': -0.8,
    '质疑': -0.5,
    '但是': -0.3,
    '然而': -0.3,
    '问题': -0.2,
    '风险': -0.2,
    'disagree': -0.8,
    'oppose': -0.8,
    'however': -0.3,
    'but': -0.2,
    
    // 条件性表述 (轻微正向)
    '如果': 0.1,
    '前提是': 0.1,
    '条件是': 0.1,
  }
};
