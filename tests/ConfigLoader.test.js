/**
 * ConfigLoader unit tests
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader, getConfigLoader, loadConfig } from '../dist/config/ConfigLoader.js';
import { DEFAULT_CONFIG } from '../dist/config/schema.js';

// Test fixtures directory
const TEST_DIR = path.join(os.tmpdir(), 'opencode-group-discuss-test-' + Date.now());
const TEST_PROJECT_DIR = path.join(TEST_DIR, 'project');
const TEST_GLOBAL_DIR = path.join(TEST_DIR, 'global');

// Helper to create test config files
function writeTestConfig(dir, config) {
    const configDir = path.join(dir, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'group-discuss.json'),
        JSON.stringify(config, null, 2)
    );
}

function writeGlobalConfig(config) {
    const configDir = path.join(TEST_GLOBAL_DIR, '.config', 'opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'group-discuss.json'),
        JSON.stringify(config, null, 2)
    );
}

// Setup and teardown
beforeEach(() => {
    fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    fs.mkdirSync(TEST_GLOBAL_DIR, { recursive: true });
    ConfigLoader.reset();
});

afterEach(() => {
    try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
        // Ignore cleanup errors
    }
    ConfigLoader.reset();
});

// ============================================
// Basic functionality tests
// ============================================

test('ConfigLoader: returns default config when no config files exist', async () => {
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.mode, DEFAULT_CONFIG.defaults.mode);
    assert.strictEqual(config.defaults.rounds, DEFAULT_CONFIG.defaults.rounds);
    assert.strictEqual(config.defaults.timeout, DEFAULT_CONFIG.defaults.timeout);
    assert.strictEqual(config.consensus.threshold, DEFAULT_CONFIG.consensus.threshold);
    assert.strictEqual(config.context_compaction.max_context_chars, DEFAULT_CONFIG.context_compaction.max_context_chars);
});

test('ConfigLoader: loads project-level config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: {
            mode: 'collaborative',
            rounds: 5
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.mode, 'collaborative');
    assert.strictEqual(config.defaults.rounds, 5);
    // Other defaults should remain from DEFAULT_CONFIG
    assert.strictEqual(config.defaults.timeout, DEFAULT_CONFIG.defaults.timeout);
});

test('ConfigLoader: caches config and returns same instance', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 7 }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config1 = await loader.loadConfig();
    const config2 = await loader.loadConfig();
    
    assert.strictEqual(config1, config2, 'Should return cached config');
});

test('ConfigLoader: forceReload bypasses cache', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 7 }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config1 = await loader.loadConfig();
    
    // Update config file
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 10 }
    });
    
    // Without forceReload, should get cached value
    const config2 = await loader.loadConfig();
    assert.strictEqual(config2.defaults.rounds, 7);
    
    // With forceReload, should get new value
    const config3 = await loader.loadConfig(true);
    assert.strictEqual(config3.defaults.rounds, 10);
});

// ============================================
// Preset tests
// ============================================

test('ConfigLoader: getPreset returns undefined for non-existent preset', async () => {
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const preset = await loader.getPreset('non-existent');
    
    assert.strictEqual(preset, undefined);
});

test('ConfigLoader: getPreset returns preset from config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        presets: {
            'tech-review': {
                agents: ['advocate', 'critic'],
                mode: 'debate',
                rounds: 3
            }
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const preset = await loader.getPreset('tech-review');
    
    assert.ok(preset);
    assert.deepStrictEqual(preset.agents, ['advocate', 'critic']);
    assert.strictEqual(preset.mode, 'debate');
    assert.strictEqual(preset.rounds, 3);
});

test('ConfigLoader: getPresetNames returns all preset names', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        presets: {
            'preset-a': { agents: ['a'] },
            'preset-b': { agents: ['b'] },
            'preset-c': { agents: ['c'] }
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const names = await loader.getPresetNames();
    
    assert.deepStrictEqual(names.sort(), ['preset-a', 'preset-b', 'preset-c']);
});

test('ConfigLoader: preset with participants', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        presets: {
            'architecture': {
                participants: [
                    { name: 'Architect', subagent_type: 'critic', role: 'System design' },
                    { name: 'DBA', subagent_type: 'general' }
                ],
                mode: 'collaborative',
                rounds: 5
            }
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const preset = await loader.getPreset('architecture');
    
    assert.ok(preset);
    assert.strictEqual(preset.participants.length, 2);
    assert.strictEqual(preset.participants[0].name, 'Architect');
    assert.strictEqual(preset.participants[0].subagent_type, 'critic');
    assert.strictEqual(preset.participants[0].role, 'System design');
});

// ============================================
// Consensus and termination config tests
// ============================================

test('ConfigLoader: getConsensusConfig returns merged config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        consensus: {
            threshold: 0.9,
            stalemate_window: 4
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const consensus = await loader.getConsensusConfig();
    
    assert.strictEqual(consensus.threshold, 0.9);
    assert.strictEqual(consensus.stalemate_window, 4);
    // Default value should be preserved
    assert.strictEqual(consensus.enable_convergence_analysis, DEFAULT_CONFIG.consensus.enable_convergence_analysis);
});

test('ConfigLoader: getTerminationConfig returns merged config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        termination: {
            min_confidence: 0.85,
            disabled_conditions: ['timeout']
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const termination = await loader.getTerminationConfig();
    
    assert.strictEqual(termination.min_confidence, 0.85);
    assert.deepStrictEqual(termination.disabled_conditions, ['timeout']);
    assert.strictEqual(termination.enable_stalemate_detection, DEFAULT_CONFIG.termination.enable_stalemate_detection);
});

test('ConfigLoader: getContextCompactionConfig returns merged config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        context_compaction: {
            max_context_chars: 12000,
            preserve_recent_rounds: 4
        }
    });

    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const contextConfig = await loader.getContextCompactionConfig();

    assert.strictEqual(contextConfig.max_context_chars, 12000);
    assert.strictEqual(contextConfig.preserve_recent_rounds, 4);
    assert.strictEqual(contextConfig.compaction_threshold, DEFAULT_CONFIG.context_compaction.compaction_threshold);
});

test('ConfigLoader: consensus keyword_weights are merged', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        consensus: {
            keyword_weights: {
                'approved': 0.9,
                'rejected': -0.9
            }
        }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const consensus = await loader.getConsensusConfig();
    
    assert.strictEqual(consensus.keyword_weights['approved'], 0.9);
    assert.strictEqual(consensus.keyword_weights['rejected'], -0.9);
});

// ============================================
// JSONC support tests
// ============================================

test('ConfigLoader: supports JSONC with single-line comments', async () => {
    const configDir = path.join(TEST_PROJECT_DIR, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'group-discuss.json'),
        `{
            // This is a comment
            "defaults": {
                "rounds": 8 // inline comment
            }
        }`
    );
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.rounds, 8);
});

test('ConfigLoader: supports JSONC with multi-line comments', async () => {
    const configDir = path.join(TEST_PROJECT_DIR, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'group-discuss.json'),
        `{
            /* 
             * Multi-line comment
             * describing the config
             */
            "defaults": {
                "mode": "collaborative"
            }
        }`
    );
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.mode, 'collaborative');
});

// ============================================
// Error handling tests
// ============================================

test('ConfigLoader: handles invalid JSON gracefully', async () => {
    const configDir = path.join(TEST_PROJECT_DIR, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'group-discuss.json'),
        '{ invalid json }'
    );
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    // Should not throw, returns default config
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.mode, DEFAULT_CONFIG.defaults.mode);
});

// ============================================
// Utility function tests
// ============================================

test('ConfigLoader: setProjectRoot clears cache and updates path', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 7 }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    await loader.loadConfig();
    
    const newProjectDir = path.join(TEST_DIR, 'project2');
    fs.mkdirSync(newProjectDir, { recursive: true });
    writeTestConfig(newProjectDir, {
        defaults: { rounds: 12 }
    });
    
    loader.setProjectRoot(newProjectDir);
    assert.strictEqual(loader.getProjectRoot(), newProjectDir);
    
    const config = await loader.loadConfig();
    assert.strictEqual(config.defaults.rounds, 12);
});

test('ConfigLoader: clearCache invalidates cached config', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 7 }
    });
    
    const loader = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    await loader.loadConfig();
    
    // Update config
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 15 }
    });
    
    // Clear cache and reload
    loader.clearCache();
    const config = await loader.loadConfig();
    
    assert.strictEqual(config.defaults.rounds, 15);
});

test('getConfigLoader: returns singleton instance', async () => {
    const loader1 = getConfigLoader(TEST_PROJECT_DIR);
    const loader2 = getConfigLoader(TEST_PROJECT_DIR);
    
    assert.strictEqual(loader1, loader2);
});

test('loadConfig: convenience function works', async () => {
    writeTestConfig(TEST_PROJECT_DIR, {
        defaults: { rounds: 6 }
    });
    
    ConfigLoader.reset();
    const config = await loadConfig(TEST_PROJECT_DIR);
    
    assert.strictEqual(config.defaults.rounds, 6);
});

// ============================================
// Singleton behavior tests
// ============================================

test('ConfigLoader: new projectRoot creates new instance', async () => {
    const loader1 = ConfigLoader.getInstance(TEST_PROJECT_DIR);
    
    const newProjectDir = path.join(TEST_DIR, 'project2');
    fs.mkdirSync(newProjectDir, { recursive: true });
    
    const loader2 = ConfigLoader.getInstance(newProjectDir);
    
    // Different project roots should give different instances
    assert.notStrictEqual(loader1, loader2);
});
