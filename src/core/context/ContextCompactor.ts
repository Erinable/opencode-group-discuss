/**
 * ContextCompactor - 上下文压缩保留器
 * 当上下文过长时，自动压缩旧轮次内容，保留关键结论与分歧
 */

import type {
  ContextCompactorConfig,
  CompactedContext,
  ContextSummary,
  KeyInfo,
  ContextState,
  MessageImportance
} from './types.js';
import type { DiscussionMessage } from '../../types/index.js';

export const DEFAULT_CONTEXT_COMPACTOR_CONFIG: Required<ContextCompactorConfig> = {
  maxContextChars: 32000,
  compactionThreshold: 0.8,
  maxMessageLength: 500,
  preserveRecentRounds: 1,
  enableKeyInfoExtraction: true,
  keywordWeights: {},
  includeSelfHistory: false
};

export interface ContextBuildOptions {
  currentRound: number;
  agentName?: string;
  baseContext?: string;
}

export class ContextCompactor {
  private config: Required<ContextCompactorConfig>;
  private state: ContextState;
  private processedKeywords: [string, number][];

  constructor(config: Partial<ContextCompactorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONTEXT_COMPACTOR_CONFIG,
      ...config,
      keywordWeights: {
        ...DEFAULT_CONTEXT_COMPACTOR_CONFIG.keywordWeights,
        ...config.keywordWeights
      }
    };

    this.processedKeywords = Object.entries(this.config.keywordWeights).map(
      ([keyword, weight]) => [keyword.toLowerCase(), weight]
    );

