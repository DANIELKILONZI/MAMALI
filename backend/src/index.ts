import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startBackgroundJobs } from './services/jobs';
import { prisma } from './lib/prisma';

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
