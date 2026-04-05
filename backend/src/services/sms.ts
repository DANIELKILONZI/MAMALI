/**
 * SMS notification service using Africa's Talking API.
 *
 * Docs: https://developers.africastalking.com/docs/sms/sending
 *
 * Required env vars:
 *   AT_API_KEY     — Africa's Talking API key
 *   AT_USERNAME    — Africa's Talking username
 *   AT_SENDER_ID   — (optional) shortcode or alphanumeric sender ID
 */

import axios, { AxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const AT_BASE_URL = 'https://api.africastalking.com/version1/messaging';

export interface SMSSendResult {
  messageId: string;
  status: string;
}

/** Returns true when SMS is configured and feature is enabled. */
export function isSMSEnabled(): boolean {
  return !!(
    env.NOTIFICATIONS_ENABLED &&
    env.AT_API_KEY &&
    env.AT_USERNAME
  );
}

/** Format a Kenyan phone to E.164 for Africa's Talking (requires +254 prefix). */
function toATPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('254')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+254${cleaned.slice(1)}`;
  if (cleaned.startsWith('+')) return cleaned;
  return `+${cleaned}`;
}

/**
 * Send an SMS via Africa's Talking.
 * Throws on unrecoverable errors; returns messageId + status on success.
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<SMSSendResult> {
  const params = new URLSearchParams({
    username: env.AT_USERNAME,
    to: toATPhone(to),
    message,
    ...(env.AT_SENDER_ID ? { from: env.AT_SENDER_ID } : {}),
  });

  const delays = [1000, 3000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await axios.post(AT_BASE_URL, params.toString(), {
        headers: {
          apiKey: env.AT_API_KEY,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10_000,
      });

      const recipients: Array<{ messageId?: string; statusCode?: string }> =
        response.data?.SMSMessageData?.Recipients ?? [];
      const first = recipients[0] ?? {};
      const msgId = first.messageId ?? 'unknown';
      const status = first.statusCode ?? 'unknown';

      logger.info('SMS sent via Africa\'s Talking', { to, msgId, status });
      return { messageId: msgId, status };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response && axiosErr.response.status >= 400 && axiosErr.response.status < 500) {
        throw err;
      }
      lastErr = err;
      if (attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }

  throw lastErr;
}
