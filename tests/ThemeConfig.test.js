/**
 * Theme configuration unit tests
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    DEFAULT_THEME,
    HIGH_CONTRAST_THEME,
    PROTANOPIA_THEME,
    DEUTERANOPIA_THEME,
    TRITANOPIA_THEME,
    PREDEFINED_THEMES,
    getPredefinedTheme,
    mergeTheme,
} from '../dist/config/theme.js';

// Test fixtures directory
const TEST_DIR = path.join(os.tmpdir(), 'opencode-theme-test-' + Date.now());

// Setup and teardown
beforeEach(() => {
    // No setup needed for theme tests as they don't use filesystem
});

afterEach(() => {
    // No cleanup needed
});

// ============================================
// Predefined theme tests
// ============================================

test('Theme: DEFAULT_THEME has correct structure', () => {
    assert.ok(DEFAULT_THEME);
    assert.strictEqual(DEFAULT_THEME.name, 'default');
    assert.ok(DEFAULT_THEME.description);
    assert.ok(DEFAULT_THEME.ui);
    assert.ok(DEFAULT_THEME.agents);
    assert.ok(DEFAULT_THEME.messages);
});

test('Theme: DEFAULT_THEME ui colors are valid', () => {
    const { ui } = DEFAULT_THEME;

    assert.ok(ui.header);
    assert.strictEqual(ui.header.fg, 'cyan');
    assert.strictEqual(ui.header.bg, 'black');

    assert.ok(ui.footer);
    assert.strictEqual(ui.footer.fg, 'white');

    assert.ok(ui.logBox);
    assert.ok(ui.scrollbarHandle);
    assert.ok(ui.scrollbarTrack);
    assert.ok(ui.historyList);
    assert.ok(ui.historyListSelected);
});

test('Theme: DEFAULT_THEME agent colors are valid', () => {
    const { agents } = DEFAULT_THEME;

    assert.strictEqual(agents.human, 'cyan');
    assert.strictEqual(agents.planner, 'magenta');
    assert.strictEqual(agents.critic, 'red');
    assert.strictEqual(agents.default, 'green');
});

test('Theme: DEFAULT_THEME message colors are valid', () => {
    const { messages } = DEFAULT_THEME;

    assert.strictEqual(messages.error, 'red');
    assert.strictEqual(messages.consensusBg, 'green');
    assert.strictEqual(messages.consensusFg, 'black');
    assert.strictEqual(messages.inlineCode, 'magenta');
    assert.strictEqual(messages.listBullet, 'cyan');
});

test('Theme: HIGH_CONTRAST_THEME uses bright colors', () => {
    const { ui, agents, messages } = HIGH_CONTRAST_THEME;

    assert.strictEqual(ui.header.fg, 'bright-white');
    assert.strictEqual(agents.human, 'bright-cyan');
    assert.strictEqual(agents.planner, 'bright-magenta');
    assert.strictEqual(agents.critic, 'bright-red');
    assert.strictEqual(agents.default, 'bright-green');
    assert.strictEqual(messages.error, 'bright-red');
});

test('Theme: PROTANOPIA_THEME avoids red/green confusion', () => {
    const { agents, messages } = PROTANOPIA_THEME;

    // Critic changed from red to blue
    assert.strictEqual(agents.critic, 'blue');
    // Default changed from green to yellow
    assert.strictEqual(agents.default, 'yellow');
    // Error changed from red to blue
    assert.strictEqual(messages.error, 'blue');
    // Consensus background changed from green to yellow
    assert.strictEqual(messages.consensusBg, 'yellow');
});

test('Theme: DEUTERANOPIA_THEME avoids red/green confusion', () => {
    const { agents, messages } = DEUTERANOPIA_THEME;

    // Similar to protanopia
    assert.strictEqual(agents.critic, 'blue');
    assert.strictEqual(agents.default, 'yellow');
    assert.strictEqual(messages.error, 'blue');
    assert.strictEqual(messages.consensusBg, 'yellow');
});

test('Theme: TRITANOPIA_THEME avoids blue/yellow confusion', () => {
    const { ui, agents, messages } = TRITANOPIA_THEME;

    // Header changed from cyan to green
    assert.strictEqual(ui.header.fg, 'green');
    // Scrollbar changed from cyan to green
    assert.strictEqual(ui.scrollbarHandle.bg, 'green');
    // History border changed from yellow to red
    assert.strictEqual(ui.historyListBorder.fg, 'red');

    // Agent colors changed
    assert.strictEqual(agents.human, 'green');
    assert.strictEqual(agents.planner, 'red');
    assert.strictEqual(agents.critic, 'red');
    assert.strictEqual(agents.default, 'green');

    // Message colors
    assert.strictEqual(messages.error, 'red');
    assert.strictEqual(messages.consensusBg, 'green');
    assert.strictEqual(messages.inlineCode, 'red');
    assert.strictEqual(messages.listBullet, 'green');
});

// ============================================
// PREDEFINED_THEMES map tests
// ============================================

test('Theme: PREDEFINED_THEMES contains all themes', () => {
    assert.strictEqual(PREDEFINED_THEMES.default, DEFAULT_THEME);
    assert.strictEqual(PREDEFINED_THEMES['high-contrast'], HIGH_CONTRAST_THEME);
    assert.strictEqual(PREDEFINED_THEMES.protanopia, PROTANOPIA_THEME);
    assert.strictEqual(PREDEFINED_THEMES.deuteranopia, DEUTERANOPIA_THEME);
    assert.strictEqual(PREDEFINED_THEMES.tritanopia, TRITANOPIA_THEME);
});

test('Theme: PREDEFINED_THEMES has correct number of themes', () => {
    const themeNames = Object.keys(PREDEFINED_THEMES);
    assert.strictEqual(themeNames.length, 5);
    assert.deepStrictEqual(themeNames.sort(), ['default', 'deuteranopia', 'high-contrast', 'protanopia', 'tritanopia']);
});

// ============================================
// getPredefinedTheme function tests
// ============================================

test('getPredefinedTheme: returns default theme for valid name', () => {
    const theme = getPredefinedTheme('default');
    assert.strictEqual(theme, DEFAULT_THEME);
});

test('getPredefinedTheme: returns high-contrast theme', () => {
    const theme = getPredefinedTheme('high-contrast');
    assert.strictEqual(theme, HIGH_CONTRAST_THEME);
});

test('getPredefinedTheme: returns protanopia theme', () => {
    const theme = getPredefinedTheme('protanopia');
    assert.strictEqual(theme, PROTANOPIA_THEME);
});

test('getPredefinedTheme: returns deuteranopia theme', () => {
    const theme = getPredefinedTheme('deuteranopia');
    assert.strictEqual(theme, DEUTERANOPIA_THEME);
});

test('getPredefinedTheme: returns tritanopia theme', () => {
    const theme = getPredefinedTheme('tritanopia');
    assert.strictEqual(theme, TRITANOPIA_THEME);
});

test('getPredefinedTheme: returns default theme for invalid name', () => {
    const theme = getPredefinedTheme('non-existent-theme');
    assert.strictEqual(theme, DEFAULT_THEME);
});

test('getPredefinedTheme: returns default theme for empty string', () => {
    const theme = getPredefinedTheme('');
    assert.strictEqual(theme, DEFAULT_THEME);
});

// ============================================
// mergeTheme function tests
// ============================================

test('mergeTheme: merges UI color overrides', () => {
    const overrides = {
        ui: {
            header: { fg: 'bright-yellow', bg: 'blue' }
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.ui.header.fg, 'bright-yellow');
    assert.strictEqual(merged.ui.header.bg, 'blue');
    // Other UI elements should remain unchanged
    assert.strictEqual(merged.ui.footer.fg, DEFAULT_THEME.ui.footer.fg);
});

test('mergeTheme: merges agent color overrides', () => {
    const overrides = {
        agents: {
            human: 'bright-red',
            critic: 'yellow'
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.agents.human, 'bright-red');
    assert.strictEqual(merged.agents.critic, 'yellow');
    // Other agents should remain unchanged
    assert.strictEqual(merged.agents.planner, DEFAULT_THEME.agents.planner);
});

test('mergeTheme: merges message color overrides', () => {
    const overrides = {
        messages: {
            error: 'bright-red',
            inlineCode: 'yellow'
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.messages.error, 'bright-red');
    assert.strictEqual(merged.messages.inlineCode, 'yellow');
    // Other message colors should remain unchanged
    assert.strictEqual(merged.messages.consensusBg, DEFAULT_THEME.messages.consensusBg);
});

test('mergeTheme: handles multiple override types', () => {
    const overrides = {
        ui: {
            header: { fg: 'bright-white' }
        },
        agents: {
            human: 'bright-cyan'
        },
        messages: {
            error: 'bright-red'
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.ui.header.fg, 'bright-white');
    assert.strictEqual(merged.agents.human, 'bright-cyan');
    assert.strictEqual(merged.messages.error, 'bright-red');
});

test('mergeTheme: handles empty overrides', () => {
    const overrides = {};
    const merged = mergeTheme(DEFAULT_THEME, overrides);

    // Should return the same theme
    assert.deepStrictEqual(merged, DEFAULT_THEME);
});

test('mergeTheme: handles partial UI overrides', () => {
    const overrides = {
        ui: {
            header: { bold: true }
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.ui.header.fg, DEFAULT_THEME.ui.header.fg);
    assert.strictEqual(merged.ui.header.bg, DEFAULT_THEME.ui.header.bg);
    assert.strictEqual(merged.ui.header.bold, true);
});

test('mergeTheme: creates new object (does not mutate original)', () => {
    const overrides = {
        ui: {
            header: { fg: 'yellow' }
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    // Original theme should not be modified
    assert.strictEqual(DEFAULT_THEME.ui.header.fg, 'cyan');
    assert.notStrictEqual(merged, DEFAULT_THEME);
});

test('mergeTheme: deeply nested overrides work correctly', () => {
    const overrides = {
        ui: {
            historyListSelected: {
                bg: 'magenta',
                fg: 'yellow',
                bold: false,
                underline: true
            }
        }
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    assert.strictEqual(merged.ui.historyListSelected.bg, 'magenta');
    assert.strictEqual(merged.ui.historyListSelected.fg, 'yellow');
    assert.strictEqual(merged.ui.historyListSelected.bold, false);
    assert.strictEqual(merged.ui.historyListSelected.underline, true);
});

test('mergeTheme: handles undefined override properties', () => {
    const overrides = {
        ui: undefined,
        agents: {
            human: 'green'
        },
        messages: undefined
    };

    const merged = mergeTheme(DEFAULT_THEME, overrides);

    // UI and messages should be unchanged, agent should be updated
    assert.strictEqual(merged.ui.header.fg, DEFAULT_THEME.ui.header.fg);
    assert.strictEqual(merged.agents.human, 'green');
    assert.strictEqual(merged.messages.error, DEFAULT_THEME.messages.error);
});

// ============================================
// Theme validation tests
// ============================================

test('Theme: all predefined themes have valid structure', () => {
    for (const themeName in PREDEFINED_THEMES) {
        const theme = PREDEFINED_THEMES[themeName];

        // Check required properties
        assert.ok(theme.name, `Theme ${themeName} should have a name`);
        assert.ok(theme.ui, `Theme ${themeName} should have ui property`);
        assert.ok(theme.agents, `Theme ${themeName} should have agents property`);
        assert.ok(theme.messages, `Theme ${themeName} should have messages property`);

        // Check UI elements
        assert.ok(theme.ui.header, `Theme ${themeName} should have header`);
        assert.ok(theme.ui.footer, `Theme ${themeName} should have footer`);
        assert.ok(theme.ui.logBox, `Theme ${themeName} should have logBox`);
        assert.ok(theme.ui.historyListSelected, `Theme ${themeName} should have historyListSelected`);

        // Check agent types
        assert.ok(theme.agents.human, `Theme ${themeName} should have human agent color`);
        assert.ok(theme.agents.planner, `Theme ${themeName} should have planner agent color`);
        assert.ok(theme.agents.critic, `Theme ${themeName} should have critic agent color`);
        assert.ok(theme.agents.default, `Theme ${themeName} should have default agent color`);

        // Check message types
        assert.ok(theme.messages.error, `Theme ${themeName} should have error color`);
        assert.ok(theme.messages.consensusBg, `Theme ${themeName} should have consensusBg`);
        assert.ok(theme.messages.consensusFg, `Theme ${themeName} should have consensusFg`);
    }
});

test('Theme: all theme colors are valid blessed colors', () => {
    const validColors = [
        'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'bright-black', 'bright-red', 'bright-green', 'bright-yellow',
        'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white',
        'grey', 'gray'
    ];

    for (const themeName in PREDEFINED_THEMES) {
        const theme = PREDEFINED_THEMES[themeName];

        // Check agent colors
        for (const agentType in theme.agents) {
            const color = theme.agents[agentType];
            assert.ok(
                validColors.includes(color),
                `Theme ${themeName} agent ${agentType} has invalid color: ${color}`
            );
        }

        // Check message colors
        for (const messageType in theme.messages) {
            const color = theme.messages[messageType];
            assert.ok(
                validColors.includes(color),
                `Theme ${themeName} message ${messageType} has invalid color: ${color}`
            );
        }
    }
});
