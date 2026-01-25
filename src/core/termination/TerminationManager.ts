/**
 * TerminationManager - 动态终止条件管理器
 * 管理和评估多个终止条件
 */

import type {
  TerminationCondition,
  TerminationContext,
  TerminationSignal,
  TerminationConfig
} from './types.js';
import { DEFAULT_TERMINATION_CONFIG } from './types.js';

export class TerminationManager {
  private conditions: TerminationCondition[];
  private config: TerminationConfig;

  constructor(
    customConditions: TerminationCondition[] = [],
    config: Partial<TerminationConfig> = {}
  ) {
    this.config = { ...DEFAULT_TERMINATION_CONFIG, ...config };

    // 合并自定义条件和默认条件
    const defaultConditions = this.getDefaultConditions();
    const allConditions = [...customConditions, ...defaultConditions];

    // 去重 (按 name)，自定义条件优先
    const seen = new Set<string>();
    this.conditions = [];
    for (const cond of allConditions) {
      if (!seen.has(cond.name)) {
        seen.add(cond.name);
        this.conditions.push(cond);
      }
    }

    // 按优先级排序 (高优先级在前)
    this.conditions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查是否应该终止讨论
   */
  async shouldTerminate(context: TerminationContext): Promise<TerminationSignal> {
    for (const condition of this.conditions) {
      try {
        const signal = await condition.check(context);
        if (signal.shouldStop && signal.confidence >= this.config.minConfidence) {
          return {
            shouldStop: true,
            reason: `[${condition.name}] ${signal.reason || ''}`.trim(),
            confidence: signal.confidence
          };
        }
      } catch (error) {
        // 条件检查失败时跳过该条件
        console.warn(`Termination condition "${condition.name}" failed:`, error);
      }
    }

    return { shouldStop: false, confidence: 0 };
  }

  /**
   * 获取默认终止条件
   */
  private getDefaultConditions(): TerminationCondition[] {
    return [
      // 1. 显式共识声明 (最高优先级)
      {
        name: 'explicit_consensus',
        priority: 100,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.messages.length === 0) {
            return { shouldStop: false, confidence: 0 };
          }

          const lastMsg = ctx.messages[ctx.messages.length - 1].content;
          const explicitPatterns = [
            '【达成共识】',
            '【最终结论】',
            'CONSENSUS_REACHED',
            'FINAL_DECISION',
            '【结论】'
          ];

          if (explicitPatterns.some(p => lastMsg.includes(p))) {
            return {
              shouldStop: true,
              reason: '显式共识声明',
              confidence: 1.0
            };
          }

          return { shouldStop: false, confidence: 0 };
        }
      },

      // 2. 高共识度
      {
        name: 'high_consensus',
        priority: 90,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.consensusReport.overallScore >= 0.85) {
            return {
              shouldStop: true,
              reason: `共识度达到 ${(ctx.consensusReport.overallScore * 100).toFixed(0)}%`,
              confidence: 0.9
            };
          }
          return { shouldStop: false, confidence: 0 };
        }
      },

      // 3. 观点收敛 (趋同后继续讨论收益有限)
      {
        name: 'convergence_plateau',
        priority: 80,
        check: async (ctx): Promise<TerminationSignal> => {
          // 至少完成2轮，趋同速度接近0，且已有一定共识基础
          if (
            ctx.currentRound >= 2 &&
            Math.abs(ctx.consensusReport.convergenceRate) < 0.05 &&
            ctx.consensusReport.overallScore >= 0.6
          ) {
            return {
              shouldStop: true,
              reason: '观点已趋于稳定，继续讨论收益有限',
              confidence: 0.8
            };
          }
          return { shouldStop: false, confidence: 0 };
        }
      },

      // 4. 协作模式的快速共识
      {
        name: 'collaborative_consensus',
        priority: 75,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.mode === 'collaborative' && ctx.consensusReport.overallScore >= 0.75) {
            return {
              shouldStop: true,
              reason: '协作模式下达成有效共识',
              confidence: 0.85
            };
          }
          return { shouldStop: false, confidence: 0 };
        }
      },

      // 5. 僵局检测
      {
        name: 'stalemate',
        priority: 60,
        check: async (ctx): Promise<TerminationSignal> => {
          if (!this.config.enableStalemateDetection) {
            return { shouldStop: false, confidence: 0 };
          }

          // 超过阈值轮数且共识度未提升，存在重大分歧
          const hasBlockingDisagreement = ctx.consensusReport.disagreements.some(
            d => d.severity === 'blocking' || d.severity === 'major'
          );

          if (
            ctx.currentRound >= this.config.stalemateRounds &&
            ctx.consensusReport.convergenceRate <= 0 &&
            hasBlockingDisagreement
          ) {
            return {
              shouldStop: true,
              reason: '检测到讨论僵局，存在难以调和的分歧',
              confidence: 0.7
            };
          }

          return { shouldStop: false, confidence: 0 };
        }
      },

      // 6. 超时保护 (10分钟)
      {
        name: 'timeout',
        priority: 50,
        check: async (ctx): Promise<TerminationSignal> => {
          const maxTime = 10 * 60 * 1000; // 10 minutes
          if (ctx.elapsedTime >= maxTime) {
            return {
              shouldStop: true,
              reason: `讨论超时 (${Math.round(ctx.elapsedTime / 60000)} 分钟)`,
              confidence: 1.0
            };
          }
          return { shouldStop: false, confidence: 0 };
        }
      }
    ];
  }

  /**
   * 添加自定义终止条件
   */
  addCondition(condition: TerminationCondition): void {
    // 移除同名条件
    this.conditions = this.conditions.filter(c => c.name !== condition.name);
    this.conditions.push(condition);
    this.conditions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 移除终止条件
   */
  removeCondition(name: string): boolean {
    const initialLength = this.conditions.length;
    this.conditions = this.conditions.filter(c => c.name !== name);
    return this.conditions.length < initialLength;
  }

  /**
   * 获取所有条件名称
   */
  getConditionNames(): string[] {
    return this.conditions.map(c => c.name);
  }
}
