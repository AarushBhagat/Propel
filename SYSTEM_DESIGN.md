# System Design Document: PropelAI

This document outlines the complete system design of the PropelAI Grid Fault Localization platform.

## 1. Requirements

### Functional Requirements
- The system must ingest "power lost" and "power restored" telemetry events from smart meters.
- The system must deduplicate and batch telemetry events in real-time.
- The system must analyze grid topology to deterministically localize faults to specific spans, transformers, or feeders.
- The system must generate operational tickets with a strictly enforced workflow state machine.
- The system must auto-verify and close tickets when power is physically restored.
- The system must generate human-readable incident summaries (AI or template-based).
- The system must provide an interactive dashboard displaying active incidents and map overlays.

### Non-Functional Requirements
- **Latency**: Telemetry bursts must not block the main event loop. Operator dashboards must reflect new tickets within 60-90 seconds of a fault occurring (including debounce time).
- **Reliability**: The system must degrade gracefully (e.g., fallback summaries if OpenAI fails, nearest-neighbor graph completion if GIS topology is missing).
- **Consistency**: Race conditions must be prevented to ensure duplicate incident tickets are never created for the same fault.
- **Explainability**: Localization logic must be deterministic and mathematically verifiable, not a "black-box" ML model.

## 2. High-Level Design (HLD)

PropelAI follows a classic decoupled event-driven architecture, structured around an Express.js monolith. 

1. **Ingestion Layer**: A lightweight HTTP API accepts payloads and immediately pushes them to an in-memory queue.
2. **Processing Layer**: A background worker pops queue batches, validates seq numbers against a global state cache, and updates raw records.
3. **Analytics Layer**: The Debounce timer waits for the telemetry "storm" to settle, then triggers the pure `LocalizationService` to perform graph traversal.
4. **Operations Layer**: The `IncidentService` and `TicketWorkflowService` persist results into PostgreSQL and handle state transitions.
5. **Presentation Layer**: A React SPA polls the API for metric and state updates.

## 3. Low-Level Design (LLD) & Algorithms

### Graph Traversal (Live-to-Dark Boundary)
The core localization algorithm represents the grid as a Rooted Tree (Adjacency List).
1. The transformer is the root.
2. The algorithm traverses downwards.
3. If a node is `Energized` but its children are `Dark`, that exact physical edge is identified as a broken span.
4. If the root itself is `Dark`, it's identified as a Transformer/Feeder fault.

### Deduplication Strategy
1. **Device Level**: `device_id` + `seq`. If an incoming seq is `<= lastSeq` in cache, it is dropped.
2. **System Level**: `inFlightCreations` Memory Lock. If two delayed debounce events trigger incident creation for the exact same `poleId`, the second event awaits the Promise of the first event, returning the exact same DB row.

## 4. Database Schema

```prisma
model Feeder {
  id          String        @id
  transformers Transformer[]
}

model Transformer {
  id          String   @id
  lat         Float
  lon         Float
  feederId    String
  feeder      Feeder   @relation(fields: [feederId], references: [id])
  poles       Pole[]
}

model Pole {
  id          String       @id
  deviceId    String?      @unique
  lat         Float
  lon         Float
  transformerId String
  transformer Transformer @relation(fields: [transformerId], references: [id])
  incidents   IncidentPole[]
}

model Incident {
  id               String   @id @default(uuid())
  status           String   @default("detected")
  inferredSpan     String?
  confidence       Int
  downstreamImpact Int
  overlapOutage    Boolean  @default(false)
  ticket           Ticket?
  incidentPoles    IncidentPole[]
}

model Ticket {
  id          String   @id @default(uuid())
  incidentId  String   @unique
  incident    Incident @relation(fields: [incidentId], references: [id])
  summary     String?
  status      String   @default("detected")
}
```

## 5. Service Responsibilities
- **GraphService**: Loads topology. Calculates estimated edges (`dist(x,y) < min`).
- **TelemetryProcessingService**: Updates memory cache. Drops stale/duplicate packets.
- **LocalizationService**: Stateless live-to-dark boundary calculator.
- **ConfidenceService**: Penalizes confidence scores for estimated topology or firmware 1.2 sensors.
- **IncidentService**: DB transaction layer for saving faults.
- **TicketWorkflowService**: Enforces FSM (`detected` -> `closed`).

## 6. Sequence Diagrams

*(See `ARCHITECTURE.md` for detailed Mermaid diagrams of the Telemetry and Localization flows).*

## 7. Scaling Considerations

The current architecture is a monolithic Node.js server. To scale to a national level:
1. **Queue Upgrade**: Replace the in-memory array with Apache Kafka or Redis (BullMQ).
2. **Horizontal Scaling**: Run multiple instances of the Telemetry Worker.
3. **State Cache**: Move the `Map<string, CachedPoleState>` into a Redis cluster.
4. **Distributed Locking**: Replace the in-memory `inFlightCreations` Map with Redis Redlock to prevent distributed race conditions during incident creation.
5. **Graph Database**: Move the Adjacency List into Neo4j for faster traversal across millions of nodes without memory bloat.

## 8. Known Limitations
1. **Volatile Queue**: If the server restarts unexpectedly, all unprocessed telemetry in the memory queue is lost.
2. **Memory Constraints**: The `GraphService` loads the entire state topology into RAM. This works for regional grids but requires sharding for national grids.
3. **No Auth**: The dashboard currently lacks authentication/RBAC (Role-Based Access Control) necessary for real control rooms.

## 9. Future Improvements
- Implement WebSocket (Socket.io) to push real-time incident updates to the React UI instead of 10s polling.
- Integrate weather APIs to dynamically lower confidence scores during severe storms where correlated failures are high.
- Implement Smart Meter "Last Gasp" packet prioritization for dying capacitors.
