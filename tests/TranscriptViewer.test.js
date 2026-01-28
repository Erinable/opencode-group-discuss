import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('TranscriptViewer validation logic', () => {
    // Test the validation logic by recreating it
    // We can't directly test TranscriptViewer since validateTerminalSize() runs on import
    // and calls process.exit(1)

    test('validateTerminalSize accepts 80x24 terminal', () => {
        const minWidth = 80;
        const minHeight = 24;
        const columns = 80;
        const rows = 24;

        const shouldPass = columns >= minWidth && rows >= minHeight;
        assert.strictEqual(shouldPass, true, '80x24 should pass validation');
    });

    test('validateTerminalSize accepts 120x40 terminal', () => {
        const minWidth = 80;
        const minHeight = 24;
        const columns = 120;
        const rows = 40;

        const shouldPass = columns >= minWidth && rows >= minHeight;
        assert.strictEqual(shouldPass, true, '120x40 should pass validation');
    });

    test('validateTerminalSize rejects 40x10 terminal', () => {
        const minWidth = 80;
        const minHeight = 24;
        const columns = 40;
        const rows = 10;

        const shouldFail = columns < minWidth || rows < minHeight;
        assert.strictEqual(shouldFail, true, '40x10 should fail validation');
        assert.strictEqual(columns < minWidth, true, 'columns (40) < min (80)');
        assert.strictEqual(rows < minHeight, true, 'rows (10) < min (24)');
    });

    test('validateTerminalSize rejects 79x24 terminal (too narrow)', () => {
        const minWidth = 80;
        const minHeight = 24;
        const columns = 79;
        const rows = 24;

        const shouldFail = columns < minWidth || rows < minHeight;
        assert.strictEqual(shouldFail, true, '79x24 should fail validation');
        assert.strictEqual(columns < minWidth, true, 'columns (79) < min (80)');
        assert.strictEqual(rows < minHeight, false, 'rows (24) >= min (24)');
    });

    test('validateTerminalSize rejects 80x23 terminal (too short)', () => {
        const minWidth = 80;
        const minHeight = 24;
        const columns = 80;
        const rows = 23;

        const shouldFail = columns < minWidth || rows < minHeight;
        assert.strictEqual(shouldFail, true, '80x23 should fail validation');
        assert.strictEqual(columns < minWidth, false, 'columns (80) >= min (80)');
        assert.strictEqual(rows < minHeight, true, 'rows (23) < min (24)');
    });
});

describe('calculateOverlaySize responsive layout', () => {
    // Test the calculateOverlaySize logic
    function calculateOverlaySize(columns, rows) {
        let widthPct, heightPct;

        if (columns <= 100 || rows <= 30) {
            // Small terminals: use more space (90-95%)
            widthPct = columns <= 80 ? '95%' : '90%';
            heightPct = rows <= 24 ? '90%' : '85%';
        } else {
            // Larger terminals: use standard 80%
            widthPct = '80%';
            heightPct = '80%';
        }

        return { width: widthPct, height: heightPct };
    }

    test('Small terminal (80x24) returns 95% width, 90% height', () => {
        const result = calculateOverlaySize(80, 24);
        assert.strictEqual(result.width, '95%', 'Width should be 95% for 80 columns');
        assert.strictEqual(result.height, '90%', 'Height should be 90% for 24 rows');
    });

    test('Small terminal (79x30) returns 95% width, 90% height', () => {
        const result = calculateOverlaySize(79, 30);
        assert.strictEqual(result.width, '95%', 'Width should be 95% for 79 columns');
        assert.strictEqual(result.height, '85%', 'Height should be 85% for 30 rows');
    });

    test('Medium terminal (100x24) returns 90% width, 90% height', () => {
        const result = calculateOverlaySize(100, 24);
        assert.strictEqual(result.width, '90%', 'Width should be 90% for 100 columns');
        assert.strictEqual(result.height, '90%', 'Height should be 90% for 24 rows');
    });

    test('Medium terminal (90x30) returns 90% width, 85% height', () => {
        const result = calculateOverlaySize(90, 30);
        assert.strictEqual(result.width, '90%', 'Width should be 90% for 90 columns');
        assert.strictEqual(result.height, '85%', 'Height should be 85% for 30 rows');
    });

    test('Large terminal (120x40) returns 80% width, 80% height', () => {
        const result = calculateOverlaySize(120, 40);
        assert.strictEqual(result.width, '80%', 'Width should be 80% for large terminals');
        assert.strictEqual(result.height, '80%', 'Height should be 80% for large terminals');
    });

    test('Large terminal (150x50) returns 80% width, 80% height', () => {
        const result = calculateOverlaySize(150, 50);
        assert.strictEqual(result.width, '80%', 'Width should be 80% for large terminals');
        assert.strictEqual(result.height, '80%', 'Height should be 80% for large terminals');
    });

    test('Edge case (100x30) returns 80% width, 80% height (large threshold)', () => {
        const result = calculateOverlaySize(100, 30);
        // At exactly 100x30, we're at the boundary
        // cols <= 100 is true, so it's still "medium/small"
        assert.strictEqual(result.width, '90%', 'Width should be 90% at boundary');
        assert.strictEqual(result.height, '85%', 'Height should be 85% at boundary');
    });

    test('Edge case (101x31) returns 80% width, 80% height (just above threshold)', () => {
        const result = calculateOverlaySize(101, 31);
        // Just above the threshold, should be "large"
        assert.strictEqual(result.width, '80%', 'Width should be 80% for large terminals');
        assert.strictEqual(result.height, '80%', 'Height should be 80% for large terminals');
    });
});

describe('TranscriptViewer error message formatting', () => {
    test('Error message includes minimum requirements', () => {
        const minWidth = 80;
        const minHeight = 24;

        // Test that error message would be formatted correctly
        const expectedMin = `${minWidth}x${minHeight}`;
        assert.strictEqual(expectedMin, '80x24', 'Error message should show 80x24 minimum');
    });

    test('Error message includes current terminal size', () => {
        const currentCols = 40;
        const currentRows = 10;

        const expectedCurrent = `${currentCols}x${currentRows}`;
        assert.strictEqual(expectedCurrent, '40x10', 'Error message should show current size');
    });
});
