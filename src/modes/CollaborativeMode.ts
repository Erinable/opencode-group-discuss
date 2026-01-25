/**
 * Collaborative Mode - Focused on construction and synthesis
 */
import type { DiscussionMode, DiscussionMessage } from "../types/index.js";
import type { ConsensusConfig } from "../core/consensus/types.js";
import type { TerminationCondition, TerminationSignal } from "../core/termination/types.js";

export class CollaborativeMode implements DiscussionMode {
  /**
   * 协作模式下，每一轮所有人都应该参与
   */
  async getSpeakers(round: number, totalRounds: number, agents: string[]): Promise<string[]> {
    return agents.map(a => a.split(':')[0].trim());
  }

  getAgentRole(agentName: string): string {
    if (agentName.includes(':')) return agentName.split(':')[1].trim();
    return `项目团队成员，负责从 ${agentName} 维度提供建设性方案。`;
  }

  /**
   * 当方案基本成型且大家都表示“可行”或“同意”时停止
   */
  async shouldStop(messages: DiscussionMessage[], currentRound: number): Promise<boolean> {
    if (messages.length < 3) return false;
    const lastThree = messages.slice(-3);
    const consensusKeywords = ["可行", "同意", "一致", "可以开始", "确认", "LGTM"];
    return lastThree.every(m => 
      consensusKeywords.some(k => m.content.toLowerCase().includes(k))
    );
  }

  /**
   * 结论只取最后一轮的共识
   */
  async generateConclusion(messages: DiscussionMessage[], topic: string): Promise<string> {
    if (messages.length === 0) return "未达成有效方案。";

    const lastRound = Math.max(...messages.map(m => m.round));
    const finalMessages = messages.filter(m => m.round === lastRound);

    return `【协作产出方案】\n针对话题"${topic}"，团队达成以下共识：\n\n` +
           finalMessages.map(m => `[@${m.agent}]: ${m.content}`).join("\n\n");
  }

  calculateConsensus(messages: DiscussionMessage[]): number {
    return 1.0; 
  }

  /**
   * P0: 获取协作模式的共识配置
   * 协作模式对共识要求相对宽松，阈值设为 0.75
   */
  getConsensusConfig(): Partial<ConsensusConfig> {
    return {
      consensusThreshold: 0.75,
      enableConvergenceAnalysis: true,
      stalemateWindow: 3, // 协作模式允许更多轮次的探讨
      keywordWeights: {
        // 协作模式强调建设性关键词
        '补充': 0.6,
        '建议': 0.5,
        '方案': 0.4,
        '优化': 0.5,
        '完善': 0.6,
        'suggest': 0.5,
        'propose': 0.5,
        'enhance': 0.5,
      }
    };
  }

  /**
   * P0: 获取协作模式的自定义终止条件
   */
  getTerminationConditions(): TerminationCondition[] {
    return [
      // 协作模式特有：所有成员连续表示"可行/可以开始"
      {
        name: 'all_approve',
        priority: 85,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.messages.length < 3) {
            return { shouldStop: false, confidence: 0 };
          }

          // 获取最后一轮的消息
          const lastRound = Math.max(...ctx.messages.map(m => m.round));
          const lastRoundMsgs = ctx.messages.filter(m => m.round === lastRound);

          if (lastRoundMsgs.length < 2) {
            return { shouldStop: false, confidence: 0 };
          }

          const approvalPatterns = ['可行', '同意', '可以开始', '确认', 'LGTM', 'approved', 'looks good'];
          const allApprove = lastRoundMsgs.every(m =>
            approvalPatterns.some(p => m.content.toLowerCase().includes(p.toLowerCase()))
          );

          if (allApprove) {
            return {
              shouldStop: true,
              reason: '所有成员已批准方案',
              confidence: 0.9
            };
          }

          return { shouldStop: false, confidence: 0 };
        }
      },
      // 协作模式特有：方案已完整（检测到 action items 或具体步骤）
      {
        name: 'actionable_plan',
        priority: 70,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.currentRound < 2) {
            return { shouldStop: false, confidence: 0 };
          }

          const lastMsg = ctx.messages[ctx.messages.length - 1];
          const actionablePatterns = [
            '具体步骤',
            '行动项',
            'action items',
            '执行计划',
            '第一步',
            '第二步',
            'step 1',
            'step 2',
            '1\\.',
            '2\\.',
          ];

          const hasActionItems = actionablePatterns.some(p => 
            new RegExp(p, 'i').test(lastMsg.content)
          );

          // 同时检查共识度
          if (hasActionItems && ctx.consensusReport.overallScore >= 0.7) {
            return {
              shouldStop: true,
              reason: '已形成可执行方案',
              confidence: 0.8
            };
          }

          return { shouldStop: false, confidence: 0 };
        }
      }
    ];
  }
}
