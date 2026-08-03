import app from './app';
import * as dotenv from 'dotenv';
import { GraphService } from './services/GraphService';
import { PrismaClient } from '@prisma/client';
import { TelemetryProcessingService } from './services/TelemetryProcessingService';
import { TelemetryWorker } from './workers/TelemetryWorker';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
export const prisma = new PrismaClient();
export const graphService = new GraphService(prisma);

async function startServer() {
  console.log('[Server] Initializing...');
  
  // 1. Load the graph into memory before accepting requests
  await graphService.loadGraph();

  // 2. Start the background Telemetry Worker
  const telemetryProcessor = new TelemetryProcessingService(prisma);
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
