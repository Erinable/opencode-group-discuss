/**
 * Collaborative Mode - Focused on construction and synthesis
 */
import type { DiscussionMode, DiscussionMessage } from "../types/index.js";

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
}
