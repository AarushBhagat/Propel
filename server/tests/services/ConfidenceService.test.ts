import { ConfidenceService } from '../../src/services/ConfidenceService';
import { LocalizationResult } from '../../src/services/LocalizationService';
import { CachedPoleState } from '../../src/services/TelemetryProcessingService';

describe('ConfidenceService', () => {
  let confidenceService: ConfidenceService;

  beforeEach(() => {
    confidenceService = new ConfidenceService();
  });

  it('should start with a base score of 100', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: false,
      unknownPolesEncountered: 0,
      traversedPath: []
    };
    const states = new Map<string, CachedPoleState>();

    const confidence = confidenceService.calculateConfidence(result, states, false);
    
    expect(confidence.confidenceScore).toBe(100);
    expect(confidence.confidenceLevel).toBe('High');
  });

  it('should apply a penalty for estimated topology', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: true, // Penalty applied here
      unknownPolesEncountered: 0,
      traversedPath: []
    };
    const states = new Map<string, CachedPoleState>();

    const confidence = confidenceService.calculateConfidence(result, states, false);
    
    expect(confidence.confidenceScore).toBe(80); // 100 - 20
    expect(confidence.confidenceFactors.topology).toBe(-20);
  });

  it('should apply a bonus for multiple affected downstream devices', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 16, // Max bonus
      isEstimatedEdge: false,
      unknownPolesEncountered: 0,
      traversedPath: []
    };
    const states = new Map<string, CachedPoleState>();

    const confidence = confidenceService.calculateConfidence(result, states, false);
    
    expect(confidence.confidenceScore).toBe(100); // 100 + 8 = 108, clamped to 100
    expect(confidence.confidenceFactors.confirmation).toBe(8);
  });

  it('should apply a penalty for unknown poles encountered', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: false,
      unknownPolesEncountered: 2, // 2 * -5 = -10
      traversedPath: []
    };
    const states = new Map<string, CachedPoleState>();

    const confidence = confidenceService.calculateConfidence(result, states, false);
    
    expect(confidence.confidenceScore).toBe(90);
    expect(confidence.confidenceFactors.ambiguity).toBe(-10);
  });

  it('should apply a penalty for unstable firmware versions', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: false,
      unknownPolesEncountered: 0,
      traversedPath: ['P-1', 'P-2']
    };
    const states = new Map<string, CachedPoleState>();
    states.set('P-2', { poleId: 'P-2', status: 'Dark', lastSeen: new Date(), lastEvent: 'power_lost', firmwareVersion: '1.2', lastSeq: 1 });

    const confidence = confidenceService.calculateConfidence(result, states, false);
    
    expect(confidence.confidenceScore).toBe(90);
    expect(confidence.confidenceFactors.sensorReliability).toBe(-10);
  });

  it('should apply a massive penalty for scheduled outages', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: false,
      unknownPolesEncountered: 0,
      traversedPath: []
    };
    const states = new Map<string, CachedPoleState>();

    const confidence = confidenceService.calculateConfidence(result, states, true); // Active scheduled outage
    
    expect(confidence.confidenceScore).toBe(80);
    expect(confidence.confidenceFactors.maintenance).toBe(-20);
  });

  it('should correctly combine and clamp multiple factors', () => {
    const result: LocalizationResult = {
      upstreamPoleId: 'P-1',
      downstreamPoleId: 'P-2',
      affectedCount: 0,
      isEstimatedEdge: true,       // -20
      unknownPolesEncountered: 5,  // -25
      traversedPath: ['P-1', 'P-2'] // Firmware check
    };
    const states = new Map<string, CachedPoleState>();
    states.set('P-2', { poleId: 'P-2', status: 'Dark', lastSeen: new Date(), lastEvent: 'power_lost', firmwareVersion: '1.2', lastSeq: 1 }); // -10

    const confidence = confidenceService.calculateConfidence(result, states, true); // Outage penalty -20
    
    // 100 - 20 - 25 - 10 - 20 = 25
    expect(confidence.confidenceScore).toBe(25);
    expect(confidence.confidenceLevel).toBe('Low');
  });
});
