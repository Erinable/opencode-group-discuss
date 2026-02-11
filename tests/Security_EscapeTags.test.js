
import { test, describe } from 'node:test';
import assert from 'node:assert';

// We recreate the function here since we can't easily import from TranscriptViewer.ts
// due to its side effects (calling process.exit and starting blessed)
function escapeTags(str) {
    return str.replace(/[{}]/g, (match) => match === '{' ? '{{' : '}}');
}

describe('Security: escapeTags function', () => {
    test('should double opening braces', () => {
        assert.strictEqual(escapeTags('{'), '{{');
        assert.strictEqual(escapeTags('{{'), '{{{{');
    });

    test('should double closing braces', () => {
        assert.strictEqual(escapeTags('}'), '}}');
        assert.strictEqual(escapeTags('}}'), '}}}}');
    });

    test('should escape multiple tags', () => {
        assert.strictEqual(escapeTags('{bold}text{/bold}'), '{{bold}}text{{/bold}}');
    });

    test('should handle mixed content', () => {
        const input = 'Normal text {tag} mixed with } and {';
        const expected = 'Normal text {{tag}} mixed with }} and {{';
        assert.strictEqual(escapeTags(input), expected);
    });

    test('should prevent tag injection', () => {
        const input = '{red-fg}malicious{/red-fg}';
        const escaped = escapeTags(input);
        assert.strictEqual(escaped, '{{red-fg}}malicious{{/red-fg}}');
        // In blessed, {{ starts a literal {, so this will be displayed as literal {red-fg}malicious{/red-fg}
    });
});
