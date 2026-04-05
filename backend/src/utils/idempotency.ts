import crypto from 'crypto';

export function generateIdempotencyKey(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

// In-memory store for short-lived idempotency (supplement to DB-level unique constraints)
const processedRequests = new Map<string, { result: unknown; expiresAt: number }>();

export function isRequestProcessed(key: string): boolean {
  const entry = processedRequests.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    processedRequests.delete(key);
    return false;
  }
  return true;
}

export function markRequestProcessed(key: string, result: unknown, ttlMs = 300_000): void {
  processedRequests.set(key, { result, expiresAt: Date.now() + ttlMs });
}

export function getProcessedResult(key: string): unknown {
  return processedRequests.get(key)?.result;
}
