import { TelemetryEvent } from '../queue/TelemetryQueue';
import { PrismaClient } from '@prisma/client';

export type PoleStateStatus = 'Energized' | 'Dark' | 'Unknown';

export interface CachedPoleState {
  deviceId: string;
  poleId: string;
  status: PoleStateStatus;
  lastSeq: number;
  lastSeen: Date;
  firmwareVersion: string;
  lastEvent: string;
}

/**
 * Service responsible for deduplicating telemetry events, maintaining the canonical
 * network state cache, applying debounce windows, and forwarding clean state to Localization.
 */
export class TelemetryProcessingService {
  private prisma: PrismaClient;

  // In-Memory Pole State Cache, keyed by deviceId for O(1) deduplication
  private stateCache: Map<string, CachedPoleState> = new Map();
  
  // Debounce tracking: deviceId -> NodeJS.Timeout
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Configurable debounce window (Default 60 seconds)
  private readonly DEBOUNCE_WINDOW_MS = 60 * 1000;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Processes a batch of telemetry events sequentially.
   * Enforces the Strict Processing Pipeline:
   * 1. Validate (Done in Controller)
   * 2. Deduplicate
   * 3. Ignore stale
   * 4. Update Pole State
   * 5. Persist
   * 6. Forward to Localization
   */
  public async processBatch(events: TelemetryEvent[]): Promise<void> {
    const validEvents: TelemetryEvent[] = [];

    for (const event of events) {
      const cached = this.stateCache.get(event.device_id);

      // 2 & 3. Deduplicate & Ignore Stale Packets
      // We rely solely on the monotonic hardware `seq` counter, NOT `ts` (timestamps)
      // because cheap IoT clocks drift heavily. `seq` is the absolute source of truth.
      if (cached) {
        if (event.seq === cached.lastSeq) continue; // Exact duplicate
        if (event.seq < cached.lastSeq) continue;   // Stale, out-of-order packet
      }

      // Resolve Pole ID (Lazy load from DB if not in cache)
      let poleId = cached?.poleId;
      if (!poleId) {
        const poleRecord = await this.prisma.pole.findUnique({ where: { deviceId: event.device_id }});
        if (!poleRecord) {
          console.warn(`[Telemetry] Unknown device_id dropped: ${event.device_id}`);
          continue; 
        }
        poleId = poleRecord.id;
      }

      // Determine explicit state from event
      let newStatus: PoleStateStatus = 'Energized';
      if (event.event === 'power_lost') {
         newStatus = 'Dark';
      }

      // 4. Update latest pole state (In-Memory Cache)
      const newState: CachedPoleState = {
        deviceId: event.device_id,
        poleId: poleId,
        status: newStatus,
        lastSeq: event.seq,
        lastSeen: new Date(event.ts),
        firmwareVersion: event.fw || cached?.firmwareVersion || 'unknown',
        lastEvent: event.event
      };
      
      this.stateCache.set(event.device_id, newState);
      validEvents.push(event);

      // 6. Forward updated network state to Localization (via Debounce logic)
      this.handleStateChange(newState);
    }

    // 5. Persist telemetry to PostgreSQL
    if (validEvents.length > 0) {
      await this.prisma.telemetry.createMany({
        data: validEvents.map(e => ({
          deviceId: e.device_id,
          poleId: this.stateCache.get(e.device_id)!.poleId,
          event: e.event,
          energized: e.energized,
          ts: new Date(e.ts),
          seq: e.seq,
          batteryMv: e.battery_mv,
          rssi: e.rssi,
          fw: e.fw
        }))
      });
    }
  }

  /**
   * Applies the Debounce Window to filter out transient faults (e.g., auto-reclosers).
   */
  private handleStateChange(state: CachedPoleState): void {
    const existingTimer = this.debounceTimers.get(state.deviceId);

    if (state.status === 'Dark') {
      if (!existingTimer) {
        const timer = setTimeout(() => {
           this.triggerLocalization(state.poleId);
           this.debounceTimers.delete(state.deviceId);
        }, this.DEBOUNCE_WINDOW_MS);
        this.debounceTimers.set(state.deviceId, timer);
      }
    } else if (state.status === 'Energized') {
      if (existingTimer) {
        // Transient Fault! Power was restored before the debounce window expired.
        clearTimeout(existingTimer);
        this.debounceTimers.delete(state.deviceId);
        console.log(`[Telemetry] Transient fault cleared for ${state.deviceId} (Power Restored < 60s)`);
      } else {
        // Genuine restoration (debounce already passed and incident potentially created)
        this.triggerVerification(state.poleId);
      }
    }
  }

  /**
   * Starts a background cron to monitor for missing heartbeats.
   * Handles the known Firmware 1.2 bug gracefully.
   */
  public startHeartbeatMonitor(): void {
    // Check every 1 minute
    setInterval(() => {
      const now = new Date().getTime();
      let stateChanged = false;

      for (const state of this.stateCache.values()) {
        const timeSinceLastSeen = now - state.lastSeen.getTime();
        
        // Expected heartbeat is ~15 mins. Flag after 16 mins (960,000 ms).
        if (timeSinceLastSeen > 16 * 60 * 1000) { 
          
          if (state.firmwareVersion === '1.2' && state.status !== 'Unknown') {
            // Firmware 1.2 Bug Handling: Do NOT mark as Dark. Mark as Unknown.
            state.status = 'Unknown';
            this.triggerLocalization(state.poleId);
          } else if (state.firmwareVersion !== '1.2' && state.status !== 'Dark') {
            // Standard devices should be marked Dark if they stop heartbeating
            state.status = 'Dark';
            this.handleStateChange(state);
          }
        }
      }
    }, 60 * 1000);
  }

  // Coordinator callback to trigger the incident pipeline
  private workflowTrigger?: (poleId: string, stateCache: Map<string, CachedPoleState>) => void;
  // Coordinator callback to trigger restoration verification
  private restorationTrigger?: (poleId: string, stateCache: Map<string, CachedPoleState>) => void;

  public setWorkflowTrigger(trigger: (poleId: string, stateCache: Map<string, CachedPoleState>) => void) {
    this.workflowTrigger = trigger;
  }

  public setRestorationTrigger(trigger: (poleId: string, stateCache: Map<string, CachedPoleState>) => void) {
    this.restorationTrigger = trigger;
  }

  /**
   * Forwards the updated canonical network state to the Localization Service.
   * Localization operates on state, not individual raw packets.
   */
  private triggerLocalization(poleId: string): void {
    if (this.workflowTrigger) {
      console.log(`[Telemetry] Forwarding updated state cache to Workflow Coordinator for pole ${poleId}...`);
      this.workflowTrigger(poleId, this.stateCache);
    } else {
      console.warn('[Telemetry] Workflow trigger not configured.');
    }
  }

  private triggerVerification(poleId: string): void {
    if (this.restorationTrigger) {
      console.log(`[Telemetry] Triggering restoration verification for pole ${poleId}...`);
      this.restorationTrigger(poleId, this.stateCache);
    }
  }
}
