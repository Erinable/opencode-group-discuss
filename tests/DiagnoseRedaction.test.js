import { test } from 'node:test';
import assert from 'node:assert';

import { buildDiagnoseEnvInfo } from '../dist/tools/diagnose.js';

test('diagnose env info is presence-only', async () => {
  const old = {
    OPENCODE: process.env.OPENCODE,
    OPENCODE_CLIENT: process.env.OPENCODE_CLIENT,
    OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD,
    OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  };

  process.env.OPENCODE = 'http://secret.example';
  process.env.OPENCODE_CLIENT = 'secret-client';
  process.env.OPENCODE_SERVER_USERNAME = 'user-secret';
  process.env.OPENCODE_SERVER_PASSWORD = 'pass-secret';
  process.env.OPENCODE_API_KEY = 'sk-secret-should-not-appear';

  const envInfo = buildDiagnoseEnvInfo();
  assert.deepStrictEqual(envInfo, {
    OPENCODE: '[SET]',
    OPENCODE_CLIENT: '[SET]',
    OPENCODE_SERVER_PASSWORD: '[SET]',
    OPENCODE_SERVER_USERNAME: '[SET]',
    OPENCODE_API_KEY: '[SET]',
  });

  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
