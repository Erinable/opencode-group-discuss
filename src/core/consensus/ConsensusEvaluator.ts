/**
 * ConsensusEvaluator - 共识评估器
 * 多维度评估讨论中的共识程度
 */

import type { DiscussionMessage } from '../../types/index.js';
import type {
  ConsensusConfig,
  ConsensusReport,
  Disagreement,
  Claim,
  Stance
} from './types.js';
import { DEFAULT_CONSENSUS_CONFIG } from './types.js';

export class ConsensusEvaluator {
  private config: ConsensusConfig;

  constructor(config: Partial<ConsensusConfig> = {}) {
    this.config = {
      ...DEFAULT_CONSENSUS_CONFIG,
      ...config,
      keywordWeights: {
        ...DEFAULT_CONSENSUS_CONFIG.keywordWeights,
        ...config.keywordWeights
      }
    };
  }

  /**
   * 评估消息列表的共识程度
   */
  async evaluate(messages: DiscussionMessage[]): Promise<ConsensusReport> {
    if (messages.length < 2) {
      return this.createEmptyReport();
    }

    const keywordScore = this.analyzeKeywords(messages);
    const referenceScore = this.analyzeReferences(messages);
    const convergenceRate = this.config.enableConvergenceAnalysis
      ? this.analyzeConvergence(messages)
      : 0;

    const overallScore = this.combineScores(keywordScore, referenceScore, convergenceRate);
    const disagreements = this.identifyDisagreements(messages);

    return {
      overallScore,
      convergenceRate,
      agreementMatrix: this.buildAgreementMatrix(messages),
      mainClaims: [],
      stances: [],
      disagreements,
      recommendation: this.getRecommendation(overallScore, disagreements, convergenceRate)
    };
  }

  /**
   * 策略1: 关键词分析
   * 基于正向/负向关键词的加权匹配
   */
  private analyzeKeywords(messages: DiscussionMessage[]): number {
    const lastRoundMessages = this.getLastRoundMessages(messages);
    if (lastRoundMessages.length === 0) return 0.5;

    let totalScore = 0;
    let matchCount = 0;

    for (const msg of lastRoundMessages) {
      const content = msg.content.toLowerCase();
      for (const [keyword, weight] of Object.entries(this.config.keywordWeights!)) {
        if (content.includes(keyword.toLowerCase())) {
          totalScore += weight;
          matchCount++;
        }
      }
    }

    if (matchCount === 0) return 0.5; // 无匹配时返回中性值

    // 归一化到 0-1 范围
    const avgScore = totalScore / lastRoundMessages.length;
    const normalized = Math.max(0, Math.min(1, (avgScore + 1) / 2));
    return normalized;
  }

  /**
   * 策略2: 引用/回应模式分析
   * 检测 Agent 是否引用他人观点
   */
  private analyzeReferences(messages: DiscussionMessage[]): number {
    const lastRoundMessages = this.getLastRoundMessages(messages);
    if (lastRoundMessages.length === 0) return 0.5;

    const agents = [...new Set(messages.map(m => m.agent))];
    let positiveRefs = 0;
    let negativeRefs = 0;

    // 正向引用模式
    const positivePatterns = [
      /同意.{0,10}(的观点|所说|的看法)?/,
      /正如.{0,10}(所说|提到|指出)/,
      /确实如.{0,10}所说/,
      /赞同.{0,5}的/,
      /支持.{0,5}的/,
      /@\w+.{0,10}说得对/,
      /agree with/i,
      /as .{0,10} mentioned/i
    ];

    // 负向引用模式
    const negativePatterns = [
      /不同意.{0,10}(的观点|所说|的看法)?/,
      /与.{0,10}观点不同/,
      /反对.{0,10}(的提议|的方案)?/,
      /disagree with/i,
      /contrary to/i
    ];

    for (const msg of lastRoundMessages) {
      const content = msg.content;

      for (const pattern of positivePatterns) {
        if (pattern.test(content)) {
          positiveRefs++;
        }
      }

      for (const pattern of negativePatterns) {
        if (pattern.test(content)) {
          negativeRefs++;
        }
      }
    }

    const total = positiveRefs + negativeRefs;
    if (total === 0) return 0.5; // 无引用，中性
    return positiveRefs / total;
  }

  /**
   * 策略3: 趋同轨迹分析
   * 对比相邻轮次的观点变化
   */
  private analyzeConvergence(messages: DiscussionMessage[]): number {
    const rounds = [...new Set(messages.map(m => m.round))].sort((a, b) => a - b);
    if (rounds.length < 2) return 0;

    // 比较最后两轮的共识度变化
    const prevRound = rounds[rounds.length - 2];
    const currRound = rounds[rounds.length - 1];

    const prevRoundMsgs = messages.filter(m => m.round === prevRound);
    const currRoundMsgs = messages.filter(m => m.round === currRound);

    const prevScore = this.calculateRoundKeywordScore(prevRoundMsgs);
    const currScore = this.calculateRoundKeywordScore(currRoundMsgs);

    // 正值表示趋同，负值表示分歧加剧
    return currScore - prevScore;
  }

