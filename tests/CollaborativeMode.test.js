
import { test } from 'node:test';
import assert from 'node:assert';
import { CollaborativeMode } from '../dist/modes/CollaborativeMode.js';

test('CollaborativeMode.getSpeakers: includes all agents every round', async (t) => {
    const mode = new CollaborativeMode();
    const agents = ['Frontend', 'Backend', 'moderator'];

    // Round 1: everyone speaks
    const r1 = await mode.getSpeakers(1, 3, agents);
    assert.deepStrictEqual(r1, ['Frontend', 'Backend', 'moderator']);

    // Round 2: still everyone
    const r2 = await mode.getSpeakers(2, 3, agents);
    assert.deepStrictEqual(r2, ['Frontend', 'Backend', 'moderator']);
});

test('CollaborativeMode.getSpeakers: strips description from agent names', async (t) => {
    const mode = new CollaborativeMode();
    const agents = ['Dev:负责开发', 'PM:负责产品'];

    const speakers = await mode.getSpeakers(1, 1, agents);
    assert.deepStrictEqual(speakers, ['Dev', 'PM']);
});

test('CollaborativeMode.getAgentRole: extracts role from name:description', async (t) => {
    const mode = new CollaborativeMode();

    const role = mode.getAgentRole('Security:负责安全审计');
    assert.strictEqual(role, '负责安全审计');
});

test('CollaborativeMode.getAgentRole: generates default role for plain name', async (t) => {
    const mode = new CollaborativeMode();

    const role = mode.getAgentRole('DevOps');
    assert.ok(role.includes('DevOps'), 'Should include agent name');
    assert.ok(role.includes('建设性'), 'Should mention constructive contribution');
});

test('CollaborativeMode.shouldStop: returns false for few messages', async (t) => {
    const mode = new CollaborativeMode();
    const messages = [
        { agent: 'A', content: '可行', round: 1, timestamp: 1 },
        { agent: 'B', content: '同意', round: 1, timestamp: 2 }
    ];

    const result = await mode.shouldStop(messages, 1);
    assert.strictEqual(result, false, 'Need at least 3 messages');
});

test('CollaborativeMode.shouldStop: returns false if not all agree', async (t) => {
    const mode = new CollaborativeMode();
    const messages = [
        { agent: 'A', content: '可行', round: 1, timestamp: 1 },
        { agent: 'B', content: '同意', round: 1, timestamp: 2 },
        { agent: 'C', content: '我觉得还需要讨论', round: 1, timestamp: 3 }
    ];

    const result = await mode.shouldStop(messages, 1);
    assert.strictEqual(result, false);
});

test('CollaborativeMode.shouldStop: returns true when last 3 all agree', async (t) => {
    const mode = new CollaborativeMode();
    const messages = [
        { agent: 'A', content: '我觉得需要讨论', round: 1, timestamp: 1 },
        { agent: 'B', content: '方案可行', round: 2, timestamp: 2 },
        { agent: 'C', content: '同意，LGTM', round: 2, timestamp: 3 },
        { agent: 'A', content: '确认可以开始', round: 2, timestamp: 4 }
    ];

    const result = await mode.shouldStop(messages, 2);
    assert.strictEqual(result, true);
});

test('CollaborativeMode.generateConclusion: formats last round messages', async (t) => {
    const mode = new CollaborativeMode();
    const messages = [
        { agent: 'A', content: 'Round 1 thoughts', round: 1, timestamp: 1 },
        { agent: 'B', content: 'Final proposal', round: 2, timestamp: 2 },
        { agent: 'C', content: 'Agreed approach', round: 2, timestamp: 3 }
    ];

    const conclusion = await mode.generateConclusion(messages, 'Test Topic');

    assert.ok(conclusion.includes('协作产出方案'), 'Should have header');
    assert.ok(conclusion.includes('Test Topic'), 'Should include topic');
    assert.ok(conclusion.includes('Final proposal'), 'Should include round 2 message');
    assert.ok(conclusion.includes('Agreed approach'), 'Should include round 2 message');
    assert.ok(!conclusion.includes('Round 1 thoughts'), 'Should NOT include round 1 message');
});

test('CollaborativeMode.generateConclusion: handles empty messages', async (t) => {
    const mode = new CollaborativeMode();

    const conclusion = await mode.generateConclusion([], 'Empty Topic');
    assert.ok(conclusion.includes('未达成'), 'Should indicate no result');
});

test('CollaborativeMode.calculateConsensus: always returns 1.0', async (t) => {
    const mode = new CollaborativeMode();

    // Collaborative mode assumes full consensus
    assert.strictEqual(mode.calculateConsensus([]), 1.0);
    assert.strictEqual(mode.calculateConsensus([{ agent: 'A', content: 'test', round: 1, timestamp: 1 }]), 1.0);
});
