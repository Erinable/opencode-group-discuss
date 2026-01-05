import PQueue from 'p-queue';
import { IDispatcher } from './interfaces.js';

export class ResourceController implements IDispatcher {
  private queue: PQueue;
  private abortController: AbortController;

  constructor(concurrency: number = 2) {
    this.queue = new PQueue({ concurrency });
    this.abortController = new AbortController();
  }

  async dispatch<T>(task: (signal: AbortSignal) => Promise<T>, priority: number = 0): Promise<T> {
    if (this.abortController.signal.aborted) {
      throw new Error('Dispatcher is shutting down');
    }

    return this.queue.add(async () => {
      if (this.abortController.signal.aborted) {
        throw new Error('Dispatcher is shutting down');
      }
      return task(this.abortController.signal);
    }, { priority }) as Promise<T>;
  }

  async shutdown(): Promise<void> {
    this.abortController.abort();
    this.queue.clear();
    // We don't await onIdle() because we want to return immediately after signalling abort.
    // The running tasks should handle the abort signal.
  }

  getPendingCount(): number {
    return this.queue.pending + this.queue.size;
  }
}
