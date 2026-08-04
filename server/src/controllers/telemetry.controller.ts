import { Request, Response } from 'express';
import { TelemetryIngestionService } from '../services/TelemetryIngestionService';

const ingestionService = new TelemetryIngestionService();

export const ingestTelemetry = (req: Request, res: Response): void => {
  try {
    const count = ingestionService.ingest(req.body);
    res.status(202).json({ status: 'accepted', count });
  } catch (error: any) {
    if (error.message.includes('Missing required') || error.message.includes('Invalid') || error.message.includes('must be')) {
      res.status(400).json({ error: error.message });
    } else {
      console.error('[TelemetryController] Error processing payload:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
