
import { test } from 'node:test';
import assert from 'node:assert';
import { withRetry } from '../dist/utils/withRetry.js';

test('withRetry: succeeds immediately on first try', async (t) => {
    let callCount = 0;

    const result = await withRetry(async () => {
        callCount++;
        return 'success';
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(callCount, 1);
});

test('withRetry: retries on temporary failure', async (t) => {
    let callCount = 0;

    const result = await withRetry(async () => {
        callCount++;
        if (callCount < 3) {
            throw new Error('Temporary failure');
        }
        return 'success after retry';
    }, { retries: 5, minTimeout: 10, maxTimeout: 50 });

    assert.strictEqual(result, 'success after retry');
    assert.strictEqual(callCount, 3);
});

test('withRetry: bails on AbortError', async (t) => {
    let callCount = 0;

    await assert.rejects(async () => {
        await withRetry(async () => {
            callCount++;
            const err = new Error('Aborted');
            err.name = 'AbortError';
            throw err;
        }, { retries: 5, minTimeout: 10 });
    }, {
        name: 'AbortError'
    });

    // Should not retry on AbortError
    assert.strictEqual(callCount, 1);
});

test('withRetry: bails on ETIMEDOUT', async (t) => {
    let callCount = 0;

    await assert.rejects(async () => {
        await withRetry(async () => {
            callCount++;
            const err = new Error('Timeout');
            err.code = 'ETIMEDOUT';
            throw err;
        }, { retries: 5, minTimeout: 10 });
    }, (err) => err.code === 'ETIMEDOUT');

    assert.strictEqual(callCount, 1);
});

test('withRetry: throws after exhausting retries', async (t) => {
    let callCount = 0;

    await assert.rejects(async () => {
        await withRetry(async () => {
            callCount++;
            throw new Error('Always fails');
        }, { retries: 2, minTimeout: 10, maxTimeout: 20 });
    }, {
        message: 'Always fails'
    });

    // Initial + 2 retries = 3 calls
    assert.strictEqual(callCount, 3);
});

test('withRetry: respects signal abort', async (t) => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(async () => {
        await withRetry(async () => {
            return 'should not reach';
        }, { signal: controller.signal });
    }, {
        name: 'AbortError'
    });
});

test('withRetry: attaches retryCount to error', async (t) => {
    let caughtError = null;

    try {
        await withRetry(async () => {
            throw new Error('Fail');
        }, { retries: 2, minTimeout: 10, maxTimeout: 20 });
    } catch (e) {
        caughtError = e;
    }

    assert.ok(caughtError, 'Should have thrown');
    assert.ok(caughtError.retryCount >= 2, `retryCount should be >= 2, got ${caughtError.retryCount}`);
});
