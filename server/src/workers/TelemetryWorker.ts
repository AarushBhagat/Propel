import { TelemetryQueue, TelemetryEvent } from '../queue/TelemetryQueue';
import { TelemetryProcessingService } from '../services/TelemetryProcessingService';

/**
 * Background worker that continuously polls the in-memory queue.
 * 
 * Design Decision:
 * This worker operates sequentially. By using a single asynchronous loop, it
 * guarantees deterministic sequential processing of telemetry. It prevents 
 * race conditions without needing complex locking mechanisms.
 */
export class TelemetryWorker {
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private queue: TelemetryQueue;
  private processingService: TelemetryProcessingService;
  
  // Configurable batch size and delay
  private readonly batchSize: number;
  private readonly idleDelayMs: number;

  constructor(
    processingService: TelemetryProcessingService, 
    batchSize: number = 100, 
    idleDelayMs: number = 50
  ) {
    this.queue = TelemetryQueue.getInstance();
    this.processingService = processingService;
    this.batchSize = batchSize;
    this.idleDelayMs = idleDelayMs;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[TelemetryWorker] Started polling queue. Batch size: ${this.batchSize}`);
    
    // Setup graceful shutdown handlers
    process.on('SIGINT', () => this.stop('SIGINT'));
    process.on('SIGTERM', () => this.stop('SIGTERM'));

    this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    const events = this.queue.dequeueBatch(this.batchSize);

    if (events.length > 0) {
      this.isProcessing = true;
      try {
        // Sequentially process the batch. Node will pause the loop here until it completes.
        await this.processingService.processBatch(events);
      } catch (error) {
        console.error('[TelemetryWorker] Error processing batch:', error);
      } finally {
        this.isProcessing = false;
      }
      
      // If we found events, check immediately again without waiting
      setImmediate(() => this.poll());
    } else {
      // If the queue is empty, sleep for a short duration (e.g., 50ms) to avoid CPU busy waiting
      setTimeout(() => this.poll(), this.idleDelayMs);
    }
  }

  /**
   * Graceful shutdown ensures the worker finishes processing the current active batch
   * before exiting, preventing partially processed telemetry from being lost or corrupted.
   */
  public async stop(signal: string): Promise<void> {
    console.log(`\n[TelemetryWorker] Received ${signal}. Initiating graceful shutdown...`);
    this.isRunning = false;

    // Wait if a batch is currently being processed
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('[TelemetryWorker] Graceful shutdown complete.');
    process.exit(0);
  }
}
