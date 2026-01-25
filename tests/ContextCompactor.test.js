import { test } from 'node:test';
import assert from 'node:assert';
import { ContextCompactor } from '../dist/core/context/ContextCompactor.js';

const createMessage = (agent, content, round) => ({
    agent,
    content,
    round,
    timestamp: Date.now()
});

test('ContextCompactor: returns raw context when under threshold', async () => {
    const compactor = new ContextCompactor({
        maxContextChars: 1000,
        compactionThreshold: 0.9
    });

    const messages = [
        createMessage('A', '简短消息', 1),
        createMessage('B', '同意', 1)
    ];

    const result = await compactor.buildContext(messages, {
        currentRound: 2,
        agentName: 'A'
    });

    assert.strictEqual(result.wasCompacted, false);
    assert.strictEqual(result.compressionRatio, 1);
    assert.strictEqual(result.originalLength, result.compactedLength);
    assert.ok(result.content.includes('第 1 轮'));
});

test('ContextCompactor: compacts when exceeding threshold', async () => {
    const compactor = new ContextCompactor({
        maxContextChars: 200,
        compactionThreshold: 0.5,
        preserveRecentRounds: 1
    });

    const longText = '这是一个很长的讨论内容。'.repeat(20);
    const messages = [
        createMessage('A', longText, 1),
        createMessage('B', '我同意这个方案', 1),
        createMessage('A', longText, 2),
        createMessage('B', '继续补充一些细节', 2)
    ];

    const result = await compactor.buildContext(messages, {
        currentRound: 3,
        agentName: 'C'
    });

    assert.strictEqual(result.wasCompacted, true);
    assert.ok(result.content.includes('讨论摘要'));
    assert.ok(result.summary);
});

test('ContextCompactor: preserves recent rounds after compaction', async () => {
    const compactor = new ContextCompactor({
        maxContextChars: 120,
        compactionThreshold: 0.3,
        preserveRecentRounds: 1
    });

    const longText = '需要压缩的历史信息。'.repeat(15);
    const messages = [
        createMessage('A', longText, 1),
        createMessage('B', '第1轮回应', 1),
        createMessage('A', longText, 2),
        createMessage('B', '第2轮确认', 2)
    ];

    const result = await compactor.buildContext(messages, {
        currentRound: 3,
        agentName: 'C'
    });

    assert.strictEqual(result.wasCompacted, true);
    assert.ok(result.content.includes('第 2 轮'));
    assert.ok(result.summary.compactedRounds.from <= 1);
});
