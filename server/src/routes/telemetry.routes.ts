import { Router } from 'express';
import { ingestTelemetry } from '../controllers/telemetry.controller';

const router = Router();

// Endpoint: POST /api/telemetry
// Maps the telemetry ingestion logic
router.post('/', ingestTelemetry);

export default router;
