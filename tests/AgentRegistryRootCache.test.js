import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AgentRegistry } from '../dist/core/engine/AgentRegistry.js';
import { getConfigLoader } from '../dist/config/ConfigLoader.js';

test('AgentRegistry.getAgentIDs() should be root-aware when switching roots', async (t) => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-agents-a-'));
  const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-gd-agents-b-'));

  const originalCache = AgentRegistry.cache;

  try {
    // Setup dirA with agent 'alpha'
    // Following prompt instruction to use "agent" key
    await fs.writeFile(
      path.join(dirA, 'opencode.json'),
      JSON.stringify({ agent: { alpha: {} } })
    );

    // Setup dirB with agent 'beta'
    await fs.writeFile(
      path.join(dirB, 'opencode.json'),
      JSON.stringify({ agent: { beta: {} } })
    );

    // Test dirA
    getConfigLoader(dirA);
    const agentsASet = await AgentRegistry.getAgentIDs();
    const agentsA = Array.from(agentsASet);
    assert.ok(agentsA.includes('alpha'), 'dirA should include alpha');
    assert.ok(!agentsA.includes('beta'), 'dirA should not include beta');
    assert.ok(agentsA.includes('general'), 'dirA should include general built-in');
    assert.ok(agentsA.includes('explore'), 'dirA should include explore built-in');

    // Test dirB
    getConfigLoader(dirB);
    const agentsBSet = await AgentRegistry.getAgentIDs();
    const agentsB = Array.from(agentsBSet);
    assert.ok(agentsB.includes('beta'), 'dirB should include beta');
    assert.ok(!agentsB.includes('alpha'), 'dirB should not include alpha');
    assert.ok(agentsB.includes('general'), 'dirB should include general built-in');
    assert.ok(agentsB.includes('explore'), 'dirB should include explore built-in');

  } finally {
    // Restore AgentRegistry.cache to previous value
    AgentRegistry.cache = originalCache;

    // Cleanup temp dirs
    await fs.rm(dirA, { recursive: true, force: true }).catch(() => {});
    await fs.rm(dirB, { recursive: true, force: true }).catch(() => {});
  }
});
