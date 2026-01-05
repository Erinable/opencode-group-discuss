
import { test } from 'node:test';
import assert from 'node:assert';
import { ResourceController } from '../dist/core/engine/ResourceController.js';

test('ResourceController shutdown(awaitIdle=true) waits for tasks', async (t) => {
  const controller = new ResourceController(2);
  const start = Date.now();
  
  // Dispatch a task that takes 100ms
  const task1 = controller.dispatch(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'done';
  });

  // Dispatch another task
  const task2 = controller.dispatch(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'done';
  });

  // Shutdown immediately, awaiting idle
  await controller.shutdown({ awaitIdle: true });
  
  const duration = Date.now() - start;
  assert.ok(duration >= 100, 'Should wait for tasks to finish');
  
  const res1 = await task1;
  const res2 = await task2;
  assert.strictEqual(res1, 'done');
  assert.strictEqual(res2, 'done');
});

test('ResourceController rejects new tasks after shutdown', async (t) => {
  const controller = new ResourceController(2);
  await controller.shutdown({ awaitIdle: false });
  
  await assert.rejects(async () => {
    await controller.dispatch(async () => {});
  }, {
    code: 'E_SHUTTING_DOWN'
  });
});

test('ResourceController shutdown timeout throws ETIMEDOUT', async (t) => {
  const controller = new ResourceController(1);
  
  // Block the queue
  controller.dispatch(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  await assert.rejects(async () => {
    await controller.shutdown({ awaitIdle: true, timeoutMs: 50 });
  }, {
    name: 'TimeoutError',
    code: 'ETIMEDOUT',
    cause: 'SHUTDOWN_TIMEOUT'
  });
});
