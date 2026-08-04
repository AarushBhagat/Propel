import { PrismaClient, Incident, Ticket } from '@prisma/client';
import { CachedPoleState } from './TelemetryProcessingService';
import { AiSummaryService } from './AiSummaryService';

export interface WorkflowResult {
  incident: Incident;
  ticket: Ticket | null;
  transition: string;
  verificationPassed?: boolean;
  verificationReason?: string;
}

/**
 * Valid state transitions for the FSM.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  'detected': ['acknowledged'],
  'acknowledged': ['crew_assigned'],
  'crew_assigned': ['resolved'],
  'resolved': ['verified'],
  'verified': ['closed']
};

/**
 * Service responsible for managing the lifecycle of fault tickets.
 * Handles deterministic FSM transitions and telemetry-based verification.
 */
export class TicketWorkflowService {
  private prisma: PrismaClient;
  private aiSummaryService?: AiSummaryService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public setSummaryService(aiSummaryService: AiSummaryService) {
    this.aiSummaryService = aiSummaryService;
  }

  /**
   * Creates a new Ticket for a newly created Incident.
   * Called by the WorkflowCoordinator after an Incident is created.
   */
  public async createTicket(incidentId: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.create({
      data: {
        incidentId,
        // AI Summary will be populated asynchronously
      }
    });

    if (this.aiSummaryService) {
      // Trigger asynchronously so ticket creation is never blocked
      this.aiSummaryService.generateSummary(incidentId).catch(err => {
        console.error(`[TicketWorkflowService] Background summary generation failed:`, err);
      });
    }

    return ticket;
  }

  /**
   * Transitions an incident to a new state if valid according to the FSM.
   */
  public async transitionState(incidentId: string, newState: string): Promise<WorkflowResult> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { ticket: true }
    });

    if (!incident) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    const currentState = incident.status;
    const allowedNextStates = VALID_TRANSITIONS[currentState] || [];

    if (!allowedNextStates.includes(newState)) {
      throw new Error(`Invalid state transition from '${currentState}' to '${newState}'.`);
    }

    // Prepare update data
    const updateData: any = { status: newState };
    
    if (newState === 'resolved') {
      updateData.resolvedAt = new Date();
    } else if (newState === 'closed') {
      updateData.closedAt = new Date();
    }

    const updatedIncident = await this.prisma.incident.update({
      where: { id: incidentId },
      data: updateData,
      include: { ticket: true }
    });

    return {
      incident: updatedIncident,
      ticket: updatedIncident.ticket,
      transition: `${currentState} -> ${newState}`
    };
  }

  /**
   * Automatically verifies restoration using telemetry.
   * Called by the WorkflowCoordinator whenever power_restored telemetry arrives.
   */
  public async verifyRestoration(
    incidentId: string, 
    stateCache: Map<string, CachedPoleState>
  ): Promise<WorkflowResult> {
    
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        incidentPoles: true,
        ticket: true
      }
    });

    if (!incident) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    if (incident.status !== 'resolved' && incident.status !== 'crew_assigned') {
      return {
        incident,
        ticket: incident.ticket,
        transition: 'none',
        verificationPassed: false,
        verificationReason: `Verification attempted but incident is in status '${incident.status}' instead of 'resolved'.`
      };
    }

    // Verify every affected pole is energized
    const affectedPoleIds = incident.incidentPoles.map(ip => ip.poleId);
    const deenergizedPoles: string[] = [];

    for (const poleId of affectedPoleIds) {
      // Find device mapping for the pole. 
      // stateCache is keyed by deviceId, so we need to iterate to find the poleId
      // Or we can find the state directly if we build a reverse index or search.
      let poleStatus = 'Unknown';
      
      for (const state of stateCache.values()) {
        if (state.poleId === poleId) {
          poleStatus = state.status;
          break;
        }
      }

      if (poleStatus !== 'Energized') {
        deenergizedPoles.push(poleId);
      }
    }

    if (deenergizedPoles.length === 0) {
      // Success: Everyone has power
      // We perform the FSM transitions: resolved -> verified -> closed
      
      let currentIncident = incident;
      
      if (currentIncident.status !== 'resolved') {
         // Force transition to resolved first if it was in crew_assigned
         const res = await this.transitionState(incidentId, 'resolved');
         currentIncident = res.incident;
      }

      const verifiedRes = await this.transitionState(incidentId, 'verified');
      const closedRes = await this.transitionState(incidentId, 'closed');

      return {
        incident: closedRes.incident,
        ticket: closedRes.ticket,
        transition: `${incident.status} -> verified -> closed`,
        verificationPassed: true,
        verificationReason: 'All downstream poles are confirmed Energized via telemetry.'
      };

    } else {
      // Failure: Poles are still dark
      return {
        incident,
        ticket: incident.ticket,
        transition: 'none',
        verificationPassed: false,
        verificationReason: `${deenergizedPoles.length} downstream poles are still de-energized or unknown.`
      };
    }
  }
}
