import PQueue from 'p-queue';
import { DispatchOptions, IDispatcher } from './interfaces.js';

export class ResourceController implements IDispatcher {
  private queue: PQueue;
  private abortController: AbortController;

  constructor(concurrency: number = 2) {
    this.queue = new PQueue({ concurrency });
    this.abortController = new AbortController();
  }

  async dispatch<T>(task: (signal: AbortSignal) => Promise<T>, options: DispatchOptions = {}): Promise<T> {
    if (this.abortController.signal.aborted) {
      throw new Error('Dispatcher is shutting down');
    }

    const { priority = 0, timeoutMs, signal } = options;

    return this.queue.add(async () => {
      if (this.abortController.signal.aborted) {
        throw new Error('Dispatcher is shutting down');
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

  async shutdown(options: { awaitIdle?: boolean } = {}): Promise<void> {
    this.abortController.abort();
    this.queue.clear();
    if (options.awaitIdle) {
      await this.queue.onIdle();
    }
  }

  getPendingCount(): number {
    return this.queue.pending + this.queue.size;
  }
}
