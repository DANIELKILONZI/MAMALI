/**
 * WhatsApp notification service using the Meta Cloud API.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 *
 * Required env vars:
 *   WHATSAPP_ACCESS_TOKEN   — permanent or long-lived token from Meta Business Suite
 *   WHATSAPP_PHONE_NUMBER_ID — the From phone number ID (e.g. 1234567890)
 */

import axios, { AxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const GRAPH_API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WhatsAppSendResult {
  messageId: string;
}

/** Format a Kenyan phone to WhatsApp-compatible E.164 (2547XXXXXXXX). */
export function toE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('254')) return cleaned;
  if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`;
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  return cleaned;
}

/** Returns true when WhatsApp is configured (env vars present and feature enabled). */
export function isWhatsAppEnabled(): boolean {
  return !!(
    env.NOTIFICATIONS_ENABLED &&
    env.WHATSAPP_ACCESS_TOKEN &&
    env.WHATSAPP_PHONE_NUMBER_ID
  );
}

/**
 * Send a plain-text WhatsApp message.
 * Throws on unrecoverable errors; returns messageId on success.
 */
export async function sendWhatsAppText(
  to: string,
  body: string
): Promise<WhatsAppSendResult> {
  return withRetry(async () => {
    const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `${BASE_URL}/${phoneId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toE164(to),
      type: 'text',
      text: { preview_url: false, body },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });

    const msgId: string =
      response.data?.messages?.[0]?.id ?? response.data?.message_id ?? 'unknown';
    logger.info('WhatsApp message sent', { to, msgId });
    return { messageId: msgId };
  }, 'sendWhatsAppText', [1000, 3000]);
}
