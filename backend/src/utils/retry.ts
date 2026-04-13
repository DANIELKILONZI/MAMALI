import { AxiosError } from 'axios';
import { logger } from './logger';

const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * Retry an async operation with exponential backoff.
 * Bails immediately on 4xx HTTP responses (client errors are not transient).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  delaysMs = DEFAULT_RETRY_DELAYS_MS,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response && axiosErr.response.status >= 400 && axiosErr.response.status < 500) {
        throw err;
      }
      lastErr = err;
      if (attempt < delaysMs.length) {
        logger.warn(`${label}: attempt ${attempt + 1} failed, retrying in ${delaysMs[attempt]}ms`, {
          message: axiosErr.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }

  throw lastErr;
}
