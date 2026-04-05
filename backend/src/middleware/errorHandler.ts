import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`${req.method} ${req.path}`, { message: err.message, stack: err.stack });

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
    return;
  }

  const status = (err as { status?: number }).status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message,
  });
}
