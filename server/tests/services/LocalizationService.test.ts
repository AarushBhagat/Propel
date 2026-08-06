import { LocalizationService } from '../../src/services/LocalizationService';
import { GraphService } from '../../src/services/GraphService';
import { PoleStateStatus } from '../../src/services/TelemetryProcessingService';
import { PrismaClient } from '@prisma/client';

describe('LocalizationService', () => {
  let graphService: GraphService;
  let localizationService: LocalizationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {} as unknown as PrismaClient;
    graphService = new GraphService(mockPrisma);
    localizationService = new LocalizationService(graphService);
  });

  describe('localizeFaults', () => {
    it('should identify a DT fault when the root pole is dark', () => {
      const transformerId = 'T-1';
      
      const rootPole = { id: 'P-1', dtId: 'T-1', poleType: 'ht_pole', lat: 10, lon: 10, childPoles: [{ id: 'P-2' }] } as any;
      const childPole = { id: 'P-2', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      
      jest.spyOn(graphService, 'getTransformerPoles').mockReturnValue([rootPole, childPole]);

      const poleStates = new Map<string, PoleStateStatus>();
      poleStates.set('P-1', 'Dark');
      poleStates.set('P-2', 'Dark');

      const results = localizationService.localizeFaults(transformerId, poleStates);

      expect(results).toHaveLength(1);
      expect(results[0].upstreamPoleId).toBeNull();
      expect(results[0].downstreamPoleId).toBe('P-1');
      expect(results[0].affectedCount).toBe(2);
      expect(results[0].isEstimatedEdge).toBe(false);
    });

    it('should identify a span fault between energized and dark poles', () => {
      const transformerId = 'T-1';
      
      const rootPole = { id: 'P-1', dtId: 'T-1', poleType: 'ht_pole', lat: 10, lon: 10, childPoles: [{ id: 'P-2' }] } as any;
      const childPole = { id: 'P-2', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [{ id: 'P-3' }] } as any;
      const grandChildPole = { id: 'P-3', parentPoleId: 'P-2', poleType: 'lt_pole', childPoles: [] } as any;
      const e1 = { id: 'E-1', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      const e2 = { id: 'E-2', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      const e3 = { id: 'E-3', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      
      // We need < 50% dark poles to bypass the DT fault heuristic
      jest.spyOn(graphService, 'getTransformerPoles').mockReturnValue([rootPole, childPole, grandChildPole, e1, e2, e3]);
      jest.spyOn(graphService, 'getChildren').mockImplementation((id: string) => {
        if (id === 'P-1') return [childPole, e1, e2, e3];
        if (id === 'P-2') return [grandChildPole];
        return [];
      });

      const poleStates = new Map<string, PoleStateStatus>();
      poleStates.set('P-1', 'Energized');
      poleStates.set('E-1', 'Energized');
      poleStates.set('E-2', 'Energized');
      poleStates.set('E-3', 'Energized');
      poleStates.set('P-2', 'Dark');
      poleStates.set('P-3', 'Dark');

      const results = localizationService.localizeFaults(transformerId, poleStates);

      expect(results).toHaveLength(1);
      expect(results[0].upstreamPoleId).toBe('P-1');
      expect(results[0].downstreamPoleId).toBe('P-2');
    });

    it('should handle unmapped (Unknown) poles and find the dark boundary further downstream', () => {
      const transformerId = 'T-1';
      
      const rootPole = { id: 'P-1', dtId: 'T-1', poleType: 'ht_pole', lat: 10, lon: 10, childPoles: [{ id: 'P-2' }] } as any;
      const unmappedChild = { id: 'P-2', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [{ id: 'P-3' }] } as any;
      const darkGrandChild = { id: 'P-3', parentPoleId: 'P-2', poleType: 'lt_pole', childPoles: [] } as any;
      const e1 = { id: 'E-1', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      const e2 = { id: 'E-2', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      const e3 = { id: 'E-3', parentPoleId: 'P-1', poleType: 'lt_pole', childPoles: [] } as any;
      
      jest.spyOn(graphService, 'getTransformerPoles').mockReturnValue([rootPole, unmappedChild, darkGrandChild, e1, e2, e3]);
      jest.spyOn(graphService, 'getChildren').mockImplementation((id: string) => {
        if (id === 'P-1') return [unmappedChild, e1, e2, e3];
        if (id === 'P-2') return [darkGrandChild];
        return [];
      });

      const poleStates = new Map<string, PoleStateStatus>();
      poleStates.set('P-1', 'Energized');
      poleStates.set('E-1', 'Energized');
      poleStates.set('E-2', 'Energized');
      poleStates.set('E-3', 'Energized');
      // P-2 missing (Unknown)
      poleStates.set('P-3', 'Dark');

      const results = localizationService.localizeFaults(transformerId, poleStates);

      expect(results).toHaveLength(1);
      // The upstream pole is the nearest non-dark pole (P-2 which is Unknown)
      expect(results[0].upstreamPoleId).toBe('P-2');
      expect(results[0].downstreamPoleId).toBe('P-3');
      expect(results[0].unknownPolesEncountered).toBe(1);
    });
  });
});
