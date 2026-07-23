/**
 * Business-timezone date helpers.
 *
 * Orders are stored in UTC, but the business operates in Africa/Nairobi
 * (EAT, UTC+3, no DST). Bucketing by UTC day misattributes every order
 * placed 21:00–24:00 EAT to the next calendar day, and local-server month
 * boundaries drift with wherever the server happens to run.
 */

export const EAT_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/** YYYY-MM-DD key for a timestamp, in Africa/Nairobi. */
export function eatDayKey(date: Date): string {
  return new Date(date.getTime() + EAT_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The UTC instant at which the Nairobi calendar month containing `now`
 * begins, shifted by `monthOffset` months (0 = this month, -1 = last).
 */
export function startOfEatMonth(monthOffset = 0, now = new Date()): Date {
  const shifted = new Date(now.getTime() + EAT_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + monthOffset, 1) - EAT_UTC_OFFSET_MS
  );
}