  /**
   * 计算单轮的关键词得分
   */
  private calculateRoundKeywordScore(messages: DiscussionMessage[]): number {
    if (messages.length === 0) return 0.5;

    let totalScore = 0;
    for (const msg of messages) {
      const content = msg.content.toLowerCase();
      for (const [keyword, weight] of Object.entries(this.config.keywordWeights!)) {
        if (content.includes(keyword.toLowerCase())) {
          totalScore += weight;
        }
      }
    }

    return Math.max(0, Math.min(1, (totalScore / messages.length + 1) / 2));
  }

  /**
   * 识别分歧点
   */
  private identifyDisagreements(messages: DiscussionMessage[]): Disagreement[] {
    const disagreements: Disagreement[] = [];
    const lastRoundMessages = this.getLastRoundMessages(messages);

    // 检测明确的反对表述
    const oppositionPatterns = [
      { pattern: /不同意.{0,20}(的观点|的看法)?/, severity: 'minor' as const },
      { pattern: /反对.{0,20}(的提议|的方案)?/, severity: 'major' as const },
      { pattern: /强烈反对/, severity: 'blocking' as const },
      { pattern: /坚决不同意/, severity: 'blocking' as const },
      { pattern: /与.+观点相左/, severity: 'minor' as const },
      { pattern: /disagree/i, severity: 'minor' as const },
      { pattern: /strongly disagree/i, severity: 'major' as const }
    ];

    for (const msg of lastRoundMessages) {
      for (const { pattern, severity } of oppositionPatterns) {
        if (pattern.test(msg.content)) {
          disagreements.push({
            claimId: `disagreement_r${msg.round}_${msg.agent}`,
            topic: this.extractDisagreementTopic(msg.content, pattern),
            supporters: [],
            opposers: [msg.agent],
            severity
          });
        }
      }
    }

    return disagreements;
  }

  /**
   * 提取分歧主题
   */
  private extractDisagreementTopic(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    if (match) {
      // 提取匹配内容周围的上下文
      const index = content.indexOf(match[0]);
      const start = Math.max(0, index - 20);
      const end = Math.min(content.length, index + match[0].length + 30);
      return content.substring(start, end).replace(/\n/g, ' ').trim();
    }
    return '';
  }

  /**
   * 综合多个得分
   */
  private combineScores(keyword: number, reference: number, convergence: number): number {
    // 加权组合
    const weights = { keyword: 0.5, reference: 0.3, convergence: 0.2 };
    const baseScore = keyword * weights.keyword + reference * weights.reference;

    // 趋同率作为调节因子 (仅正向趋同有加成)
    const convergenceBonus = Math.max(0, convergence) * weights.convergence;

    return Math.max(0, Math.min(1, baseScore + convergenceBonus));
  }

  /**
   * 根据评估结果给出建议
   */
  private getRecommendation(
    score: number,
    disagreements: Disagreement[],
    convergence: number
  ): 'continue' | 'conclude' | 'pivot' {
    const blockingDisagreements = disagreements.filter(d => d.severity === 'blocking');
    const majorDisagreements = disagreements.filter(d => d.severity === 'major');

    // 存在阻断性分歧且趋同停滞，建议转向
    if (blockingDisagreements.length > 0 && convergence <= 0) {
      return 'pivot';
    }

    // 高共识度，建议结束
    if (score >= this.config.consensusThreshold) {
      return 'conclude';
    }

    // 中等共识度且无重大分歧，也可以结束
    if (score >= 0.7 && majorDisagreements.length === 0 && convergence >= 0) {
      return 'conclude';
    }

    return 'continue';
  }

  /**
   * 获取最后一轮的消息
   */
  private getLastRoundMessages(messages: DiscussionMessage[]): DiscussionMessage[] {
    if (messages.length === 0) return [];
    const lastRound = Math.max(...messages.map(m => m.round));
    return messages.filter(m => m.round === lastRound);
  }

  /**
   * 构建 Agent 间的一致性矩阵
   */
  private buildAgreementMatrix(messages: DiscussionMessage[]): Record<string, Record<string, number>> {
    const agents = [...new Set(messages.map(m => m.agent))];
    const matrix: Record<string, Record<string, number>> = {};

    for (const a of agents) {
      matrix[a] = {};
      for (const b of agents) {
        if (a === b) {
          matrix[a][b] = 1.0;
        } else {
          // 简化实现：默认中性
          matrix[a][b] = 0.5;
        }
      }
    }

    return matrix;
  }

  /**
   * 创建空报告
   */
  private createEmptyReport(): ConsensusReport {
    return {
      overallScore: 0,
      convergenceRate: 0,
      agreementMatrix: {},
      mainClaims: [],
      stances: [],
      disagreements: [],
      recommendation: 'continue'
    };
  }
}
