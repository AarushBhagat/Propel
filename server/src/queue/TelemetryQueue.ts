export interface TelemetryEvent {
  device_id: string;
  event: 'heartbeat' | 'power_lost' | 'power_restored' | 'boot';
  ts: string;
  seq: number;
  energized: boolean;
  battery_mv?: number;
  rssi?: number;
  fw?: string;
}

/**
 * In-Memory Queue for Telemetry Events
 * 
 * Design Decision: We use a simple array-based singleton queue to buffer incoming telemetry
 * bursts (e.g., thousands of power_lost events during a storm) instead of processing them 
 * synchronously. This satisfies the assignment requirement without introducing heavy 
 * infrastructure like Kafka or RabbitMQ.
 */
export class TelemetryQueue {
  private static instance: TelemetryQueue;
  private queue: TelemetryEvent[] = [];

  private constructor() {}

  public static getInstance(): TelemetryQueue {
    if (!TelemetryQueue.instance) {
      TelemetryQueue.instance = new TelemetryQueue();
    }
    return TelemetryQueue.instance;
  }

  /**
   * Pushes one or more events into the queue.
   */
  public enqueue(event: TelemetryEvent | TelemetryEvent[]): void {
    if (Array.isArray(event)) {
      this.queue.push(...event);
    } else {
      this.queue.push(event);
    }
  }

  /**
   * Pulls a batch of events from the front of the queue for the worker to process.
   */
  public dequeueBatch(batchSize: number = 100): TelemetryEvent[] {
    return this.queue.splice(0, batchSize);
  }

  public size(): number {
    return this.queue.length;
  }
}
