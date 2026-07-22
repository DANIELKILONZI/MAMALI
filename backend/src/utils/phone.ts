/**
 * Canonical Kenyan phone normalization.
 *
 * The phone number is the platform's identity key — customer blocking,
 * checkout rate limiting, fraud velocity, coupon-abuse detection, and
 * account order history all aggregate by phone. Every entry point MUST
 * normalize through this function so `0712…`, `+254712…`, and
 * `254 712 …` land in the same bucket.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s-]+/g, '').replace(/^\+/, '');
  if (/^0[17]\d{8}$/.test(cleaned)) return `254${cleaned.slice(1)}`;
  if (/^254[17]\d{8}$/.test(cleaned)) return cleaned;
  return null;
}
