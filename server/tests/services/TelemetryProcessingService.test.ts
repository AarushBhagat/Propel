import { TelemetryProcessingService, CachedPoleState } from '../../src/services/TelemetryProcessingService';
import { PrismaClient } from '@prisma/client';

describe('TelemetryProcessingService', () => {
  let telemetryProcessingService: TelemetryProcessingService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      telemetry: {
        createMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      pole: {
        findUnique: jest.fn()
      }
    } as unknown as PrismaClient;
    
    telemetryProcessingService = new TelemetryProcessingService(mockPrisma);
  });

  describe('processBatch', () => {
    it('should ignore duplicate telemetry based on seq number', async () => {
      const batch = [
        { device_id: 'D-1', event: 'heartbeat', energized: true, seq: 100, ts: new Date().toISOString() },
        { device_id: 'D-1', event: 'heartbeat', energized: true, seq: 100, ts: new Date().toISOString() }, // duplicate
        { device_id: 'D-1', event: 'heartbeat', energized: true, seq: 90, ts: new Date().toISOString() },  // stale
      ];

      // Inject a mock for prisma pole lookup
      mockPrisma.pole.findUnique = jest.fn().mockImplementation(({ where: { deviceId } }) => {
        if (deviceId === 'D-1') return Promise.resolve({ id: 'P-1', dtId: 'T-1' });
        return Promise.resolve(null);
      });

      await telemetryProcessingService.processBatch(batch);

      expect(mockPrisma.telemetry.createMany).toHaveBeenCalledTimes(1);
      
      const createArgs = mockPrisma.telemetry.createMany.mock.calls[0][0];
      // Only the first event (seq 100) should be processed and saved. The duplicates/stale are skipped.
      expect(createArgs.data).toHaveLength(1);
      expect(createArgs.data[0].seq).toBe(100);
    });

    it('should properly update the state cache and return affected transformer', async () => {
      const batch = [
        { device_id: 'D-2', event: 'power_lost', energized: false, seq: 200, ts: new Date().toISOString(), fw: '1.2' },
      ];

      mockPrisma.pole.findUnique = jest.fn().mockImplementation(({ where: { deviceId } }) => {
        if (deviceId === 'D-2') return Promise.resolve({ id: 'P-2', dtId: 'T-2' });
        return Promise.resolve(null);
      });

      const affected = await telemetryProcessingService.processBatch(batch);

      // Verify the state cache was updated correctly
      const cache = telemetryProcessingService['stateCache'];
      expect(cache.get('D-2')).toBeDefined();
      expect(cache.get('D-2')?.status).toBe('Dark');
      expect(cache.get('D-2')?.firmwareVersion).toBe('1.2');
    });
  });
});
