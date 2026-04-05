import { Router } from 'express';
import { advertisementsAdminRouter } from './advertisements';
import { adminContentRouter, adminHomepageRouter } from './content';
import dashboardRouter from './dashboard';
import staffRouter from './staff';
import metricsRouter from './metrics';
import settingsRouter from './settings';
import couponsRouter from './coupons';

const router = Router();

router.use('/dashboard', dashboardRouter);
router.use('/staff', staffRouter);
router.use('/advertisements', advertisementsAdminRouter);
router.use('/content', adminContentRouter);
router.use('/homepage', adminHomepageRouter);
router.use('/metrics', metricsRouter);
router.use('/settings', settingsRouter);
router.use('/coupons', couponsRouter);

export default router;

