import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const logsDir = path.join(process.cwd(), 'logs');

function ensureLogsDir(): void {
  if (env.LOG_TO_FILE && !fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

ensureLogsDir();

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function writeToFile(filename: string, line: string): void {
  try {
    fs.appendFileSync(path.join(logsDir, filename), line + '\n');
  } catch {
    // silently ignore file write errors
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    const line = formatMessage('info', message, meta);
    console.log(line);
    if (env.LOG_TO_FILE) writeToFile('app.log', line);
  },
  warn: (message: string, meta?: unknown) => {
    const line = formatMessage('warn', message, meta);
    console.warn(line);
    if (env.LOG_TO_FILE) writeToFile('app.log', line);
  },
  error: (message: string, meta?: unknown) => {
    const line = formatMessage('error', message, meta);
    console.error(line);
    if (env.LOG_TO_FILE) {
      writeToFile('app.log', line);
      writeToFile('error.log', line);
    }
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      const line = formatMessage('debug', message, meta);
      console.debug(line);
      if (env.LOG_TO_FILE) writeToFile('app.log', line);
    }
  },
};

export async function dbLog(
  level: string,
  category: string,
  message: string,
  details?: unknown,
  userId?: string,
  ip?: string
): Promise<void> {
  if (!env.ENABLE_DB_LOGS) return;
  try {
    // Lazy import to avoid circular dependency issues at startup
    const { prisma } = await import('../lib/prisma');
    await prisma.systemLog.create({
      data: {
        level,
        category,
        message,
        details: details ? JSON.stringify(details) : undefined,
        userId,
        ip,
      },
    });
  } catch {
    // silently ignore DB log errors
  }
}