    this.state = {
      totalChars: 0,
      estimatedTokens: 0,
      compactionCount: 0,
      historicalSummaries: []
    };
  }

  getState(): ContextState {
    return this.state;
  }

  /**
   * 构建并压缩上下文
   */
  async buildContext(messages: DiscussionMessage[], options: ContextBuildOptions): Promise<CompactedContext> {
    const { currentRound, agentName, baseContext } = options;

    if (currentRound <= 1) {
      const content = baseContext ?? '';
      this.updateState(content.length);
      return this.createResult(content, false, [], undefined, content.length);
    }

    const historyMessages = messages
      .filter(m => m.round < currentRound)
      .filter(m => {
        if (!agentName) return true;
        if (this.config.includeSelfHistory) return true;
        return m.agent !== agentName;
      });

    const estimatedFullLength = this.estimateFullHistoryLength(historyMessages);
    const baseLen = baseContext ? baseContext.length : 0;
    const joinSep = baseContext && estimatedFullLength > 0 ? 2 : 0;
    const historyEstimatedLength = baseLen + joinSep + estimatedFullLength;
    this.updateState(historyEstimatedLength);

    const { recentMessages, olderMessages } = this.partitionMessages(historyMessages, currentRound);
    const recentHeader = this.buildRecentHeader(currentRound);

    if (!this.shouldCompact(estimatedFullLength)) {
      const recentText = this.buildFullHistoryContext(recentMessages, recentHeader);
      const content = [baseContext, recentText].filter(Boolean).join('\n\n').trim();
      // Not compacted: originalLength should reflect the actual injected content.
      // Keep historyEstimatedLength for observability.
      return this.createResult(content, false, [], undefined, historyEstimatedLength, content.length);
    }

    if (olderMessages.length === 0) {
      const recentText = this.buildFullHistoryContext(recentMessages, recentHeader);
      const content = [baseContext, recentText].filter(Boolean).join('\n\n').trim();
      return this.createResult(content, false, [], undefined, historyEstimatedLength, content.length);
    }

    const summary = this.summarizeMessages(olderMessages, currentRound);
    const keyInfos = this.config.enableKeyInfoExtraction ? this.extractKeyInfo(olderMessages) : [];

    const summaryText = this.buildSummaryText(summary, keyInfos);
    const recentText = this.buildFullHistoryContext(recentMessages, recentHeader);
    const compacted = [baseContext, summaryText, recentText].filter(Boolean).join('\n\n').trim();

    this.state.compactionCount += 1;
    this.state.lastCompactionTime = Date.now();
    this.state.historicalSummaries.push(summary);

    return this.createResult(compacted, true, keyInfos, summary, historyEstimatedLength);
  }

  /**
   * 判断是否需要压缩
   */
  private shouldCompact(length: number): boolean {
    return length >= this.config.maxContextChars * this.config.compactionThreshold;
  }

  /**
   * 将消息分为近期与历史
   */
  private partitionMessages(messages: DiscussionMessage[], currentRound: number): {
    recentMessages: DiscussionMessage[];
    olderMessages: DiscussionMessage[];
  } {
    const preserveRounds = Math.max(1, this.config.preserveRecentRounds);
    const preserveFromRound = Math.max(1, currentRound - preserveRounds);
    const recentMessages = messages.filter(m => m.round >= preserveFromRound);
    const olderMessages = messages.filter(m => m.round < preserveFromRound);
    return { recentMessages, olderMessages };
  }

  private buildRecentHeader(currentRound: number): string {
    const preserveRounds = Math.max(1, this.config.preserveRecentRounds);
    if (preserveRounds === 1) {
      const prevRound = Math.max(1, currentRound - 1);
      return `【第 ${prevRound} 轮其他成员发言】`;
    }
    return `【最近 ${preserveRounds} 轮其他成员发言】`;
  }

  /**
   * 构建完整历史上下文
   */
  private buildFullHistoryContext(messages: DiscussionMessage[], header?: string): string {
    if (messages.length === 0) return '';

    const roundMap = new Map<number, DiscussionMessage[]>();
    for (const m of messages) {
      const list = roundMap.get(m.round);
      if (list) list.push(m);
      else roundMap.set(m.round, [m]);
    }

    const rounds = [...roundMap.keys()].sort((a, b) => a - b);
    const parts: string[] = [];
    if (header) parts.push(header);

    for (const round of rounds) {
      parts.push(`【第 ${round} 轮发言】`);
      const roundMessages = roundMap.get(round) ?? [];
      for (const msg of roundMessages) {
        const content = this.truncateMessage(msg.content);
        parts.push(`@${msg.agent}:\n${content}`);
      }
      parts.push('');
    }

    return parts.join('\n').trim();
  }

  /**
   * 生成摘要
   */
  private summarizeMessages(messages: DiscussionMessage[], currentRound: number): ContextSummary {
    if (messages.length === 0) {
      return {
        progressOverview: '暂无历史内容需要压缩。',
        agreements: [],
        disagreements: [],
        pendingDecisions: [],
        compactedRounds: { from: 0, to: 0 },
        participantStances: {}
      };
    }

    const rounds = [...new Set(messages.map(m => m.round))].sort((a, b) => a - b);
    const keyInfos = this.extractKeyInfo(messages);

    const agreements = keyInfos
      .filter(k => k.type === 'agreement' || k.type === 'decision')
      .map(k => k.content);
    const disagreements = keyInfos
      .filter(k => k.type === 'disagreement')
      .map(k => k.content);
    const pendingDecisions = keyInfos
      .filter(k => k.type === 'action_item')
      .map(k => k.content);

    const participantStances: Record<string, string> = {};
    for (const msg of messages) {
      if (!participantStances[msg.agent]) {
        participantStances[msg.agent] = this.truncateMessage(msg.content, 160).replace(/\s+/g, ' ');
      }
    }

    return {
      progressOverview: `已压缩第 ${rounds[0]}-${rounds[rounds.length - 1]} 轮讨论内容（当前第 ${currentRound} 轮）。`,
      agreements: this.uniqueList(agreements).slice(0, 6),
      disagreements: this.uniqueList(disagreements).slice(0, 6),
      pendingDecisions: this.uniqueList(pendingDecisions).slice(0, 6),
      compactedRounds: { from: rounds[0], to: rounds[rounds.length - 1] },
      participantStances
    };
  }

  /**
   * 提取关键信息
   */
  private extractKeyInfo(messages: DiscussionMessage[]): KeyInfo[] {
    const keyInfos: KeyInfo[] = [];
    const patterns = {
      agreement: [/同意/i, /赞同/i, /支持/i, /达成共识/i, /一致/i, /agree/i, /support/i, /consensus/i],
      disagreement: [/不同意/i, /反对/i, /分歧/i, /无法接受/i, /不认可/i, /disagree/i, /object/i, /block/i],
      decision: [/决定/i, /决策/i, /最终方案/i, /采用/i, /decision/i, /we will/i, /choose/i, /adopt/i],
      action_item: [/TODO/i, /待定/i, /需要确认/i, /行动项/i, /跟进/i, /action item/i, /follow[- ]?up/i, /tbd/i]
    };

    for (const msg of messages) {
      const content = msg.content;
      const lower = content.toLowerCase();
      for (const [type, regexes] of Object.entries(patterns)) {
        if (regexes.some(regex => regex.test(content))) {
          const weightScore = this.scoreByKeywords(lower);
          keyInfos.push({
            type: type as KeyInfo['type'],
            agent: msg.agent,
            round: msg.round,
            content: this.truncateMessage(content, 220),
            importance: Math.max(0.1, Math.min(1, weightScore))
          });
        }
      }

      if (/@\w+/.test(content)) {
        keyInfos.push({
          type: 'critical_quote',
          agent: msg.agent,
          round: msg.round,
          content: this.truncateMessage(content, 220),
          importance: 0.5
        });
      }
    }

    return this.rankKeyInfos(keyInfos).slice(0, 12);
  }

  /**
   * 构建摘要文本
   */
  private buildSummaryText(summary: ContextSummary, keyInfos: KeyInfo[]): string {
    if (!summary) return '';

    let text = '【讨论摘要】\n';
    text += `进展: ${summary.progressOverview}\n`;

    if (summary.agreements.length > 0) {
      text += `共识: ${summary.agreements.join('；')}\n`;
    }

    if (summary.disagreements.length > 0) {
      text += `分歧: ${summary.disagreements.join('；')}\n`;
    }

    if (summary.pendingDecisions.length > 0) {
      text += `待定: ${summary.pendingDecisions.join('；')}\n`;
    }

    const stances = Object.entries(summary.participantStances);
    if (stances.length > 0) {
      text += '立场摘要:\n';
      for (const [agent, stance] of stances) {
        text += `- @${agent}: ${stance}\n`;
      }
    }

    if (keyInfos.length > 0) {
      text += '关键引述:\n';
      for (const info of keyInfos.slice(0, 6)) {
        text += `- [${info.type}] @${info.agent}: ${info.content}\n`;
      }
    }

    return text.trim();
  }

  /**
   * 评估消息重要性（可用于扩展）
   */
  private evaluateMessageImportance(message: DiscussionMessage): MessageImportance {
    const score = this.scoreByKeywords(message.content.toLowerCase());
    return {
      message,
      score,
      reasons: [],
      shouldPreserve: score >= 0.6
    };
  }

  private scoreByKeywords(contentLower: string): number {
    let totalScore = 0;
    let matches = 0;
    for (const [kwLower, weight] of this.processedKeywords) {
      if (contentLower.includes(kwLower)) {
        totalScore += weight;
        matches += 1;
      }
    }

    if (matches === 0) return 0.5;
    const normalized = (totalScore / matches + 1) / 2;
    return Math.max(0, Math.min(1, normalized));
  }

  private rankKeyInfos(keyInfos: KeyInfo[]): KeyInfo[] {
    return [...keyInfos].sort((a, b) => b.importance - a.importance);
  }

  private truncateMessage(content: string, limit: number = this.config.maxMessageLength): string {
    if (content.length <= limit) return content.trim();
    return `${content.slice(0, limit).trim()}…`;
  }

  private uniqueList(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const cleaned = item.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      result.push(cleaned);
    }
    return result;
  }

  private updateState(totalChars: number): void {
    this.state.totalChars = totalChars;
    this.state.estimatedTokens = Math.ceil(totalChars / 4);
  }

  private estimateFullHistoryLength(messages: DiscussionMessage[]): number {
    if (messages.length === 0) return 0;

    const roundMap = new Map<number, DiscussionMessage[]>();
    for (const m of messages) {
      const list = roundMap.get(m.round);
      if (list) list.push(m);
      else roundMap.set(m.round, [m]);
    }

    const rounds = [...roundMap.keys()].sort((a, b) => a - b);
    let total = 0;
    for (const round of rounds) {
      total += `【第 ${round} 轮发言】\n`.length;
      const roundMessages = roundMap.get(round) ?? [];
      for (const msg of roundMessages) {
        const contentLen = this.truncateMessage(msg.content).length;
        total += `@${msg.agent}:\n`.length + contentLen + 1;
      }
      total += 1;
    }

    return total;
  }

  private createResult(
    content: string,
    wasCompacted: boolean,
    preservedKeyInfo: KeyInfo[],
    summary?: ContextSummary,
    historyEstimatedLength?: number,
    originalLengthOverride?: number
  ): CompactedContext {
    const originalLength = typeof originalLengthOverride === 'number'
      ? originalLengthOverride
      : (historyEstimatedLength ?? this.state.totalChars);
    const compactedLength = content.length;
    return {
      content,
      originalLength,
      historyEstimatedLength,
      compactedLength,
      compressionRatio: originalLength > 0 ? compactedLength / originalLength : 1,
      wasCompacted,
      preservedKeyInfo,
      summary
    };
  }
}
