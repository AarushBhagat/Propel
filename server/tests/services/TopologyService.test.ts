import { TopologyService } from '../../src/services/TopologyService';
import { GraphService } from '../../src/services/GraphService';
import { PrismaClient } from '@prisma/client';

describe('TopologyService', () => {
  let graphService: GraphService;
  let topologyService: TopologyService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {} as unknown as PrismaClient;
    graphService = new GraphService(mockPrisma);
    topologyService = new TopologyService(graphService);
  });

  describe('calculateEuclideanDistance', () => {
    it('should correctly calculate distance between two lat/lon points', () => {
      const dist = topologyService['calculateEuclideanDistance'](10, 10, 10, 11);
      expect(dist).toBe(1);
    });

    it('should return 0 for identical points', () => {
      const dist = topologyService['calculateEuclideanDistance'](10, 10, 10, 10);
      expect(dist).toBe(0);
    });
  });

  describe('estimateMissingTopology', () => {
    it('should estimate edges for poles without a parent', () => {
      const transformer = { id: 'T-1', lat: 10, lon: 10 } as any;
      const p1 = { id: 'P-1', parentPoleId: null, dtId: 'T-1', lat: 10, lon: 10, childPoles: [], isEstimatedEdge: false };
      const p2 = { id: 'P-2', parentPoleId: null, dtId: 'T-1', lat: 10, lon: 10.0001, childPoles: [], isEstimatedEdge: false };
      
      // We must provide getPole mock so TopologyService can fetch the newly linked poles
      jest.spyOn(graphService, 'getPole').mockImplementation((id: string) => {
        if (id === 'P-1') return p1 as any;
        if (id === 'P-2') return p2 as any;
        return undefined;
      });

      const addEdgeSpy = jest.spyOn(graphService, 'addEdge').mockImplementation();

      topologyService.estimateMissingTopology(transformer, [p1 as any, p2 as any]);

      // It should have called addEdge to link P-2 under P-1 since P-1 is closest to the transformer
      expect(addEdgeSpy).toHaveBeenCalledWith('P-1', 'P-2', true);
    });
  });
});
