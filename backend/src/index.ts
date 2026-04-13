import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { csrfProtect, csrfTokenHandler } from './middleware/csrf';
import { logger } from './utils/logger';
import { startBackgroundJobs } from './services/jobs';
import { prisma } from './lib/prisma';

import healthRouter from './routes/health';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import categoriesRouter from './routes/categories';
import ordersRouter from './routes/orders';
import paymentsRouter from './routes/payments';
import cartRouter from './routes/cart';
import advertisementsRouter from './routes/advertisements';
import contentRouter from './routes/content';
import adminRouter from './routes/admin';
import settingsRouter from './routes/settings';
import couponsRouter from './routes/coupons';

const app = express();

const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());
app.use(morgan('combined'));
app.use(requestLogger);
app.use(generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(csrfProtect);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'MAMALI API is running', timestamp: new Date().toISOString() });
});
app.use('/api/health', healthRouter);

app.get('/api/csrf-token', csrfTokenHandler);

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/advertisements', advertisementsRouter);
app.use('/api/content', contentRouter);
app.use('/api/homepage', contentRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(`MAMALI API running on port ${env.PORT}`);
  startBackgroundJobs();
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed. Exiting.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

