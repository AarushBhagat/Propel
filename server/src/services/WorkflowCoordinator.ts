import { LocalizationService } from './LocalizationService';
import { ConfidenceService } from './ConfidenceService';
import { IncidentService } from './IncidentService';
import { ScheduledOutageService } from './ScheduledOutageService';
import { TicketWorkflowService } from './TicketWorkflowService';
import { GraphService } from './GraphService';
import { CachedPoleState } from './TelemetryProcessingService';

/**
 * Orchestrates the sequence of events triggered after a telemetry debounce window expires.
 * 
 * Design Decision:
 * To keep individual services focused on a Single Responsibility, this coordinator
 * handles passing data between Localization, Maintenance Checks, Confidence Scoring, 
 * Incident Creation, and Ticket initialization.
 */
export class WorkflowCoordinator {
  private graphService: GraphService;
  private localizationService: LocalizationService;
  private confidenceService: ConfidenceService;
  private incidentService: IncidentService;
  private scheduledOutageService: ScheduledOutageService;
  private ticketWorkflowService: TicketWorkflowService;

  constructor(
    graphService: GraphService,
    localizationService: LocalizationService,
    confidenceService: ConfidenceService,
    incidentService: IncidentService,
    scheduledOutageService: ScheduledOutageService,
    ticketWorkflowService: TicketWorkflowService
  ) {
    this.graphService = graphService;
    this.localizationService = localizationService;
    this.confidenceService = confidenceService;
    this.incidentService = incidentService;
    this.scheduledOutageService = scheduledOutageService;
    this.ticketWorkflowService = ticketWorkflowService;
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

      // 4 & 5 & 6. Confidence Scoring, Incident Creation, Ticket Initialization
      for (const fault of faults) {
        const confidence = this.confidenceService.calculateConfidence(fault, stateCache, hasActiveOutage);
        
        const incident = await this.incidentService.createOrGetIncident(fault, confidence, hasActiveOutage);
        
        // Ensure a ticket is created for the incident if it doesn't have one (e.g., if newly created)
        const existingTicket = await this.ticketWorkflowService['prisma'].ticket.findUnique({
          where: { incidentId: incident.id }
        });

        if (!existingTicket) {
          await this.ticketWorkflowService.createTicket(incident.id);
          console.log(`[WorkflowCoordinator] Initialized Ticket for Incident ${incident.id}`);
        }
      }
    } catch (error) {
      console.error(`[WorkflowCoordinator] Error orchestrating fault pipeline for pole ${poleId}:`, error);
    }
  }

  /**
   * Executed by the TelemetryProcessingService when a pole regains power (post-debounce).
   * Finds any active incidents associated with this pole and attempts to verify them.
   */
  public async handleRestorationTrigger(poleId: string, stateCache: Map<string, CachedPoleState>): Promise<void> {
    try {
      // Find active incidents involving this pole
      const incidents = await this.ticketWorkflowService['prisma'].incident.findMany({
        where: {
          closedAt: null, // Only active incidents
          incidentPoles: {
            some: { poleId }
          }
        }
      });

      for (const incident of incidents) {
        console.log(`[WorkflowCoordinator] Attempting telemetry verification for Incident ${incident.id}`);
        const result = await this.ticketWorkflowService.verifyRestoration(incident.id, stateCache);
        if (result.verificationPassed) {
          console.log(`[WorkflowCoordinator] Incident ${incident.id} successfully verified and closed!`);
        } else {
          console.log(`[WorkflowCoordinator] Incident ${incident.id} verification failed: ${result.verificationReason}`);
        }
      }
    } catch (error) {
      console.error(`[WorkflowCoordinator] Error handling restoration trigger for pole ${poleId}:`, error);
    }
  }
}
