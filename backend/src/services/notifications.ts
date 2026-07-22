/**
 * Unified notification service.
 *
 * Strategy: try WhatsApp first; if it fails or is not configured, fall back to SMS.
 * Every notification attempt is persisted in NotificationLog for auditing and retry.
 */

import { prisma } from '../lib/prisma';
import { logger, dbLog } from '../utils/logger';
import { isWhatsAppEnabled, sendWhatsAppText } from './whatsapp';
import { isSMSEnabled, sendSMS } from './sms';

export type MessageType =
  | 'order_confirmed'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_expired';

// ─── Message templates ───────────────────────────────────────────────────────

function buildMessage(type: MessageType, data: Record<string, unknown>): string {
  const { orderNumber, total, businessName = 'MAMALI' } = data;
  switch (type) {
    case 'order_confirmed':
      return (
        `✅ Order Confirmed!\n\n` +
        `Hi${data.customerName ? ` ${data.customerName}` : ''}! Your order *${orderNumber}* has been received.\n` +
        `Total: KES ${total}\n\n` +
        `We'll send you an M-Pesa STK push shortly to complete your payment.\n\n` +
        `Thank you for shopping with *${businessName}*! 🛍️`
      );

    case 'payment_confirmed':
      return (
        `🎉 Payment Confirmed!\n\n` +
        `Your payment of KES ${total} for order *${orderNumber}* has been received.\n` +
        `${data.mpesaReceiptNumber ? `M-Pesa Receipt: *${data.mpesaReceiptNumber}*\n` : ''}` +
        `We're now processing your order. You'll hear from us soon!\n\n` +
        `*${businessName}* 🙏`
      );

    case 'order_shipped':
      return (
        `📦 Order On Its Way!\n\n` +
        `Great news! Your order *${orderNumber}* is being delivered to you.\n\n` +
        `*${businessName}*`
      );

    case 'order_delivered':
      return (
        `✅ Order Delivered!\n\n` +
        `Your order *${orderNumber}* has been delivered.\n` +
        `Thank you for shopping with *${businessName}*! We hope to see you again soon. 🛍️`
      );

    case 'order_cancelled':
      return (
        `❌ Order Cancelled\n\n` +
        `Your order *${orderNumber}* has been cancelled.\n` +
        `If you have any questions, please contact us.\n\n` +
        `*${businessName}*`
      );

    case 'order_expired':
      return (
        `⏰ Order Expired\n\n` +
        `Your order *${orderNumber}* has expired because payment was not received in time.\n` +
        `You can place a new order anytime.\n\n` +
        `*${businessName}*`
      );

    default:
      return `Your order ${orderNumber} status has been updated.`;
  }
}

// ─── Core send function ───────────────────────────────────────────────────────

interface SendNotificationOptions {
  orderId?: string;
  recipient: string;
  messageType: MessageType;
  templateData: Record<string, unknown>;
}

/**
 * Attempt to deliver a notification via WhatsApp, falling back to SMS.
 * Persists a NotificationLog entry regardless of outcome.
 * Never throws — failures are logged but don't block the order flow.
 */
export async function sendNotification(opts: SendNotificationOptions): Promise<void> {
  const { orderId, recipient, messageType, templateData } = opts;

  const body = buildMessage(messageType, templateData);
  let channel: 'whatsapp' | 'sms' = 'whatsapp';
  let externalId: string | undefined;
  let error: string | undefined;
  let status = 'pending';

  try {
    if (isWhatsAppEnabled()) {
      channel = 'whatsapp';
      try {
        const result = await sendWhatsAppText(recipient, body);
        externalId = result.messageId;
        status = 'sent';
      } catch (waErr) {
        logger.warn('WhatsApp send failed, falling back to SMS', { recipient, messageType, error: String(waErr) });
        // Fall through to SMS
        if (isSMSEnabled()) {
          channel = 'sms';
          const result = await sendSMS(recipient, body);
          externalId = result.messageId;
          status = 'sent';
        } else {
          throw waErr;
        }
      }
    } else if (isSMSEnabled()) {
      channel = 'sms';
      const result = await sendSMS(recipient, body);
      externalId = result.messageId;
      status = 'sent';
    } else {
      // Neither channel configured — log as 'skipped', NOT pending/failed.
      // The retry job, failure-rate alert, and health check all ignore
      // skipped rows; otherwise disabling notifications floods them.
      logger.debug('Notifications disabled; skipping', { recipient, messageType });
      status = 'skipped';
    }
  } catch (err) {
    status = 'failed';
    error = String(err);
    logger.error('Notification send failed', { recipient, messageType, error });
    dbLog('error', 'NOTIFICATION', 'notification.failed', {
      orderId: orderId ?? null,
      recipient,
      messageType,
      error,
    }).catch(() => {});
  }

  // Persist the log entry (non-blocking)
  prisma.notificationLog
    .create({
      data: {
        orderId: orderId ?? null,
        channel,
        recipient,
        messageType,
        body,
        status,
        externalId: externalId ?? null,
        error: error ?? null,
        sentAt: status === 'sent' ? new Date() : null,
      },
    })
    .catch((err) => logger.error('Failed to persist NotificationLog', { error: String(err) }));
}

