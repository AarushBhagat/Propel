# PropelAI: Intelligent Power Grid Fault Localization

## Project Overview
PropelAI is a real-time, event-driven telemetry processing engine and dashboard designed for electricity distribution control rooms. It ingests high-frequency smart meter "power lost" and "power restored" events, correlates them against a graph-based representation of the electrical distribution network, and deterministically pinpoints physical fault locations down to the specific wire span, transformer, or feeder line.

## Problem Statement
In traditional electrical grids, when a fault occurs, operators rely on customer phone calls to identify the general area of an outage. Field crews then patrol the lines to manually find the exact break. Even with modern smart meters, a single span fault can trigger a flood of thousands of "power lost" messages. Sorting through this data storm to find the root cause is a massive data processing challenge. PropelAI solves this by transforming noisy telemetry streams into actionable, precisely localized incident tickets automatically.

## Features
- **Real-Time Telemetry Ingestion**: Handles massive bursts of "power lost/restored" heartbeat signals.
- **Topological Fault Localization**: Implements a highly efficient graph traversal algorithm that finds the exact live-to-dark boundary on the physical grid.
- **Confidence Scoring**: Assigns deterministic confidence levels based on topology source (official vs. GPS-estimated) and sensor reliability.
- **Missing Topology Estimation**: Automatically infers missing grid connections using spatial nearest-neighbor heuristics when official GIS data is incomplete.
- **Deduplication & Debouncing**: Uses sliding-window debounce timers and in-memory caches to prevent race conditions and duplicate incident ticket generation.
- **Ticket Finite State Machine (FSM)**: Enforces strict workflow states (`detected` -> `acknowledged` -> `crew_assigned` -> `resolved` -> `verified` -> `closed`) with automated telemetry verification.
- **AI Summary Generation**: Contextualizes technical incident metrics into human-readable situation reports.
- **Interactive Control Room Dashboard**: A professional, dark-themed React UI rendering live telemetry metrics, active incidents, and a Karnataka-localized Leaflet map.
- **End-to-End Simulation Engine**: Inject synthetic faults (span, transformer, feeder) or scheduled outages directly into the pipeline for testing and demonstration.

## Architecture Overview
The system is built entirely on Node.js using a modular architecture divided into specific domain services:
1. **Simulator**: Injects raw telemetry into the ingestion API.
2. **Telemetry Ingestion & Queue**: Validates and queues payloads to handle massive bursts without blocking.
3. **Telemetry Worker & Processing**: Processes events sequentially, manages the in-memory `stateCache`, and triggers the debounce mechanism.
4. **Debounce Logic**: Buffers state changes to ensure the full impact footprint of a fault is collected before triggering localization.
5. **Localization Service**: Pure graph traversal logic mapping dark nodes.
6. **Confidence & Incident Services**: Scores the localization and groups it into deduplicated database records.
7. **Ticket Workflow & AI**: Manages operational states and generates summaries.

## Technology Stack
- **Frontend**: React (Vite), Tailwind CSS, Leaflet, Lucide Icons, Axios.
- **Backend**: Node.js, Express, TypeScript.
- **Database**: PostgreSQL with Prisma ORM.
- **Containerization**: Docker & Docker Compose.

## Folder Structure
```text
PropelAI/
├── client/                 # React Frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI Components (Dashboard, Map, Incidents, Simulator)
│   │   ├── config/         # App-wide configurations (e.g., map.ts)
│   │   ├── hooks/          # Custom data-fetching hooks
│   │   └── index.css       # Tailwind entry and custom styling
├── server/                 # Node.js Backend
│   ├── prisma/             # Prisma schema and migrations
│   ├── src/
│   │   ├── controllers/    # API Request Handlers
│   │   ├── routes/         # Express Routing Definitions
│   │   ├── services/       # Core Business Logic (Localization, Topology, Incidents)
│   │   ├── workers/        # Background queue processors
│   │   └── index.ts        # Server entry point
└── docker-compose.yml
```

## Installation
Ensure you have the following installed:
- Node.js 20+
- Docker & Docker Compose (optional for local DB)
- PostgreSQL 15+ (if running natively)

1. Clone the repository.
2. Navigate to the project root.
3. Install backend dependencies: `cd server && npm install`
4. Install frontend dependencies: `cd client && npm install`

## Environment Variables
Create a `.env` file in the `server/` directory:
```env
# Database configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fault_localization?schema=public"
PORT=3000

# OpenAI Configuration (Optional, fallback logic exists)
OPENAI_API_KEY="your-api-key"
```
Create a `.env` file in the `client/` directory:
```env
VITE_API_URL=http://localhost:3000
```

## Running Locally
1. Start the PostgreSQL database:
   ```bash
   docker compose up postgres -d
   ```
2. Sync the Prisma schema:
   ```bash
   cd server
   npx prisma db push
   ```
3. Start the backend server:
   ```bash
   cd server
   npm run dev
   ```
4. Start the frontend client:
   ```bash
   cd client
   npm run dev
   ```

## Running with Docker
You can run the entire application stack using Docker Compose:
```bash
docker compose up --build -d
```
The backend will be available at `http://localhost:3000` and the frontend at `http://localhost:5173`.

## Production Deployment
The backend has been configured for compilation via TypeScript. 
1. Build the backend:
   ```bash
   cd server
   npm run build
   ```
2. The production files will be output to `server/dist`.
3. Start the production server:
   ```bash
   npm start
   ```
Deploy the `server/` folder to platforms like Render, and the `client/` folder to Vercel or Netlify. Ensure `DATABASE_URL` is set to your production PostgreSQL instance.

## Simulator
The application includes a built-in Simulator to demonstrate fault localization capabilities. Use the Simulator panel in the dashboard to inject:
- **Span Faults**: Breaks a single wire between two poles.
- **DT Faults**: Drops an entire Distribution Transformer.
- **Feeder Faults**: Drops a massive sub-station feeder line.
- **Scheduled Outages**: Creates a planned maintenance window that suppresses false alarms.
- **Sensor Failures**: Simulates missing heartbeats.

## AI Summary Generator
The `AiSummaryService` utilizes the OpenAI API to translate complex incident data into clear, human-readable operational reports. If the API key is missing or quota is exhausted, a robust deterministic template generator is automatically used as a fallback, ensuring zero disruption to control room operations.

## Screenshots
*<img width="1620" height="1079" alt="image" src="https://github.com/user-attachments/assets/437e7546-f6d2-4716-a957-e950d69ddebd" />
*

## Future Improvements
- **Distributed Queuing**: Replace the in-memory queue with Redis/BullMQ to allow horizontal scaling of the Telemetry Worker across multiple node instances.
- **Predictive Maintenance**: Use historical telemetry data and AI models to flag degrading transformers before they fail.
- **WebSockets**: Implement socket.io for true real-time dashboard updates, replacing the current React-Query polling mechanism.

## License
MIT License
