import retry from 'async-retry';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
}

/**
 * Wraps a promise-returning function with retry logic using exponential backoff.
 */
export async function withRetry<T>(
  task: () => Promise<T>, 
  options: RetryOptions = {}
): Promise<T> {
  return retry(async (bail) => {
    try {
      return await task();
    } catch (error: any) {
      // Unrecoverable errors: Bad Request, Unauthorized, Forbidden
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        bail(error);
        throw error; // bail expects us to throw or return? async-retry docs: bail(new Error('...'))
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
