import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const BASE_URL =
  env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

export async function getAccessToken(): Promise<string> {
  return withRetry(async () => {
    const credentials = Buffer.from(
      `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');
    const response = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    return response.data.access_token as string;
  }, 'getAccessToken');
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`;
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  return cleaned;
}

function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14);
}

function getPassword(timestamp: string): string {
  const str = `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(str).toString('base64');
}

export interface STKPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export async function initiateSTKPush(
  phone: string,
  amount: number,
  orderId: string
): Promise<STKPushResult> {
  return withRetry(async () => {
    const accessToken = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(timestamp);
    const formattedPhone = formatPhoneNumber(phone);

    const payload = {
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: env.MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: env.MPESA_CALLBACK_URL,
      AccountReference: orderId,
      TransactionDesc: `Payment for order ${orderId}`,
    };

    logger.info('Initiating STK Push', { phone: formattedPhone, amount, orderId });

    const response = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      merchantRequestId: response.data.MerchantRequestID,
      checkoutRequestId: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      responseDescription: response.data.ResponseDescription,
      customerMessage: response.data.CustomerMessage,
    };
  }, 'initiateSTKPush');
}

export async function verifyTransaction(checkoutRequestId: string): Promise<unknown> {
  const accessToken = await getAccessToken();
  const timestamp = getTimestamp();
  const password = getPassword(timestamp);

  const payload = {
    BusinessShortCode: env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const response = await axios.post(`${BASE_URL}/mpesa/stkpushquery/v1/query`, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.data;
}

