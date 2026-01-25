/**
 * Debate Mode - Dynamic Version
 * Supports any number of custom agents provided by the user.
 */

import type { DiscussionMode, DiscussionMessage } from "../types/index.js";
import type { ConsensusConfig } from "../core/consensus/types.js";
import type { TerminationCondition, TerminationSignal } from "../core/termination/types.js";

export class DebateMode implements DiscussionMode {
  /**
   * 动态获取发言者顺序
   */
  async getSpeakers(
    round: number,
    totalRounds: number,
    agents: string[]
  ): Promise<string[]> {
    // 提取纯名称（去除描述部分）
    const agentNames = agents.map(a => a.split(':')[0].trim());

    // 如果是最后一轮且包含类似 moderator/裁判/总结者 角色，确保他们最后发言
    if (round === totalRounds) {
      return agentNames;
    } else {
      // 前几轮：排除带有“总结/裁判/moderator”含义的角色，专注于辩论
      return agentNames.filter(name => {
        const n = name.toLowerCase();
        return !n.includes('moderator') && !n.includes('裁判') && !n.includes('总结');
      });
    }
  }

  /**
   * 动态提取或生成 Agent 角色描述
   */
  getAgentRole(agentName: string): string {
    // 逻辑：如果输入是 "Security:负责安全审计"，提取描述；
    // 如果只有 "Security"，则生成 "专注于 Security 领域的专家"
    if (agentName.includes(':')) {
      return agentName.split(':')[1].trim();
    }
    return `专注于 ${agentName} 领域的专业人士，负责提供该维度的深度见解和挑战。`;
  }

  async shouldStop(
    messages: DiscussionMessage[],
    currentRound: number
  ): Promise<boolean> {
    // 只有当有两条以上消息且最近的消息包含“达成共识”时才停止
    if (messages.length < 2) return false;
    const lastMsg = messages[messages.length - 1].content;
    return lastMsg.includes('【达成共识】') || lastMsg.includes('CONCURRENCE');
  }

  async generateConclusion(
    messages: DiscussionMessage[],
    topic: string
  ): Promise<string> {
    if (messages.length === 0) return "讨论未产生有效内容。";

    // 找最后一轮的 moderator 发言作为结论
    const lastRound = Math.max(...messages.map(m => m.round));
    const moderatorMsg = messages.find(
      m => m.round === lastRound &&
           (m.agent.toLowerCase().includes('moderator') ||
            m.agent.includes('主持') ||
            m.agent.includes('裁判'))
    );

    if (moderatorMsg) {
      return moderatorMsg.content;
    }

    // 兜底：取最后一条消息
    return messages[messages.length - 1].content;
  }

  calculateConsensus(messages: DiscussionMessage[]): number {
    if (messages.length < 2) return 0;
    const consensusKeywords = ["同意", "认同", "一致", "没意见", "agree", "concur"];
    const lastRound = messages.filter(m => m.round === Math.max(...messages.map(x => x.round)));
    const agrees = lastRound.filter(m => 
      consensusKeywords.some(k => m.content.toLowerCase().includes(k))
    ).length;
    return agrees / lastRound.length;
  }

  /**
   * P0: 获取辩论模式的共识配置
   * 辩论模式对共识要求更高，阈值设为 0.85
   */
  getConsensusConfig(): Partial<ConsensusConfig> {
    return {
      consensusThreshold: 0.85,
      enableConvergenceAnalysis: true,
      stalemateWindow: 2,
      keywordWeights: {
        // 辩论模式额外增加一些对抗性关键词的权重
        '让步': 0.6,
        '接受': 0.7,
        '妥协': 0.5,
        'concede': 0.6,
        'accept': 0.7,
      }
    };
  }

  /**
   * P0: 获取辩论模式的自定义终止条件
   */
  getTerminationConditions(): TerminationCondition[] {
    return [
      // 辩论模式特有：Moderator 明确宣布结论
      {
        name: 'moderator_decision',
        priority: 95,
        check: async (ctx): Promise<TerminationSignal> => {
          if (ctx.messages.length === 0) {
            return { shouldStop: false, confidence: 0 };
          }

          // 检查最后一条消息是否来自 moderator 且包含结论性表述
          const lastMsg = ctx.messages[ctx.messages.length - 1];
          const isModerator = 
            lastMsg.agent.toLowerCase().includes('moderator') ||
            lastMsg.agent.includes('主持') ||
            lastMsg.agent.includes('裁判');

          if (!isModerator) {
            return { shouldStop: false, confidence: 0 };
          }

          const conclusionPatterns = [
            '综合各方观点',
            '最终裁定',
            '经过讨论',
            '我的结论是',
            '总结如下',
            'in conclusion',
            'final verdict'
          ];

          if (conclusionPatterns.some(p => lastMsg.content.toLowerCase().includes(p.toLowerCase()))) {
            return {
              shouldStop: true,
              reason: 'Moderator 已做出裁定',
              confidence: 0.95
            };
          }

          return { shouldStop: false, confidence: 0 };
        }
      }
    ];
  }
}
