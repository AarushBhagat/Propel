import { LocalizationService } from './LocalizationService';
import { ConfidenceService } from './ConfidenceService';
import { IncidentService } from './IncidentService';
import { ScheduledOutageService } from './ScheduledOutageService';
import { GraphService } from './GraphService';
import { CachedPoleState } from './TelemetryProcessingService';

/**
 * Orchestrates the sequence of events triggered after a telemetry debounce window expires.
 * 
 * Design Decision:
 * To keep individual services focused on a Single Responsibility, this coordinator
 * handles passing data between Localization, Maintenance Checks, Confidence Scoring, 
 * and Incident Creation. It explicitly guarantees that scheduled outages only reduce 
 * confidence and never skip incident creation.
 */
export class WorkflowCoordinator {
  private graphService: GraphService;
  private localizationService: LocalizationService;
  private confidenceService: ConfidenceService;
  private incidentService: IncidentService;
  private scheduledOutageService: ScheduledOutageService;

  constructor(
    graphService: GraphService,
    localizationService: LocalizationService,
    confidenceService: ConfidenceService,
    incidentService: IncidentService,
    scheduledOutageService: ScheduledOutageService
  ) {
    this.graphService = graphService;
    this.localizationService = localizationService;
    this.confidenceService = confidenceService;
    this.incidentService = incidentService;
    this.scheduledOutageService = scheduledOutageService;
  }

  /**
   * Executed by the TelemetryProcessingService once a fault debounce expires.
   */
  public async handleFaultTrigger(poleId: string, stateCache: Map<string, CachedPoleState>): Promise<void> {
    try {
      // 1. Resolve Topology
      const pole = this.graphService.getPole(poleId);
      if (!pole) {
        console.warn(`[WorkflowCoordinator] Could not find pole ${poleId} in graph.`);
        return;
      }

      // 2. Localize Faults in this DT's sub-graph
      const faults = this.localizationService.localizeFaults(pole.dtId, stateCache);
      if (faults.length === 0) return;

      // 3. Check Scheduled Outages for this DT/Feeder
      const hasActiveOutage = await this.scheduledOutageService.hasActiveOutage(pole.feederId, pole.dtId);

      // 4 & 5. Confidence Scoring and Incident Creation for every detected fault boundary
      for (const fault of faults) {
        const confidence = this.confidenceService.calculateConfidence(fault, stateCache, hasActiveOutage);
        
        await this.incidentService.createOrGetIncident(fault, confidence, hasActiveOutage);
      }
    } catch (error) {
      console.error(`[WorkflowCoordinator] Error orchestrating fault pipeline for pole ${poleId}:`, error);
    }
  }
}
