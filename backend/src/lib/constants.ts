/** Order statuses that count as fully paid / revenue-generating. */
export const PAID_ORDER_STATUSES = ['paid', 'processing', 'delivered'] as const;

export type PaidOrderStatus = typeof PAID_ORDER_STATUSES[number];

/**
 * Fraud risk score (0–100) at or above which an order is treated as
 * high-risk: it is surfaced in the fraud alerts panel, logged as flagged,
 * and its customer is segmented "risky". Previously the alert panel used
 * 30 while the segment used 40, so a flagged order's customer was not
 * marked risky — these are now one number.
 */
export const HIGH_RISK_SCORE_THRESHOLD = 30;
