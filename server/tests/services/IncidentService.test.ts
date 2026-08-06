import { IncidentService } from '../../src/services/IncidentService';
import { GraphService } from '../../src/services/GraphService';
import { PrismaClient } from '@prisma/client';

describe('IncidentService', () => {
  let incidentService: IncidentService;
  let mockPrisma: any;
  let mockGraphService: any;

  beforeEach(() => {
    mockPrisma = {
      incident: {
        findFirst: jest.fn(),
        create: jest.fn()
      }
    } as unknown as PrismaClient;

    mockGraphService = {
      getDownstreamPoles: jest.fn()
    } as unknown as GraphService;
    
    incidentService = new IncidentService(mockPrisma, mockGraphService);
  });

  describe('createOrGetIncident', () => {
    it('should deduplicate and return an existing active incident if one exists for the same span', async () => {
      const localization = { upstreamPoleId: 'P-1', downstreamPoleId: 'P-2', affectedCount: 1, isEstimatedEdge: false, unknownPolesEncountered: 0, traversedPath: [] };
      const confidence = { confidenceScore: 90, confidenceLevel: 'High' as 'High', confidenceFactors: {}, explanations: [] };
      
      const existingIncident = { id: 'I-123', inferredSpan: 'P-1 -> P-2', closedAt: null };
      mockPrisma.incident.findFirst.mockResolvedValue(existingIncident);

      const result = await incidentService.createOrGetIncident(localization, confidence, false);
      
      expect(result).toBe(existingIncident);
      expect(mockPrisma.incident.create).not.toHaveBeenCalled();
    });

    it('should create a new incident if none exists, grouping downstream poles', async () => {
      const localization = { upstreamPoleId: 'P-1', downstreamPoleId: 'P-2', affectedCount: 1, isEstimatedEdge: false, unknownPolesEncountered: 0, traversedPath: [] };
      const confidence = { confidenceScore: 90, confidenceLevel: 'High' as 'High', confidenceFactors: {}, explanations: [] };
      
      mockPrisma.incident.findFirst.mockResolvedValue(null); // No existing incident
      mockGraphService.getDownstreamPoles.mockReturnValue([{ id: 'P-3' }]); // P-3 is downstream of P-2

      const newIncident = { id: 'I-456', inferredSpan: 'P-1 -> P-2', closedAt: null };
      mockPrisma.incident.create.mockResolvedValue(newIncident);

      const result = await incidentService.createOrGetIncident(localization, confidence, false);
      
      expect(result).toBe(newIncident);
      expect(mockPrisma.incident.create).toHaveBeenCalledTimes(1);

      const createArgs = mockPrisma.incident.create.mock.calls[0][0];
      expect(createArgs.data.inferredSpan).toBe('P-1 -> P-2');
      // Downstream impact should be 2: The boundary node itself (P-2) + downstream (P-3)
      expect(createArgs.data.downstreamImpact).toBe(2);
      expect(createArgs.data.incidentPoles.create).toHaveLength(2);
      expect(createArgs.data.incidentPoles.create).toEqual(
        expect.arrayContaining([{ poleId: 'P-2' }, { poleId: 'P-3' }])
      );
    });
  });
});
