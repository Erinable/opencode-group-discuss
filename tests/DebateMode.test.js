
import { test } from 'node:test';
import assert from 'node:assert';
import { DebateMode } from '../dist/modes/DebateMode.js';

test('DebateMode.getSpeakers: excludes moderator in early rounds', async (t) => {
    const mode = new DebateMode();
    const agents = ['advocate', 'critic', 'moderator'];

    const speakers = await mode.getSpeakers(1, 3, agents);

    assert.ok(!speakers.includes('moderator'), 'Should exclude moderator in round 1');
    assert.deepStrictEqual(speakers, ['advocate', 'critic']);
});

test('DebateMode.getSpeakers: includes all agents in final round', async (t) => {
    const mode = new DebateMode();
    const agents = ['advocate', 'critic', 'moderator'];

    const speakers = await mode.getSpeakers(3, 3, agents);

    assert.deepStrictEqual(speakers, ['advocate', 'critic', 'moderator']);
});

test('DebateMode.getSpeakers: handles custom agent names', async (t) => {
    const mode = new DebateMode();
    const agents = ['Frontend', 'Backend', '裁判'];

    // Round 1: excludes 裁判
    const r1 = await mode.getSpeakers(1, 2, agents);
    assert.deepStrictEqual(r1, ['Frontend', 'Backend']);

    // Final round: includes all
    const r2 = await mode.getSpeakers(2, 2, agents);
    assert.deepStrictEqual(r2, ['Frontend', 'Backend', '裁判']);
});

test('DebateMode.getAgentRole: extracts role from name:description format', async (t) => {
    const mode = new DebateMode();

    const role = mode.getAgentRole('Security:负责安全审计');
    assert.strictEqual(role, '负责安全审计');
});

test('DebateMode.getAgentRole: generates default role for plain name', async (t) => {
    const mode = new DebateMode();

    const role = mode.getAgentRole('Frontend');
    assert.ok(role.includes('Frontend'), 'Should include agent name');
    assert.ok(role.includes('专注于') || role.includes('专业'), 'Should have professional description');
});

test('DebateMode.shouldStop: returns false for few messages', async (t) => {
    const mode = new DebateMode();

    const result = await mode.shouldStop([{ agent: 'A', content: 'test', round: 1, timestamp: 1 }], 1);
    assert.strictEqual(result, false);
});

test('DebateMode.shouldStop: returns true when consensus reached', async (t) => {
    const mode = new DebateMode();
    const messages = [
        { agent: 'A', content: 'I propose X', round: 1, timestamp: 1 },
        { agent: 'B', content: '【达成共识】同意X方案', round: 1, timestamp: 2 }
    ];

    const result = await mode.shouldStop(messages, 1);
    assert.strictEqual(result, true);
});

test('DebateMode.calculateConsensus: returns 0 for single message', async (t) => {
    const mode = new DebateMode();

    const consensus = mode.calculateConsensus([{ agent: 'A', content: 'test', round: 1, timestamp: 1 }]);
    assert.strictEqual(consensus, 0);
});

test('DebateMode.calculateConsensus: calculates ratio correctly', async (t) => {
    const mode = new DebateMode();
    const messages = [
        { agent: 'A', content: '我同意这个方案', round: 2, timestamp: 1 },
        { agent: 'B', content: '我也认同', round: 2, timestamp: 2 },
        { agent: 'C', content: '我反对这个想法', round: 2, timestamp: 3 }
    ];

    const consensus = mode.calculateConsensus(messages);
    // 2 out of 3 agree
    assert.ok(consensus > 0.6 && consensus < 0.7, `Expected ~0.67, got ${consensus}`);
});
