import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

import authRouter from './routes/auth';
import productsRouter from './routes/products';
import categoriesRouter from './routes/categories';
import ordersRouter from './routes/orders';
import paymentsRouter from './routes/payments';
import cartRouter from './routes/cart';
import advertisementsRouter from './routes/advertisements';
import contentRouter from './routes/content';
import adminRouter from './routes/admin';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'MAMALI API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/advertisements', advertisementsRouter);
app.use('/api/content', contentRouter);
app.use('/api/homepage', contentRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`MAMALI API running on port ${env.PORT}`);
});

export default app;
