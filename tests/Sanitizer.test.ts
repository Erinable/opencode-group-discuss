import { test, describe } from 'node:test';
import assert from 'node:assert';
import { scrubString, scrubAny, truncateString } from '../src/utils/Sanitizer';

describe('Sanitizer', () => {
  describe('scrubString', () => {
    test('redacts Bearer tokens in Authorization headers', () => {
      assert.strictEqual(scrubString('Authorization: Bearer secret123'), 'Authorization: Bearer [REDACTED]');
      assert.strictEqual(scrubString('authorization: bearer secret123'), 'authorization: Bearer [REDACTED]');
      assert.strictEqual(scrubString('Authorization  :  Bearer   secret123'), 'Authorization  :  Bearer [REDACTED]');
    });

    test('redacts standalone Bearer tokens', () => {
      assert.strictEqual(scrubString('Bearer secret123'), 'Bearer [REDACTED]');
      assert.strictEqual(scrubString('Some text Bearer abc-123 more text'), 'Some text Bearer [REDACTED] more text');
    });

    test('redacts multiple tokens in one string and preserves separators', () => {
      const input = 'Token 1: Bearer t1, Token 2: Bearer t2';
      assert.strictEqual(scrubString(input), 'Token 1: Bearer [REDACTED], Token 2: Bearer [REDACTED]');
    });

    test('redacts Bearer tokens in JSON strings without breaking structure', () => {
      const input = '{"auth": "Bearer secret123", "other": "val"}';
      assert.strictEqual(scrubString(input), '{"auth": "Bearer [REDACTED]", "other": "val"}');
    });

    test('redacts JWTs', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      assert.strictEqual(scrubString(`User token: ${jwt}`), 'User token: [REDACTED]');
    });

    test('redacts OpenAI-like keys', () => {
      assert.strictEqual(scrubString('My key is sk-123456789012345678901234567890'), 'My key is sk-[REDACTED]');
      // Should NOT redact if too short
      assert.strictEqual(scrubString('My key is sk-short'), 'My key is sk-short');
    });

    test('redacts querystring secrets', () => {
      assert.strictEqual(scrubString('api_key=secret'), 'api_key=[REDACTED]');
      assert.strictEqual(scrubString('api-key=secret'), 'api-key=[REDACTED]');
      assert.strictEqual(scrubString('apikey=secret'), 'apikey=[REDACTED]');
      assert.strictEqual(scrubString('token=mytoken&other=val'), 'token=[REDACTED]&other=val');
      assert.strictEqual(scrubString('password=pass123'), 'password=[REDACTED]');

      // Case insensitive
      assert.strictEqual(scrubString('API_KEY=secret'), 'API_KEY=[REDACTED]');
    });

    test('does not redact non-sensitive information', () => {
      assert.strictEqual(scrubString('Hello world'), 'Hello world');
      assert.strictEqual(scrubString('user_id=123'), 'user_id=123');
    });
  });

  describe('scrubAny', () => {
    test('handles primitives', () => {
      assert.strictEqual(scrubAny(null), null);
      assert.strictEqual(scrubAny(undefined), undefined);
      assert.strictEqual(scrubAny(123), 123);
      assert.strictEqual(scrubAny(true), true);
      assert.strictEqual(scrubAny('Bearer secret'), 'Bearer [REDACTED]');
    });

    test('scrubs objects recursively', () => {
      const input = {
        auth: 'Bearer secret',
        nested: {
          key: 'sk-123456789012345678901234567890',
          list: ['password=123', 'safe']
        }
      };
      const expected = {
        auth: 'Bearer [REDACTED]',
        nested: {
          key: 'sk-[REDACTED]',
          list: ['password=[REDACTED]', 'safe']
        }
      };
      assert.deepStrictEqual(scrubAny(input), expected);
    });

    test('handles circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      const scrubbed = scrubAny(obj);
      assert.strictEqual(scrubbed.a, 1);
      assert.strictEqual(scrubbed.self, '[Circular]');
    });
  });

  describe('truncateString', () => {
    test('returns original string if maxChars is 0 or less', () => {
      assert.strictEqual(truncateString('hello', 0), 'hello');
      assert.strictEqual(truncateString('hello', -1), 'hello');
    });

    test('returns original string if shorter than or equal to maxChars', () => {
      assert.strictEqual(truncateString('hello', 5), 'hello');
      assert.strictEqual(truncateString('hello', 10), 'hello');
    });

    test('truncates and adds ellipsis if longer than maxChars', () => {
      assert.strictEqual(truncateString('hello world', 5), 'he...');
      assert.strictEqual(truncateString('this is a long string', 10), 'this is...');
    });

    test('handles small maxChars values', () => {
      assert.strictEqual(truncateString('hello', 3), '...');
      assert.strictEqual(truncateString('hello', 2), '...');
      assert.strictEqual(truncateString('hello', 1), '...');
    });
  });
});
