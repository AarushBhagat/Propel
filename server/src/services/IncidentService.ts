import { PrismaClient, Incident } from '@prisma/client';
import { GraphService } from './GraphService';
import { LocalizationResult } from './LocalizationService';
import { ConfidenceResult } from './ConfidenceService';

/**
 * Service responsible for converting stateless fault detections into 
 * persistent, operable Incident database records.
 * 
 * Design Decision:
 * This service handles database grouping and idempotent deduplication.
 * It explicitly avoids calculating confidence or managing workflow state transitions.
 */
export class IncidentService {
  private prisma: PrismaClient;
  private graphService: GraphService;

  constructor(prisma: PrismaClient, graphService: GraphService) {
    this.prisma = prisma;
    this.graphService = graphService;
  }

  private inFlightCreations = new Map<string, Promise<Incident>>();

  /**
   * Creates or returns an active Incident for a given fault boundary.
   */
  public async createOrGetIncident(
    localization: LocalizationResult,
    confidence: ConfidenceResult,
    hasActiveScheduledOutage: boolean
  ): Promise<Incident> {
    const inferredSpan = `${localization.upstreamPoleId} -> ${localization.downstreamPoleId}`;

    if (this.inFlightCreations.has(inferredSpan)) {
      return this.inFlightCreations.get(inferredSpan)!;
    }

    const creationPromise = (async () => {
      // 1. Idempotent Deduplication
      // Check if an active incident (closedAt is null) already exists for this exact span.
      const existingIncident = await this.prisma.incident.findFirst({
        where: {
          inferredSpan,
          closedAt: null // Active incidents do not have a closedAt timestamp
        }
      });

      if (existingIncident) {
        console.log(`[IncidentService] Deduplicated fault detection. Returning active incident ${existingIncident.id} for span ${inferredSpan}`);
        return existingIncident;
      }

      // 2. Resolve Grouping (Downstream Poles)
      // We explicitly query the GraphService to get all poles physically downstream 
      // of the fault boundary. They are inherently part of this single outage.
      const downstreamPoles = this.graphService.getDownstreamPoles(localization.downstreamPoleId);
      
      // We also include the boundary node itself in the affected poles list
      const affectedPoleIds = [localization.downstreamPoleId, ...downstreamPoles.map(p => p.id)];

      // 3. Create new Incident
      const newIncident = await this.prisma.incident.create({
        data: {
          status: 'detected',
          inferredSpan,
          confidence: confidence.confidenceScore / 100, // DB stores as Float 0.0-1.0
          downstreamImpact: affectedPoleIds.length,
          overlapOutage: hasActiveScheduledOutage,
          // Insert junction records linking the single incident to all affected poles
          incidentPoles: {
            create: affectedPoleIds.map(poleId => ({
              poleId
            }))
          }
        }
      });

      console.log(`[IncidentService] Created new active incident ${newIncident.id} for span ${inferredSpan} grouping ${affectedPoleIds.length} poles.`);
      return newIncident;
    })();

    this.inFlightCreations.set(inferredSpan, creationPromise);
    try {
      return await creationPromise;
    } finally {
      this.inFlightCreations.delete(inferredSpan);
    }
  }
}
