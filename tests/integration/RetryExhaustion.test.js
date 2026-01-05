
import { test } from 'node:test';
import assert from 'node:assert';
import { DiscussionEngine } from '../../dist/core/engine/DiscussionEngine.js';
import { MockAgentClient } from './MockAgentClient.js';

test('DiscussionEngine Integration: Retry Exhaustion', async (t) => {
  const client = new MockAgentClient();
  const engine = new DiscussionEngine(client, 'root-session');
  
  // Override prompt to always fail
  client.session.prompt = async (args) => {
      console.log('Failing prompt called');
      // Return error to simulate 500
      throw new Error('Internal Server Error 500');
  };

  await engine.init({
    topic: 'Retry Topic',
    participants: [{ name: 'A', subagent_type: 'general' }],
    maxRounds: 1,
    mode: 'debate',
    maxRetries: 2, // low retry count for speed
    timeout: 5000 // Must be > (retries * minTimeout) which is 1000ms fixed
  });

  try {
      await engine.run();
  } catch (e) {
      // It might throw depending on how engine handles fatal round errors
  }
  
  const state = engine.getState();
  const errors = state.errors || [];
  
  assert.ok(errors.length > 0, 'Should have errors');
  // Check if we have the right error info
  // The error message should come from the last retry attempt
  const lastError = errors[errors.length - 1];
  assert.ok(lastError.message.includes('Internal Server Error 500'), 'Error message should match');
  assert.ok(lastError.retryCount !== undefined, 'Should have retry count');
  assert.ok(lastError.retryCount >= 2, 'Should have retried at least maxRetries times');
});
