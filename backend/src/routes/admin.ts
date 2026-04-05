import { Router } from 'express';
import { advertisementsAdminRouter } from './advertisements';
import { adminContentRouter, adminHomepageRouter } from './content';
import dashboardRouter from './dashboard';
import staffRouter from './staff';

const router = Router();

router.use('/dashboard', dashboardRouter);
router.use('/staff', staffRouter);
router.use('/advertisements', advertisementsAdminRouter);
router.use('/content', adminContentRouter);
router.use('/homepage', adminHomepageRouter);

export default router;
