import { Request, Response, NextFunction } from 'express';
import { logger, dbLog } from '../utils/logger';

const SLOW_REQUEST_THRESHOLD_MS = 2000;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.ip ?? '-';
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms ${ip}`);

    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      dbLog(
        'warn',
        'API',
        `Slow request: ${req.method} ${req.path}`,
        { duration, status: res.statusCode, ip },
      ).catch(() => {/* silently ignore */});
    }
  });

  next();
}
