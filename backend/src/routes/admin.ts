import { Router } from 'express';
import { advertisementsAdminRouter } from './advertisements';
import { adminContentRouter, adminHomepageRouter } from './content';
import dashboardRouter from './dashboard';
import staffRouter from './staff';
import metricsRouter from './metrics';
import settingsRouter from './settings';
import couponsRouter from './coupons';
import analyticsRouter from './analytics';
import inventoryRouter from './inventory';
import customersRouter from './customers';
import notificationsAdminRouter from './notificationsAdmin';

import alertsRouter from './alerts';

const router = Router();

router.use('/dashboard', dashboardRouter);
router.use('/staff', staffRouter);
router.use('/advertisements', advertisementsAdminRouter);
router.use('/content', adminContentRouter);
router.use('/homepage', adminHomepageRouter);
router.use('/metrics', metricsRouter);
router.use('/settings', settingsRouter);
router.use('/coupons', couponsRouter);
router.use('/analytics', analyticsRouter);
router.use('/inventory', inventoryRouter);
router.use('/customers', customersRouter);
router.use('/notifications', notificationsAdminRouter);
router.use('/alerts', alertsRouter);

export default router;

