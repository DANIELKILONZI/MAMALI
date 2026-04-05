import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY || '',
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET || '',
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE || '',
  MPESA_PASSKEY: process.env.MPESA_PASSKEY || '',
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL || '',
  MPESA_ENVIRONMENT: (process.env.MPESA_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-change-in-production',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
  ENABLE_DB_LOGS: process.env.ENABLE_DB_LOGS !== 'false',

  // ── Notifications ────────────────────────────────────────────────────────
  /** Set to 'true' to enable WhatsApp + SMS notifications */
  NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED === 'true',

  // WhatsApp (Meta Cloud API)
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',

  // SMS fallback (Africa's Talking)
  AT_API_KEY: process.env.AT_API_KEY || '',
  AT_USERNAME: process.env.AT_USERNAME || '',
  AT_SENDER_ID: process.env.AT_SENDER_ID || '',
};

