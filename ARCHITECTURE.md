# Architecture Documentation

This document describes the high-level architecture, module responsibilities, and data flows of PropelAI.

## Overall System Diagram

```mermaid
graph TD
    UI[Frontend: React Dashboard] -->|REST API| API[Backend: Express API]
    API --> DB[(PostgreSQL)]
    
    SIM[Simulator Service] -->|Injects Payload| API
    
    API -->|Payload| TQ[Telemetry Queue]
    TQ -->|Batch Pop| TW[Telemetry Worker]
    TW -->|Event| TPS[Telemetry Processing Service]
    
    TPS -->|Update State| Cache[(State Cache)]
    TPS -->|Trigger| DBounce[Debounce Logic]
    
    DBounce -->|60s expiry| LOC[Localization Service]
    LOC -->|Live-to-Dark Boundary| CONF[Confidence Service]
    CONF -->|Scored Result| INC[Incident Service]
    
    INC -->|Deduplicate / Save| DB
    INC -->|Create| TWS[Ticket Workflow Service]
    TWS -->|Generate| AI[AI Summary Service]
    
    TWS --> DB
```

---

## 1. Simulator Flow

**Responsibility**: Generate synthetic fault and outage events for testing without requiring real hardware.

```mermaid
sequenceDiagram
    participant User
    participant Simulator API
    participant Simulator Service
    participant Telemetry Ingestion
    
    User->>Simulator API: Inject Span Fault (poleId: P-123)
    Simulator API->>Simulator Service: injectSpanFault(P-123)
    Simulator Service->>Graph Service: Find downstream poles
    Graph Service-->>Simulator Service: [P-123, P-124, P-125]
    Simulator Service->>Simulator Service: Generate synthetic "power_lost" payloads
    Simulator Service->>Telemetry Ingestion: Forward Payloads
    Telemetry Ingestion-->>User: Simulation Started
```

---

## 2. Telemetry Flow

**Responsibility**: Ingest, validate, queue, and process massive telemetry bursts efficiently.

```mermaid
sequenceDiagram
    participant Meter
    participant TelemetryIngestion
    participant TelemetryQueue
    participant TelemetryWorker
    participant TelemetryProcessing
    participant PostgreSQL
    
    Meter->>TelemetryIngestion: POST /api/telemetry (power_lost)
    TelemetryIngestion->>TelemetryQueue: enqueue(event)
    TelemetryIngestion-->>Meter: 202 Accepted
    
    loop Every 500ms
        TelemetryWorker->>TelemetryQueue: pop batch (up to 100)
        TelemetryQueue-->>TelemetryWorker: batch[]
        TelemetryWorker->>TelemetryProcessing: processBatch(batch)
        TelemetryProcessing->>TelemetryProcessing: Validate Seq & Deduplicate
        TelemetryProcessing->>TelemetryProcessing: Update In-Memory State Cache
        TelemetryProcessing->>PostgreSQL: createMany(telemetry)
        TelemetryProcessing->>Debounce Logic: Trigger 60s timer for Transformer
    end
```

---

## 3. Localization Flow

**Responsibility**: Analyze the electrical grid graph to pinpoint the exact physical location of a fault.

```mermaid
sequenceDiagram
    participant Debounce
    participant Localization Service
    participant Graph Service
    participant State Cache
    
    Debounce->>Localization Service: execute(transformerId)
    Localization Service->>Graph Service: getPolesForTransformer(transformerId)
    Graph Service-->>Localization Service: [Pole Array]
    
    loop Tree Traversal (BFS/DFS)
        Localization Service->>State Cache: check status(node)
        Localization Service->>State Cache: check status(children)
        alt node is Energized & children are Dark
            Localization Service->>Localization Service: Mark as Live-to-Dark Boundary (Span Fault)
        else all nodes Dark
            Localization Service->>Localization Service: Mark as Transformer Fault
        end
    end
    
    Localization Service-->>Confidence Service: [LocalizationResult]
```

---

## 4. Ticket Workflow

**Responsibility**: Manage the lifecycle of an incident using a Finite State Machine (FSM).

```mermaid
stateDiagram-v2
    [*] --> detected: Incident Created
    detected --> acknowledged: Operator Reviews
    acknowledged --> crew_assigned: Field Crew Dispatched
    crew_assigned --> resolved: Crew Reports Fixed
    resolved --> verified: Telemetry Confirms "Energized"
    verified --> closed: FSM Finalizes
    closed --> [*]
```

**Verification Process**: When telemetry indicates power is restored, the `TelemetryProcessingService` triggers the `WorkflowCoordinator`. If the ticket is manually marked as `resolved` by the crew, the coordinator transitions it to `verified` and `closed`.

---

## 5. AI Summary Flow

**Responsibility**: Translate raw metrics and localization data into human-readable text for operators.

```mermaid
sequenceDiagram
    participant Ticket Workflow
    participant AI Summary Service
    participant OpenAI API
    
    Ticket Workflow->>AI Summary Service: generateSummary(IncidentData)
    
    alt OpenAI Key Configured & Quota Available
        AI Summary Service->>OpenAI API: Send Prompt
        OpenAI API-->>AI Summary Service: Natural Language Summary
    else Key Missing or API Error
        AI Summary Service->>AI Summary Service: Generate Deterministic Template String
    end
    
    AI Summary Service-->>Ticket Workflow: Final String
```

---

## 6. Map Rendering Flow

**Responsibility**: Display grid topology, live status, and incident locations geographically.

```mermaid
sequenceDiagram
    participant Browser
    participant React App
    participant Express API
    participant PostgreSQL
    
    Browser->>React App: Load Dashboard
    React App->>Express API: GET /api/topology
    Express API->>PostgreSQL: Query Feeders, DTs, Poles
    PostgreSQL-->>Express API: JSON Topology
    Express API-->>React App: Topology Data
    
    React App->>React App: Parse coordinates & estimated edges
    React App->>Leaflet: Render Polylines & Markers
    
    loop React Query (Every 10s)
        React App->>Express API: GET /api/incidents
        Express API-->>React App: Active Incidents
        React App->>Leaflet: Highlight affected spans (Red)
    end
```

---

## Service Responsibilities summary

| Module | Core Responsibility |
|---|---|
| **GraphService** | Loads grid data into memory and builds the adjacency list. Performs nearest-neighbor estimations for missing topologies. |
| **TelemetryIngestionService** | Accepts HTTP POST requests and shoves payloads into the non-blocking queue. |
| **TelemetryProcessingService** | Pops batches from the queue, validates sequence numbers, updates `stateCache`, stores raw events in Postgres, and triggers Debouncing. |
| **LocalizationService** | Stateless algorithm that traverses the graph to find the exact point where power stops flowing (Live-to-Dark). |
| **ConfidenceService** | Applies deterministic penalties to localization results based on sensor firmware versions and estimated topology data. |
| **IncidentService** | Groups localization results, prevents duplicate records using memory locks, and inserts new Incidents into the database. |
| **TicketWorkflowService** | Handles the FSM transitions of the Incident ticket and requests AI Summaries. |
| **WorkflowCoordinator** | Central event bus connecting Telemetry (restoration) to the TicketWorkflow for automated closure. |
