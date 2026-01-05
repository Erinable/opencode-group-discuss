import PQueue from 'p-queue';
import { DispatchOptions, IDispatcher } from './interfaces.js';

export class ResourceController implements IDispatcher {
  private queue: PQueue;
  private abortController: AbortController;
  private isShuttingDown: boolean = false;

  constructor(concurrency: number = 2) {
    this.queue = new PQueue({ concurrency });
    this.abortController = new AbortController();
  }

  async dispatch<T>(task: (signal: AbortSignal) => Promise<T>, options: DispatchOptions = {}): Promise<T> {
    if (this.abortController.signal.aborted || this.isShuttingDown) {
      const abortErr = new Error('Dispatcher is shutting down');
      abortErr.name = 'AbortError';
      (abortErr as any).code = 'E_SHUTTING_DOWN';
      throw abortErr;
    }

    const { priority = 0, timeoutMs, signal } = options;

    return this.queue.add(async () => {
      if (this.abortController.signal.aborted) {
        const abortErr = new Error('Dispatcher is shutting down');
        abortErr.name = 'AbortError';
        (abortErr as any).code = 'ABORT_ERR';
        throw abortErr;
      }

      const controller = new AbortController();
      const onAbortInternal = () => controller.abort();
      const onAbortExternal = () => controller.abort();

      // Propagate aborts
      this.abortController.signal.addEventListener('abort', onAbortInternal);
      if (signal) signal.addEventListener('abort', onAbortExternal);

      let timeout: NodeJS.Timeout | undefined;
      if (timeoutMs && timeoutMs > 0) {
        timeout = setTimeout(() => controller.abort(), timeoutMs);
      }

      try {
        return await task(controller.signal);
      } finally {
        if (timeout) clearTimeout(timeout);
        this.abortController.signal.removeEventListener('abort', onAbortInternal);
        if (signal) signal.removeEventListener('abort', onAbortExternal);
      }
    }, { priority }) as Promise<T>;
  }

  async shutdown(options: { awaitIdle?: boolean; timeoutMs?: number } = {}): Promise<void> {
    const { awaitIdle = false, timeoutMs = 30000 } = options;

    this.isShuttingDown = true;

    if (!awaitIdle) {
      this.abortController.abort();
      this.queue.clear();
      return;
    }

    // awaitIdle = true: wait for pending tasks to finish
    const onIdle = this.queue.onIdle();
    const timeoutError = new Error('ShutdownTimeoutError');
    timeoutError.name = 'TimeoutError';
    (timeoutError as any).code = 'ETIMEDOUT';
    (timeoutError as any).cause = 'SHUTDOWN_TIMEOUT';

    let timeout: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError), timeoutMs);
      });
      await Promise.race([onIdle, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
      // Ensure we clean up eventually, even if we waited
      this.abortController.abort();
      // We do NOT clear the queue here if we awaited idle, because they should be done.
      // But if we timed out, we might want to clear.
      // The requirement was: "Wait for onIdle <= 30s... then cleanup".
      // So we should abort at the end.
    }
  }

  getPendingCount(): number {
    return this.queue.pending + this.queue.size;
  }
}
