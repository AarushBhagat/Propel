import express from 'express';
import cors from 'cors';
import telemetryRoutes from './routes/telemetry.routes';
import simulatorRoutes from './routes/simulator.routes';
import incidentRoutes from './routes/incident.routes';
import ticketRoutes from './routes/ticket.routes';
import metricsRoutes from './routes/metrics.routes';
import outageRoutes from './routes/outage.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// Mount API Routes
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/scheduled-outages', outageRoutes);

export default app;
