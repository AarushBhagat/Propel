# Architectural Decisions Log

This document tracks the important architectural and technical decisions made during the development of PropelAI, providing the rationale, alternatives considered, and trade-offs.

## Backend
**Decision**: Node.js + Express, TypeScript, PostgreSQL, Prisma ORM
* **Why it was chosen**: Node.js offers an asynchronous, event-driven runtime ideal for high I/O telemetry processing. TypeScript provides strict typing which prevents runtime mapping errors. PostgreSQL ensures relational consistency for ticket tracking, and Prisma provides a highly productive, type-safe query builder.
* **Alternatives considered**: Python (Django/FastAPI) was considered but lacked the non-blocking V8 efficiency for managing concurrent telemetry floods without excessive multi-threading overhead. Go was considered for performance but rejected due to the rapid prototyping speed of the Node/TypeScript ecosystem.
* **Trade-offs**: Node.js runs on a single thread, meaning heavy CPU-bound graph traversal could potentially block the event loop under extreme scale compared to Go. 

## Queue
**Decision**: In-memory Queue
* **Why it was chosen**: Simple, zero-configuration architecture. It allows rapid batching of high-frequency telemetry events directly within the Node process without external dependencies, making local development and deployment extremely simple.
* **Alternatives considered**: Redis (BullMQ), Apache Kafka, RabbitMQ.
* **Trade-offs**: If the server crashes, unprocessed telemetry in the memory queue is permanently lost. An external message broker like Kafka would provide persistence and horizontal scaling but was rejected to avoid infrastructure complexity during the MVP phase.

## Graph
**Decision**: Adjacency List representing a Rooted Tree
* **Why it was chosen**: Power grids function as radial networks (trees) where power flows unidirectionally from a Feeder -> Transformer -> Poles. An adjacency list is the most memory-efficient and traversal-friendly data structure for this physical reality.
* **Alternatives considered**: Adjacency Matrix, Relational Database recursive queries (CTE).
* **Trade-offs**: While loading the entire adjacency list into memory is blazingly fast for graph algorithms, it consumes significant RAM. For a massive state-wide grid, this would need to be sharded or migrated to a specialized graph database (e.g., Neo4j).

## Topology
**Decision**: Official topology priority with GPS-based Nearest-Neighbor estimation
* **Why it was chosen**: Utilities often have incomplete GIS (Geographic Information System) data. If a pole lacks an official upstream connection, we dynamically estimate it by connecting it to the nearest physical pole using Euclidean distance.
* **Alternatives considered**: Machine learning models for topology inference.
* **Trade-offs**: Nearest-neighbor estimation guarantees the graph remains connected (allowing the localization algorithm to run), but physical wiring doesn't always follow a straight line. We track these synthetic connections via the `isEstimatedEdge` flag to penalize incident confidence scoring.

## Telemetry
**Decision**: Sequential processing, deduplication using `device_id` + `seq`, and 60s Debounce
* **Why it was chosen**: Smart meters may send duplicate alerts or slightly delayed messages during an outage. Processing sequential heartbeats updates the `stateCache`. The 60-second debounce timer ensures the system waits for the full "storm" of alerts from a broken line to arrive before triggering localization, preventing hundreds of fragmented tickets for a single fault.
* **Alternatives considered**: Immediate event-driven localization on every ping.
* **Trade-offs**: The 60-second debounce introduces an artificial 1-minute delay before an operator sees the ticket, prioritizing accuracy over absolute real-time speed.

## Localization
**Decision**: Live-to-Dark Boundary Algorithm
* **Why it was chosen**: Faults physically break the line, causing all downstream poles to lose power while upstream poles remain energized. By traversing the radial graph from the transformer downward, the exact edge where a node is "Energized" but its child is "Dark" definitively pinpoints the broken span.
* **Alternatives considered**: AI/ML Pattern matching.
* **Trade-offs**: This algorithm is highly accurate and purely deterministic, but requires highly accurate graph topology and real-time state. 

## Confidence
**Decision**: Deterministic Scoring & Separate Confidence Service
* **Why it was chosen**: Keeps the localization service mathematically pure. The Confidence Service separately evaluates the localization output against real-world imperfections (e.g., estimated edges, unstable firmware 1.2 sensors) and assigns a deterministic penalty.
* **Alternatives considered**: Integrating confidence logic directly into the localization algorithm.
* **Trade-offs**: Deterministic scoring is completely transparent and explainable to human operators, unlike a "black-box" machine learning confidence model, though it requires manual tuning of the penalty weights.

## Incident
**Decision**: Grouping strategy and duplicate prevention via Promise locks
* **Why it was chosen**: Prevents race conditions during massive telemetry bursts by tracking `inFlightCreations` in memory. If two parallel debounce timers attempt to create tickets for the exact same span simultaneously, one waits for the other's Promise to resolve, returning the deduplicated incident.
* **Alternatives considered**: Database-level unique constraints.
* **Trade-offs**: In-memory locks work perfectly for a monolithic server but will fail in a distributed multi-node environment, which would require distributed locking (e.g., Redis Redlock).

## Ticket Workflow
**Decision**: Finite State Machine (FSM) & Telemetry Verification
* **Why it was chosen**: Enforces a strict control room protocol (`detected` -> `acknowledged` -> `crew_assigned` -> `resolved`). Once crews mark an incident as `resolved`, the system waits for telemetry to confirm power restoration before moving it to `verified` and `closed`.
* **Alternatives considered**: Manual closing of tickets by operators.
* **Trade-offs**: Prevents operators from prematurely closing tickets before the grid is physically energized, but relies entirely on the reliability of the smart meters to send the "power restored" ping.

## AI
**Decision**: Deterministic rule-based summary with OpenAI enhancement as an optional layer
* **Why it was chosen**: Control rooms require 100% uptime and deterministic reliability. The AI acts only as a translation layer, turning hard metrics into readable summaries. Crucially, the AI *never* makes operational routing decisions. If the OpenAI API fails, the system seamlessly falls back to the deterministic template.
* **Alternatives considered**: Using LLMs to perform the fault localization.
* **Trade-offs**: LLMs hallucinate, which is unacceptable for grid operations. Keeping the AI strictly confined to a "Summary generation" role ensures system safety.

## Frontend
**Decision**: React, Tailwind CSS, Leaflet, Karnataka Localization
* **Why it was chosen**: React provides a reactive component model ideal for live dashboards. Tailwind allows rapid, utility-first UI styling to build a professional dark-mode control room aesthetic without writing messy CSS files. Leaflet provides lightweight, performant map rendering centered natively on Karnataka.
* **Alternatives considered**: Mapbox GL JS (rejected to avoid API keys), Material UI (rejected for being too bulky).
* **Trade-offs**: React uses client-side rendering which is sufficient for internal dashboards, but does not offer the SEO benefits of Next.js server-side rendering (which is unnecessary for a private control room).
