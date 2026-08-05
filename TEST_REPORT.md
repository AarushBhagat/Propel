# End-to-End Verification Test Report

This document records the results of the final end-to-end integration and verification testing of the PropelAI pipeline.

## Scenario 1: Span Fault
**Goal**: Inject a span fault and verify telemetry, worker processing, localization, confidence scoring, incident creation, ticket creation, and dashboard updates.
**Expected Behaviour**: A single telemetry burst creates exactly one incident pinpointed to the specific broken span. The UI map highlights the broken edge in red.
**Status**: ✅ Passed
**Bug Discovered**: Topology estimation was initially skipped, causing the live-to-dark algorithm to fail for unmapped poles.
**Fix Applied**: Integrated the `TopologyService` at startup to map physical locations to logical edges using nearest-neighbor estimation.

## Scenario 2: Transformer Fault
**Goal**: Inject DT fault. Verify downstream poles lose power, incident grouping, affected count, and confidence explanation.
**Expected Behaviour**: Entire transformer footprint goes dark. Localization correctly identifies the boundary at the transformer itself, grouping all downstream poles into a single incident.
**Status**: ✅ Passed
**Bug Discovered**: Race condition where concurrent telemetry bursts from a 150+ pole DT created redundant incidents in the database.
**Fix Applied**: Implemented in-memory promise locks (`inFlightCreations`) in `IncidentService` and `TicketWorkflowService` to deduplicate concurrent DB writes.

## Scenario 3: Feeder Fault
**Goal**: Inject feeder fault. Verify multiple transformers affected, queue handles burst, UI remains responsive.
**Expected Behaviour**: Thousands of poles lose power. The queue gracefully batches the load, creating one incident per affected downstream transformer.
**Status**: ✅ Passed
**Note**: Generated 698 concurrent telemetry events. The queue and worker successfully batched the events without overwhelming the Node.js event loop, resulting in exactly 4 DT-level incident tickets as expected.

## Scenario 4: Sensor Failure
**Goal**: Simulate sensor failure. Verify pole enters Unknown state, localization handles it, confidence reduced, no false incident.
**Expected Behaviour**: A missing heartbeat does not immediately trigger a fault incident, avoiding false truck rolls.
**Status**: ✅ Passed
**Note**: The system properly relies on a 16-minute heartbeat timeout to mark standard poles as 'Dark', and handles unstable Firmware 1.2 poles separately by applying a 10-point confidence penalty if localization relies on them.

## Scenario 5: Scheduled Outage
**Goal**: Simulate scheduled maintenance. Verify telemetry dropped/tagged, no incident created or incident flagged as planned, metrics accurate.
**Expected Behaviour**: Faults occurring within the planned geographic footprint and time window are flagged to prevent operator alarm.
**Status**: ✅ Passed
**Bug Discovered**: Missing UUID generation for scheduled outages caused database insert failures.
**Fix Applied**: Integrated `crypto.randomUUID()` in `SimulatorService.ts`. Scheduled outages now correctly flag overlapping incidents (`overlapOutage: true`).

## Scenario 6: Restore Power
**Goal**: Restore simulated fault. Verify telemetry processed, pole state restored, verification succeeds, ticket automatically closes.
**Expected Behaviour**: When a crew resolves a ticket, the system waits for "power restored" telemetry before closing it.
**Status**: ✅ Passed
**Note**: The `WorkflowCoordinator` successfully transitions tickets to `verified` and `closed` the moment the required downstream telemetry packets arrive in the queue.

## Scenario 7: Duplicate Telemetry
**Goal**: Send duplicate packets. Verify duplicate discarded, no duplicate incidents, queue remains healthy.
**Expected Behaviour**: The exact same telemetry ping sent twice is ignored.
**Status**: ✅ Passed
**Note**: The `device_id` + `seq` tuple tracked in `stateCache` immediately discards duplicate requests without touching the database.

## Scenario 8: Stale Telemetry
**Goal**: Send lower sequence numbers. Verify stale packets ignored.
**Expected Behaviour**: Out-of-order delayed packets arriving late do not revert the state of a pole.
**Status**: ✅ Passed
**Note**: Telemetry with a `seq` lower than the current `lastSeq` in the cache is correctly ignored by `TelemetryProcessingService`.

## Scenario 9: AI Summary
**Goal**: Verify deterministic summary generated (with and without OPENAI_API_KEY).
**Expected Behaviour**: Seamless generation of situation reports.
**Status**: ✅ Passed
**Note**: Tested the OpenAI API limits. When a `429 Insufficient Quota` error was triggered, the system correctly caught the error and automatically fell back to the deterministic template generation without crashing the ticket workflow.

## Scenario 10: Metrics
**Goal**: Verify metrics correctly update on the dashboard.
**Expected Behaviour**: Active incidents, active crews, and grid stability percentages reflect real-time backend state.
**Status**: ✅ Passed
**Note**: The frontend React-Query loop perfectly polls the `/api/metrics` endpoint, dynamically updating the green/orange/red status of the grid stability indicator.
