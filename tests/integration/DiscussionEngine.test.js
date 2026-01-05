
import { test } from 'node:test';
import assert from 'node:assert';
import { DiscussionEngine } from '../../dist/core/engine/DiscussionEngine.js';
import { MockAgentClient } from './MockAgentClient.js';

test('DiscussionEngine Integration: Happy Path', async (t) => {
  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session');
  
  await engine.init({
    topic: 'Test Topic',
    participants: [
      { name: 'A', subagent_type: 'advocate' },
      { name: 'B', subagent_type: 'critic' }
    ],
    maxRounds: 2,
    mode: 'debate',
    keep_sessions: false
  });

  const result = await engine.run();
  
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.rounds, 2);
  assert.strictEqual(result.messages.length, 4); // 2 rounds * 2 participants
  // Sub-sessions should be cleaned up (deleted from mock)
  // Note: Root session stays, sub-sessions deleted
  assert.strictEqual(client.sessions.size, 1, 'Sub-sessions should be cleaned up');
});

test('DiscussionEngine Integration: Stop mid-flight', async (t) => {
  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session');
  
  await engine.init({
    topic: 'Stop Topic',
    participants: [{ name: 'A', subagent_type: 'general' }],
    maxRounds: 5,
    mode: 'debate'
  });

  // Start running
  const runPromise = engine.run();
  
  // Stop after a short delay (enough to start but not finish)
  setTimeout(() => {
    engine.stop('User cancelled');
  }, 70);

  const result = await runPromise;
  
  assert.strictEqual(result.status, 'cancelled');
  assert.strictEqual(result.stopReason, 'User cancelled');
  assert.ok(result.messages.length < 5, 'Should not finish all rounds');
});

test('DiscussionEngine Integration: Timeout', async (t) => {
  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session');
  
  // Override prompt to be slow
  client.prompt = async (args) => {
      const { signal } = args;
      return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve("slow"), 200);
          if (signal) {
              signal.addEventListener('abort', () => {
                  clearTimeout(t);
                  const e = new Error('Aborted');
                  e.name = 'AbortError';
                  reject(e);
              });
          }
      });
  };

  await engine.init({
    topic: 'Timeout Topic',
    participants: [{ name: 'A', subagent_type: 'general' }],
    maxRounds: 2,
    mode: 'debate',
    timeout: 50 // shorter than prompt latency
  });

  try {
      await engine.run();
      // Should not succeed if logic handles timeout as fatal for the task
      // But engine implementation catches task errors and pushes to `errors` array for that round, 
      // unless it's a fatal abort. 
      // Wait, invokeDirect throws ETIMEDOUT. runRound catches it?
      // Let's check DiscussionEngine.ts runRound implementation.
      // It catches errors and pushes to state.errors.
      // So the run should complete with errors? Or does it abort?
      // The ResourceController timeout aborts the task signal.
  } catch (e) {
      // It might throw if run() catches fatal errors.
  }
  
  const state = engine.getState();
  // We expect errors in the state or messages missing
  const errors = state.errors || [];
  assert.ok(errors.length > 0 || state.messages.length === 0, 'Should have timeout errors or no messages');
  
  if (errors.length > 0) {
      assert.strictEqual(errors[0].code, 'ETIMEDOUT');
  }
});

test('DiscussionEngine Integration: keep_sessions=true', async (t) => {
  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session');
  
  await engine.init({
    topic: 'Keep Topic',
    participants: [{ name: 'A', subagent_type: 'general' }],
    maxRounds: 1,
    mode: 'debate',
    keepSessions: true
  });

  await engine.run();
  
  // Should have root + 1 agent session
  assert.strictEqual(client.sessions.size, 2);
});
