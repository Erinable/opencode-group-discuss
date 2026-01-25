import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { AsyncFS } from '../dist/utils/AsyncFS.js';

test('AsyncFS.safeResolve: allows in-root file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-root-'));
  const inside = path.join(root, 'a.txt');
  await fs.writeFile(inside, 'hello');

  const resolved = await AsyncFS.safeResolve(root, 'a.txt');
  assert.strictEqual(resolved, await fs.realpath(inside));
});

test('AsyncFS.safeResolve: rejects ../ escape', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-root-'));

  await assert.rejects(async () => {
    await AsyncFS.safeResolve(root, '../outside.txt');
  }, (err) => {
    return err && (err.code === 'E_FILE_NOT_FOUND' || err.code === 'E_FILE_SANDBOX');
  });
});

test('AsyncFS.safeResolve: rejects absolute path outside root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-root-'));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-outside-'));
  const outside = path.join(outsideDir, 'x.txt');
  await fs.writeFile(outside, 'nope');

  await assert.rejects(async () => {
    await AsyncFS.safeResolve(root, outside);
  }, { code: 'E_FILE_SANDBOX' });
});

test('AsyncFS.safeResolve: rejects symlink escape', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-root-'));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-outside-'));
  const outside = path.join(outsideDir, 'secret.txt');
  await fs.writeFile(outside, 'secret');

  const link = path.join(root, 'link.txt');

  try {
    await fs.symlink(outside, link);
  } catch {
    // Symlinks might be unsupported in some environments; skip.
    return;
  }

  await assert.rejects(async () => {
    await AsyncFS.safeResolve(root, 'link.txt');
  }, { code: 'E_FILE_SANDBOX' });
});
