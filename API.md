# API Documentation

This document describes the REST endpoints available in the PropelAI backend.

All endpoints are prefixed with `/api` and return JSON responses.

---

## 1. Telemetry API

### Ingest Telemetry
Ingests massive bursts of smart meter telemetry (heartbeats, power loss, power restored).

**Purpose**: Allows edge devices to report their real-time grid status.
**Method**: `POST`
**URL**: `/api/telemetry`

**Request Body**:
```json
{
  "device_id": "D-1234",
  "event": "power_lost",
  "ts": "2024-05-20T10:00:00Z",
  "seq": 105,
  "energized": false,
  "battery_mv": 3600,
  "rssi": -65,
  "fw": "2.1"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Queued"
}
```

**Error Responses**:
- `400 Bad Request` if required fields (`device_id`, `event`, `ts`, `seq`, `energized`) are missing.

---

## 2. Incident API

### Get Active Incidents
Retrieves a paginated list of active grid incidents.

**Purpose**: Populates the control room dashboard with ongoing faults.
**Method**: `GET`
**URL**: `/api/incidents?page=1&limit=20`

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "id": "inc_abc123",
        "createdAt": "2024-05-20T10:05:00Z",
        "status": "detected",
        "inferredSpan": "P-123 -> P-124",
        "confidence": 95,
        "downstreamImpact": 12,
        "overlapOutage": false,
        "ticket": {
          "id": "tkt_abc123",
          "summary": "AI Summary...",
          "status": "detected"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

### Get Incident Details
Retrieves detailed information about a specific incident, including all affected poles.

**Purpose**: Drill-down view for operators.
**Method**: `GET`
**URL**: `/api/incidents/:id`

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "id": "inc_abc123",
    "incidentPoles": [
      { "poleId": "P-123", "pole": { "lat": 15.3, "lon": 75.7 } }
    ]
  }
}
```

---

## 3. Ticket API

### Update Ticket Status
Transitions the FSM state of a ticket.

**Purpose**: Used by operators to acknowledge faults or dispatch crews.
**Method**: `PATCH`
**URL**: `/api/tickets/:id/status`

**Request Body**:
```json
{
  "status": "crew_assigned"
}
```
*Valid states: `detected`, `acknowledged`, `crew_assigned`, `resolved`, `verified`, `closed`.*

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tkt_abc123",
      "status": "crew_assigned"
    },
    "transition": "detected -> crew_assigned"
  }
}
```

**Error Responses**:
- `400 Bad Request` if the transition is invalid (e.g., jumping from `detected` straight to `closed`).

---

## 4. Simulator API

### Inject Fault
Triggers synthetic faults in the network for testing localization algorithms.

**Purpose**: Development and demonstration tooling.
**Method**: `POST`
**URL**: `/api/simulator/fault`

**Request Body**:
```json
{
  "type": "span",
  "targetId": "P-456"
}
```
*Valid types: `span`, `dt`, `feeder`, `sensor`.*

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "simId": "uuid-123",
    "type": "Span Fault",
    "affectedPoles": 15,
    "messagesGenerated": 15
  }
}
```

---

## 5. Scheduled Outage API

### Create Scheduled Outage
Creates a planned maintenance window that suppresses automated alerts.

**Purpose**: Prevent false-positive incidents during planned grid maintenance.
**Method**: `POST`
**URL**: `/api/outages`

**Request Body**:
```json
{
  "type": "DT",
  "targetId": "DT-88",
  "startTime": "2024-05-25T08:00:00Z",
  "durationMinutes": 120
}
```

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "id": "outage_uuid",
    "targetId": "DT-88",
    "start": "2024-05-25T08:00:00Z",
    "end": "2024-05-25T10:00:00Z"
  }
}
```

### Get Active Outages
Retrieves all currently active scheduled outages.

**Method**: `GET`
**URL**: `/api/outages/active`

---

## 6. Metrics API

### Get Dashboard Metrics
Aggregates key control room metrics.

**Purpose**: High-level statistical overview for the UI Header.
**Method**: `GET`
**URL**: `/api/metrics`

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "activeIncidents": 2,
    "gridStability": 99.8,
    "activeCrews": 1,
    "lastTelemetry": "2024-05-20T10:05:00Z"
  }
}
```
