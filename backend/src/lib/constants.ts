/** Order statuses that count as fully paid / revenue-generating. */
export const PAID_ORDER_STATUSES = ['paid', 'processing', 'delivered'] as const;

export type PaidOrderStatus = typeof PAID_ORDER_STATUSES[number];
