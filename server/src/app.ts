import express from 'express';
import cors from 'cors';
import telemetryRoutes from './routes/telemetry.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// Mount API Routes
app.use('/api/telemetry', telemetryRoutes);

export default app;
