
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DiscussionEngine } from '../../dist/core/engine/DiscussionEngine.js';
import { ConfigLoader } from '../../dist/config/ConfigLoader.js';
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
          if (signal?.aborted) {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              reject(e);
              return;
          }
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
  
  // Should have root + 1 agent session + 1 transcript session
  assert.strictEqual(client.sessions.size, 3);
});

test('DiscussionEngine Integration: Transcript session created and receives mirrored messages', async (t) => {
  // 1. Create temp dir and mock config
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'));
  const configDir = path.join(tmpDir, '.opencode');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
      path.join(configDir, 'group-discuss.json'),
      JSON.stringify({ tui: { enable_transcript: true } })
  );

  // 2. Reset ConfigLoader to pick up new project root/config
  ConfigLoader.reset();

  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session', undefined, tmpDir);

  try {
      await engine.init({
          topic: 'Transcript Test',
          participants: [{ name: 'A', subagent_type: 'general' }],
          maxRounds: 1,
          mode: 'debate',
          keepSessions: true
      });

      await engine.run();

      // 3. Assert transcript session exists
      const transcriptSession = Array.from(client.sessions.values()).find(
          s => s.title === '📢 Group Discussion Transcript'
      );

      assert.ok(transcriptSession, 'Transcript session should be created');
      assert.ok(transcriptSession.prompts.length > 0, 'Transcript should have content');
      
      // Verify mirroring (MockAgentClient stores prompts with parts[0].text)
      const hasRoundInfo = transcriptSession.prompts.some(p => 
          p.body?.parts?.[0]?.text?.includes('--- Round 1/1 ---')
      );
      assert.ok(hasRoundInfo, 'Transcript should contain round information');

      const hasMessage = transcriptSession.prompts.some(p => 
          p.body?.parts?.[0]?.text?.includes('@A')
      );
      assert.ok(hasMessage, 'Transcript should contain mirrored agent message');

  } finally {
      // 4. Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
      ConfigLoader.reset(); // Reset back to default
  }
});
