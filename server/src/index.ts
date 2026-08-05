import app from './app';
import * as dotenv from 'dotenv';
import { GraphService } from './services/GraphService';
import { PrismaClient } from '@prisma/client';
import { TelemetryProcessingService } from './services/TelemetryProcessingService';
import { TelemetryWorker } from './workers/TelemetryWorker';
import { TelemetryIngestionService } from './services/TelemetryIngestionService';
import { SimulatorService } from './services/SimulatorService';
import { ScheduledOutageService } from './services/ScheduledOutageService';
import { LocalizationService } from './services/LocalizationService';
import { ConfidenceService } from './services/ConfidenceService';
import { IncidentService } from './services/IncidentService';
import { TicketWorkflowService } from './services/TicketWorkflowService';
import { WorkflowCoordinator } from './services/WorkflowCoordinator';

// Load environment variables
dotenv.config();

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const PORT = process.env.PORT || 3000;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/fault_localization?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
export const graphService = new GraphService(prisma);
export const telemetryIngestionService = new TelemetryIngestionService();
export const simulatorService = new SimulatorService(prisma, graphService, telemetryIngestionService);

import { AiSummaryService } from './services/AiSummaryService';

// Initialize Workflow Services
const scheduledOutageService = new ScheduledOutageService(prisma);
const localizationService = new LocalizationService(graphService);
const confidenceService = new ConfidenceService();
const incidentService = new IncidentService(prisma, graphService);
export const ticketWorkflowService = new TicketWorkflowService(prisma);

const aiSummaryService = new AiSummaryService(prisma);
ticketWorkflowService.setSummaryService(aiSummaryService);

const workflowCoordinator = new WorkflowCoordinator(
  graphService,
  localizationService,
  confidenceService,
  incidentService,
  scheduledOutageService,
  ticketWorkflowService
);

import { TopologyService } from './services/TopologyService';

async function startServer() {
  console.log('[Server] Initializing...');
  
  // 1. Load the graph into memory before accepting requests
  await graphService.loadGraph();

  // 1b. Estimate missing topology for DTs that lack official relationships
  console.log('[Server] Estimating missing topology...');
  const topologyService = new TopologyService(graphService);
  const transformers = await prisma.transformer.findMany();
  let estimatedCount = 0;
  for (const dt of transformers) {
    const poles = graphService.getTransformerPoles(dt.id);
    // Only estimates if missing topology is detected
    topologyService.estimateMissingTopology(dt, poles);
    if (poles.filter(p => !p.parentPoleId).length > 1) {
      estimatedCount++;
    }
  }
  if (estimatedCount > 0) console.log(`[Server] Estimated topology for ${estimatedCount} Transformers.`);

  // 2. Start the background Telemetry Worker
  const telemetryProcessor = new TelemetryProcessingService(prisma);

  
  // Wire the Workflow Coordinator to the Processing Service
  telemetryProcessor.setWorkflowTrigger((poleId, stateCache) => {
    workflowCoordinator.handleFaultTrigger(poleId, stateCache);
  });
  telemetryProcessor.setRestorationTrigger((poleId, stateCache) => {
    workflowCoordinator.handleRestorationTrigger(poleId, stateCache);
  });

  telemetryProcessor.startHeartbeatMonitor(); // Start the cron for missing heartbeats & fw 1.2 bug
  
  const telemetryWorker = new TelemetryWorker(telemetryProcessor, 100, 50);
  telemetryWorker.start();
  
  // 3. Start accepting HTTP traffic
  app.listen(PORT, () => {
    console.log(`[Server] Telemetry Ingestion API running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
