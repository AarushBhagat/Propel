import { Router } from 'express';
import { getIncidents, getIncidentById } from '../controllers/incident.controller';

const router = Router();

router.get('/', getIncidents);
router.get('/:id', getIncidentById);

export default router;
