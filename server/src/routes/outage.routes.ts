import { Router } from 'express';
import { getActiveOutages } from '../controllers/outage.controller';

const router = Router();

router.get('/', getActiveOutages);

export default router;
