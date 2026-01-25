import test from 'node:test';
import assert from 'node:assert';
import { buildDiagnoseClientInfo } from '../dist/tools/diagnose.js';

test('buildDiagnoseClientInfo() scrubs + truncates error strings', async () => {
  const mockClient = {
    getConfig: () => {
      throw new Error('Bearer supersecret ' + 'x'.repeat(5000));
    },
    session: {
      create: async () => {
        return {
          error: {
            message: 'api_key=supersecret ' + 'y'.repeat(5000)
          }
        };
      }
    }
  };

  const clientInfo = await buildDiagnoseClientInfo(mockClient, 'test-session');

  // getConfigError assertions
  assert.ok(clientInfo.getConfigError.includes('Bearer [REDACTED]'), 'getConfigError should contain redacting marker');
  assert.strictEqual(clientInfo.getConfigError.includes('supersecret'), false, 'getConfigError should NOT contain the secret');
  assert.ok(clientInfo.getConfigError.length <= 1024, 'getConfigError should be truncated to 1024 chars or less');
  assert.ok(clientInfo.getConfigError.endsWith('...'), 'getConfigError should end with ellipsis');

  // testCall.errorMessage assertions
  assert.ok(clientInfo.testCall.errorMessage.includes('api_key=[REDACTED]'), 'testCall.errorMessage should contain redacting marker');
  assert.strictEqual(clientInfo.testCall.errorMessage.includes('supersecret'), false, 'testCall.errorMessage should NOT contain the secret');
  assert.ok(clientInfo.testCall.errorMessage.length <= 1024, 'testCall.errorMessage should be truncated to 1024 chars or less');
  assert.ok(clientInfo.testCall.errorMessage.endsWith('...'), 'testCall.errorMessage should end with ellipsis');
});
