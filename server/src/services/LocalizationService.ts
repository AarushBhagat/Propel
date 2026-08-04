import { GraphService } from './GraphService';
import { PoleStateStatus } from './TelemetryProcessingService';

export interface LocalizationResult {
  upstreamPoleId: string;
  downstreamPoleId: string;
  affectedCount: number;
  isEstimatedEdge: boolean;
  unknownPolesEncountered: number;
  traversedPath?: string[];
}

/**
 * Pure stateless algorithmic service for detecting physical power faults.
 * It traverses the tree and perfectly pinpoints the live-to-dark boundary.
 * 
 * Design Decision:
 * This service explicitly does NOT interact with the database, create incidents, 
 * or calculate confidence scores. It relies on the Telemetry processing and 
 * Confidence layers to handle upstream abstractions, maintaining single responsibility.
 */
export class LocalizationService {
  private graphService: GraphService;

  constructor(graphService: GraphService) {
    this.graphService = graphService;
  }

  /**
   * Traverses the graph from the transformer root to detect Live-to-Dark boundaries.
   * Returns an array of probable fault locations.
   */
  public localizeFaults(
    dtId: string, 
    poleStates: Map<string, PoleStateStatus>
  ): LocalizationResult[] {
    const results: LocalizationResult[] = [];
    const rootPoles = this.graphService.getTransformerPoles(dtId);
    
    // Assume the DT pole is the root. It should not have a parent in its own sub-graph.
    const rootPole = rootPoles.find(p => !p.parentPoleId) || rootPoles[0];
    
    if (!rootPole) return results;

    // Tree traversal queue: stores the poleId, path taken, and accumulated unknowns
    const queue: { currentId: string; path: string[]; unknowns: number }[] = [
      { currentId: rootPole.id, path: [rootPole.id], unknowns: 0 }
    ];

    while (queue.length > 0) {
      const { currentId, path, unknowns } = queue.shift()!;
      
      const currentState = poleStates.get(currentId) || 'Unknown';
      let currentUnknowns = unknowns;
      
      if (currentState === 'Unknown') {
        currentUnknowns++;
      }

      // Special case: If the root Transformer is Dark, the fault is at the DT itself.
      if (currentState === 'Dark' && currentId === rootPole.id) {
        results.push({
          upstreamPoleId: currentId,
          downstreamPoleId: currentId,
          affectedCount: this.graphService.getDownstreamPoles(currentId).length + 1,
          isEstimatedEdge: false,
          unknownPolesEncountered: 0,
          traversedPath: path
        });
        
        // Root is dead, no power can flow downstream. Stop traversal.
        return results;
      }

      const children = this.graphService.getChildren(currentId);

      for (const child of children) {
        // Assume Unknown if we have no telemetry data in the cache for this child
        const childState = poleStates.get(child.id) || 'Unknown';
        
        // Live-to-Dark Boundary Detection
        // If parent is Energized (or Unknown acting as a passthrough) and child is Dark
        if ((currentState === 'Energized' || currentState === 'Unknown') && childState === 'Dark') {
          
          // Boundary found. Under normal radial network behavior, downstream poles 
          // are considered part of the same outage cascade. We don't check them.
          results.push({
            upstreamPoleId: currentId,
            downstreamPoleId: child.id,
            affectedCount: this.graphService.getDownstreamPoles(child.id).length + 1,
            isEstimatedEdge: this.graphService.isEdgeEstimated(child.id),
            unknownPolesEncountered: currentUnknowns,
            traversedPath: [...path, child.id]
          });
          
        } else {
          // If the child is not Dark (Energized or Unknown), keep traversing down
          if (childState !== 'Dark') {
             queue.push({
               currentId: child.id,
               path: [...path, child.id],
               unknowns: currentUnknowns
             });
          }
        }
      }
    }

    return results;
  }
}
