
import { test, mock } from 'node:test';
import assert from 'node:assert';
import { DiscussionFacade } from '../dist/core/engine/DiscussionFacade.js';
import { AgentRegistry } from '../dist/core/engine/AgentRegistry.js';

// Mock AgentRegistry to return known agents
test.before(() => {
    // Inject mock cache
    AgentRegistry.cache = new Set(['advocate', 'critic', 'moderator', 'general', 'explore']);
    AgentRegistry.initialized = true;
});

test('DiscussionFacade.transform: valid minimal input', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test topic'
    });

    assert.strictEqual(result.topic, 'Test topic');
    assert.strictEqual(result.mode, 'debate');
    assert.strictEqual(result.maxRounds, 3);
    assert.ok(result.participants.length > 0, 'Should have default participants');
});

test('DiscussionFacade.transform: respects custom rounds', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        rounds: 5
    });

    assert.strictEqual(result.maxRounds, 5);
});

test('DiscussionFacade.transform: respects mode', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        mode: 'collaborative'
    });

    assert.strictEqual(result.mode, 'collaborative');
});

test('DiscussionFacade.transform: throws on missing topic', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({});
    }, /Invalid configuration/);
});

test('DiscussionFacade.transform: throws on invalid rounds', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: 'Test', rounds: 100 });
    }, /Invalid configuration/);
});

test('DiscussionFacade.transform: normalizes subagentType to subagent_type', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        participants: [
            { name: 'CustomAgent', subagentType: 'general' }
        ]
    });

    assert.strictEqual(result.participants[0].name, 'CustomAgent');
    assert.strictEqual(result.participants[0].subagentType, 'general');
});

test('DiscussionFacade.transform: normalizes keepSessions to keep_sessions', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        keepSessions: true
    });

    assert.strictEqual(result.keepSessions, true);
});

test('DiscussionFacade.transform: normalizes maxRounds to rounds', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        maxRounds: 7
    });

    assert.strictEqual(result.maxRounds, 7);
});

test('DiscussionFacade.transform: uses specified agents', async (t) => {
    const result = await DiscussionFacade.transform({
        topic: 'Test',
        agents: ['advocate', 'critic']
    });

    const names = result.participants.map(p => p.name);
    assert.deepStrictEqual(names, ['advocate', 'critic']);
});

// Edge case tests
test('DiscussionFacade.transform: throws on empty topic', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: '' });
    }, /Topic cannot be empty/);
});

test('DiscussionFacade.transform: throws on rounds = 0', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: 'Test', rounds: 0 });
    }, /Rounds must be at least 1/);
});

test('DiscussionFacade.transform: throws on negative rounds', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: 'Test', rounds: -5 });
    }, /Rounds must be at least 1/);
});

test('DiscussionFacade.transform: throws on empty participant name', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({
            topic: 'Test',
            participants: [{ name: '', subagent_type: 'general' }]
        });
    }, /Participant name cannot be empty/);
});

test('DiscussionFacade.transform: throws on timeout too small', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: 'Test', timeout: 500 });
    }, /Timeout must be at least 1000ms/);
});

test('DiscussionFacade.transform: throws on negative concurrency', async (t) => {
    await assert.rejects(async () => {
        await DiscussionFacade.transform({ topic: 'Test', concurrency: 0 });
    }, /Concurrency must be at least 1/);
});
