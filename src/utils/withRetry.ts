import retry from 'async-retry';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  signal?: AbortSignal;
  bailOn?: (error: any) => boolean;
}

/**
 * Wraps a promise-returning function with retry logic using exponential backoff.
 */
export async function withRetry<T>(
  task: (signal?: AbortSignal) => Promise<T>, 
  options: RetryOptions = {}
): Promise<T> {
  const bailOn = options.bailOn ?? ((error: any) => {
    if (!error) return false;
    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
    if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') return true;
    if (error.status && typeof error.status === 'number') {
      // bail on 4xx and conflict
      return error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404 || error.status === 409;
    }
    const code = (error as any).code;
    if (code === 'SHUTDOWN_TIMEOUT' || code === 'E_SHUTTING_DOWN') return true;
    return false;
  });

  return retry(async (bail, attempt) => {
    if (options.signal?.aborted) {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (abortError as any).code = 'ABORT_ERR';
      bail(abortError);
      throw abortError;
    }

    try {
      return await task(options.signal);
    } catch (error: any) {
      error.retryCount = attempt;
      if (bailOn(error)) {
        bail(error);
        throw error;
      }
      throw error;
    }
  }, {
    retries: options.retries ?? 3,
    factor: options.factor ?? 2,
    minTimeout: options.minTimeout ?? 1000,
    maxTimeout: options.maxTimeout ?? 10000,
    randomize: options.randomize ?? true,
  });
}
