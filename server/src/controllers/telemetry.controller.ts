import { Request, Response } from 'express';
import { TelemetryQueue, TelemetryEvent } from '../queue/TelemetryQueue';

const queue = TelemetryQueue.getInstance();
const ALLOWED_EVENTS = ['heartbeat', 'power_lost', 'power_restored', 'boot'];

/**
 * Ingests telemetry events from devices.
 * 
 * Design Decision (Stateless & Fast): 
 * This controller does ZERO database lookups and ZERO graph traversal.
 * Its ONLY responsibility is to validate the payload, push it to the queue,
 * and return a fast 202 Accepted.
 * 
 * Duplicate Handling Note:
 * Devices operate on an "at-least-once" delivery model. Therefore, this API
 * intentionally accepts duplicates. Deduplication logic is explicitly deferred 
 * to the downstream Telemetry Processing Service.
 */
export const ingestTelemetry = (req: Request, res: Response): void => {
  try {
    const payload = req.body;
    
    // Support both single event objects and arrays of events
    const events: any[] = Array.isArray(payload) ? payload : [payload];

    if (events.length === 0) {
      res.status(400).json({ error: 'Empty payload' });
      return;
    }

    const validatedEvents: TelemetryEvent[] = [];

    for (const event of events) {
      // 1. Validate required fields
      if (!event.device_id || !event.event || !event.ts || event.seq === undefined || event.energized === undefined) {
        res.status(400).json({ error: 'Missing required fields: device_id, event, ts, seq, energized' });
        return;
      }

      // 2. Validate supported event values
      if (!ALLOWED_EVENTS.includes(event.event)) {
        res.status(400).json({ error: `Invalid event type. Supported: ${ALLOWED_EVENTS.join(', ')}` });
        return;
      }

      // 3. Validate energized is boolean
      if (typeof event.energized !== 'boolean') {
        res.status(400).json({ error: 'energized must be a boolean' });
        return;
      }

      // 4. Validate ts is a valid ISO timestamp
      if (isNaN(Date.parse(event.ts))) {
        res.status(400).json({ error: 'ts must be a valid ISO timestamp string' });
        return;
      }

      // 5. Validate seq is a non-negative integer
      if (!Number.isInteger(event.seq) || event.seq < 0) {
        res.status(400).json({ error: 'seq must be a non-negative integer' });
        return;
      }

      validatedEvents.push(event as TelemetryEvent);
    }

    // Push to the in-memory queue
    queue.enqueue(validatedEvents);

    // 202 Accepted signifies the request is valid and queued for background processing
    res.status(202).json({ status: 'accepted', count: validatedEvents.length });
  } catch (error) {
    console.error('[TelemetryController] Error processing payload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
