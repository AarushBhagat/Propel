import { PrismaClient } from '@prisma/client';
import { GraphService } from './GraphService';
import { TelemetryIngestionService } from './TelemetryIngestionService';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

export interface ActiveSimulation {
  id: string;
  type: string;
  targetId: string;
  affectedDevices: string[];
}

export class SimulatorService {
  private prisma: PrismaClient;
  private graphService: GraphService;
  private ingestionService: TelemetryIngestionService;

  // Track active faults so they can be restored later
  private activeSimulations: Map<string, ActiveSimulation> = new Map();

  // Simple monotonic counter for simulated seq numbers
  private simSeqCounter: number = 1000000;

  constructor(prisma: PrismaClient, graphService: GraphService, ingestionService: TelemetryIngestionService) {
    this.prisma = prisma;
    this.graphService = graphService;
    this.ingestionService = ingestionService;
  }

  public getActiveSimulations(): ActiveSimulation[] {
    return Array.from(this.activeSimulations.values());
  }

  private generateTelemetry(deviceIds: string[], event: 'power_lost' | 'power_restored', energized: boolean) {
    const ts = new Date().toISOString();
    return deviceIds.map(deviceId => ({
      device_id: deviceId,
      event,
      ts,
      seq: this.simSeqCounter++,
      energized
    }));
  }

  public async injectSpanFault(poleId: string) {
    const pole = this.graphService.getPole(poleId);
    if (!pole) throw new Error('Pole not found');

    const downstream = this.graphService.getDownstreamPoles(poleId);
    const affected = [pole, ...downstream].map(p => p.deviceId).filter((id): id is string => id !== null);

    const payloads = this.generateTelemetry(affected, 'power_lost', false);
    this.ingestionService.ingest(payloads);

    const simId = uuidv4();
    this.activeSimulations.set(simId, { id: simId, type: 'Span Fault', targetId: poleId, affectedDevices: affected });
    
    return { simId, type: 'Span Fault', affectedPoles: affected.length, messagesGenerated: payloads.length };
  }

  public async injectDtFault(dtId: string) {
    const poles = this.graphService.getTransformerPoles(dtId);
    if (poles.length === 0) throw new Error('Transformer not found or has no poles');

    const affected = poles.map(p => p.deviceId).filter((id): id is string => id !== null);
    const payloads = this.generateTelemetry(affected, 'power_lost', false);
    this.ingestionService.ingest(payloads);

    const simId = uuidv4();
    this.activeSimulations.set(simId, { id: simId, type: 'DT Fault', targetId: dtId, affectedDevices: affected });
    
    return { simId, type: 'DT Fault', affectedPoles: affected.length, messagesGenerated: payloads.length };
  }

  public async injectFeederFault(feederId: string) {
    const poles = await this.prisma.pole.findMany({ where: { feederId } });
    if (poles.length === 0) throw new Error('Feeder not found or has no poles');

    const affected = poles.map(p => p.deviceId).filter((id): id is string => id !== null);
    const payloads = this.generateTelemetry(affected, 'power_lost', false);
    this.ingestionService.ingest(payloads);

    const simId = uuidv4();
    this.activeSimulations.set(simId, { id: simId, type: 'Feeder Fault', targetId: feederId, affectedDevices: affected });
    
    return { simId, type: 'Feeder Fault', affectedPoles: affected.length, messagesGenerated: payloads.length };
  }

  public injectSensorFailure(poleId: string) {
    const pole = this.graphService.getPole(poleId);
    if (!pole) throw new Error('Pole not found');

    const simId = uuidv4();
    // For sensor failure, we just track it. The frontend might stop polling or we just let it go dark naturally.
    // Wait, the real Telemetry Processing Service handles missing heartbeats. So doing NOTHING physically to telemetry
    // achieves this. However, since we are a simulator that generates events on demand, we don't have a constant stream.
    // If we want it to go Unknown, we just wait. We don't need to generate telemetry.
    this.activeSimulations.set(simId, { id: simId, type: 'Sensor Failure', targetId: poleId, affectedDevices: [pole.deviceId!] });
    
    return { simId, type: 'Sensor Failure (Missing Heartbeats)', affectedPoles: 1, messagesGenerated: 0 };
  }

  public async injectScheduledOutage(targetId: string, type: 'DT' | 'Feeder') {
    let affected: string[] = [];
    if (type === 'DT') {
      affected = this.graphService.getTransformerPoles(targetId).map(p => p.deviceId).filter((id): id is string => id !== null);
    } else {
      const poles = await this.prisma.pole.findMany({ where: { feederId: targetId } });
      affected = poles.map(p => p.deviceId).filter((id): id is string => id !== null);
    }

    if (affected.length === 0) throw new Error('Target not found or has no poles');

    // Create the schedule record
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour
    
    await this.prisma.scheduledOutage.create({
      data: {
        id: uuidv4(),
        scope: type === 'Feeder' ? 'feeder' : 'dt',
        feederId: type === 'Feeder' ? targetId : null,
        transformerId: type === 'DT' ? targetId : null,
        start: startTime,
        end: endTime,
        reason: 'Simulated Maintenance'
      }
    });

    // Generate outage telemetry
    const payloads = this.generateTelemetry(affected, 'power_lost', false);
    this.ingestionService.ingest(payloads);

    const simId = uuidv4();
    this.activeSimulations.set(simId, { id: simId, type: 'Scheduled Outage', targetId, affectedDevices: affected });
    
    return { simId, type: `Scheduled Outage (${type})`, affectedPoles: affected.length, messagesGenerated: payloads.length };
  }

  public restorePower(simId: string) {
    const sim = this.activeSimulations.get(simId);
    if (!sim) throw new Error('Active simulation not found');

    let payloads: any[] = [];
    if (sim.type !== 'Sensor Failure') {
      payloads = this.generateTelemetry(sim.affectedDevices, 'power_restored', true);
      this.ingestionService.ingest(payloads);
    }
    
    this.activeSimulations.delete(simId);
    
    return { simId, type: 'Restore Power', affectedPoles: sim.affectedDevices.length, messagesGenerated: payloads.length };
  }
}
