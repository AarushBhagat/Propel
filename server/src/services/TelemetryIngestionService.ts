import { TelemetryQueue, TelemetryEvent } from '../queue/TelemetryQueue';

export class TelemetryIngestionService {
  private queue: TelemetryQueue;
  private ALLOWED_EVENTS = ['heartbeat', 'power_lost', 'power_restored', 'boot'];

  constructor() {
    this.queue = TelemetryQueue.getInstance();
  }

  /**
   * Validates and ingests telemetry events.
   * Returns the number of successfully queued events.
   * Throws an Error if validation fails.
   */
  public ingest(payload: any | any[]): number {
    const events: any[] = Array.isArray(payload) ? payload : [payload];

    if (events.length === 0) {
      throw new Error('Empty payload');
    }

    const validatedEvents: TelemetryEvent[] = [];

    for (const event of events) {
      if (!event.device_id || !event.event || !event.ts || event.seq === undefined || event.energized === undefined) {
        throw new Error('Missing required fields: device_id, event, ts, seq, energized');
      }

      if (!this.ALLOWED_EVENTS.includes(event.event)) {
        throw new Error(`Invalid event type. Supported: ${this.ALLOWED_EVENTS.join(', ')}`);
      }

      if (typeof event.energized !== 'boolean') {
        throw new Error('energized must be a boolean');
      }

      if (isNaN(Date.parse(event.ts))) {
        throw new Error('ts must be a valid ISO timestamp string');
      }

      if (!Number.isInteger(event.seq) || event.seq < 0) {
        throw new Error('seq must be a non-negative integer');
      }

      validatedEvents.push(event as TelemetryEvent);
    }

    this.queue.enqueue(validatedEvents);
    return validatedEvents.length;
  }
}
