import { Router } from 'express';
import { getOptions, getActiveSimulations, injectFault, restorePower } from '../controllers/simulator.controller';

const router = Router();

router.get('/options', getOptions);
router.get('/active', getActiveSimulations);
router.post('/inject', injectFault);
router.post('/restore', restorePower);

export default router;
