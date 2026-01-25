import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Logger } from '../dist/utils/Logger.js';

test('Logger scrubs token-like strings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-logs-'));
  const filePath = path.join(dir, 'log.txt');

  const logger = new Logger(undefined, 'group-discuss', {
    logging: {
      level: 'debug',
      consoleEnabled: false,
      fileEnabled: true,
      filePath,
      includeMeta: true,
      maxEntryChars: 20000,
      maxMetaChars: 20000,
    },
  });

  await logger.info('Authorization: Bearer supersecret', {
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEF_123',
    api_key: 'sk-abcdefghijklmnopqrstuvwxyz0123456789',
    url: 'https://example.test/?token=supersecret&password=hunter2&api_key=abc',
  });

  const content = await fs.readFile(filePath, 'utf-8');
  assert.doesNotMatch(content, /supersecret/);
  assert.doesNotMatch(content, /hunter2/);
  assert.doesNotMatch(content, /eyJhbGci/);
  assert.doesNotMatch(content, /sk-abcdefghijklmnopqrstuvwxyz/);
  assert.match(content, /\[REDACTED\]/);
});