// ─── Order-specific helpers ───────────────────────────────────────────────────

export interface OrderNotificationData {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
  customerName?: string | null;
  total: number;
  businessName?: string;
  mpesaReceiptNumber?: string;
}

export function sendOrderConfirmation(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'order_confirmed',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
    },
  }).catch(() => {});
}

export function sendPaymentConfirmation(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'payment_confirmed',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
      mpesaReceiptNumber: data.mpesaReceiptNumber,
    },
  }).catch(() => {});
}

export function sendOrderShipped(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'order_shipped',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
    },
  }).catch(() => {});
}

export function sendOrderDelivered(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'order_delivered',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
    },
  }).catch(() => {});
}

export function sendOrderCancellation(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'order_cancelled',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
    },
  }).catch(() => {});
}

export function sendOrderExpired(data: OrderNotificationData): void {
  sendNotification({
    orderId: data.orderId,
    recipient: data.customerPhone,
    messageType: 'order_expired',
    templateData: {
      orderNumber: data.orderNumber,
      total: data.total,
      customerName: data.customerName,
      businessName: data.businessName,
    },
  }).catch(() => {});
}

// ─── Retry failed notifications ───────────────────────────────────────────────

interface RetryableLog {
  id: string;
  channel: string;
  recipient: string;
  body: string | null;
  externalId: string | null;
  sentAt: Date | null;
}

/**
 * Re-attempts delivery of an existing NotificationLog entry, updating the
 * SAME row (never creating a duplicate). Shared by the retry job and the
 * admin resend endpoint. Returns the resulting status.
 */
export async function retryNotificationLog(log: RetryableLog): Promise<string> {
  let externalId: string | undefined;
  let error: string | undefined;
  let status = 'failed';

  try {
    if (log.channel === 'whatsapp' && isWhatsAppEnabled()) {
      const result = await sendWhatsAppText(log.recipient, log.body ?? '');
      externalId = result.messageId;
      status = 'sent';
    } else if (isSMSEnabled()) {
      const result = await sendSMS(log.recipient, log.body ?? '');
      externalId = result.messageId;
      status = 'sent';
    }
  } catch (err) {
    error = String(err);
  }

  await prisma.notificationLog.update({
    where: { id: log.id },
    data: {
      status,
      externalId: externalId ?? log.externalId,
      error: error ?? null,
      retryCount: { increment: 1 },
      sentAt: status === 'sent' ? new Date() : log.sentAt,
    },
  });
  return status;
}

/**
 * Retry unsent/failed notifications from the last 24 hours.
 * Called by the background job scheduler.
 */
export async function retryFailedNotifications(): Promise<void> {
  // With no channel enabled a retry can only mark rows failed — don't.
  if (!isWhatsAppEnabled() && !isSMSEnabled()) return;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const pending = await prisma.notificationLog.findMany({
    where: {
      status: { in: ['pending', 'failed'] },
      retryCount: { lt: 3 },
      createdAt: { gte: oneDayAgo },
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  for (const log of pending) {
    await retryNotificationLog(log);
  }

  if (pending.length > 0) {
    logger.info(`Notification retry: processed ${pending.length} entries`);
  }
}
