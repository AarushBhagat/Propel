import { Pole, Transformer } from '@prisma/client';
import { GraphService } from './GraphService';

export class TopologyService {
  private graphService: GraphService;

  constructor(graphService: GraphService) {
    this.graphService = graphService;
  }

  /**
   * Estimates missing topology for transformers that lack official parent_pole_id relationships.
   * This uses a GPS-Based Nearest-Neighbor approach (internally a greedy minimum spanning tree).
   */
  public estimateMissingTopology(transformer: Transformer, poles: Pole[]): void {
    // 1. Safety check: Official topology always takes precedence.
    // We only estimate if the official parent_pole_id is missing for the majority of poles.
    const missingTopology = poles.filter(p => !p.parentPoleId);
    
    // If there are no missing parent links, nothing to estimate.
    if (missingTopology.length <= 1) {
      return;
    }

    // 2. Identify the Root
    // The root is physically closest to the transformer's own GPS coordinates.
    let root = poles[0];
    let minDtDist = Infinity;
    
    for (const pole of poles) {
      const dist = this.calculateEuclideanDistance(transformer.lat, transformer.lon, pole.lat, pole.lon);
      if (dist < minDtDist) {
        minDtDist = dist;
        root = pole;
      }
    }

    const connected: Set<string> = new Set([root.id]);
    const unconnected: Set<string> = new Set(poles.map(p => p.id));
    unconnected.delete(root.id);

    // 3. Grow the radial tree (Nearest-Neighbor)
    while (unconnected.size > 0) {
      let bestDist = Infinity;
      let bestParent: string | null = null;
      let bestChild: string | null = null;

      // Find the nearest unconnected pole to any already-connected pole
      for (const connectedId of connected) {
        const cPole = this.graphService.getPole(connectedId)!;
        
        for (const unconnectedId of unconnected) {
          const uPole = this.graphService.getPole(unconnectedId)!;
          
          const dist = this.calculateEuclideanDistance(cPole.lat, cPole.lon, uPole.lat, uPole.lon);
          if (dist < bestDist) {
            bestDist = dist;
            bestParent = cPole.id;
            bestChild = uPole.id;
          }
        }
      }

      if (bestParent && bestChild) {
        connected.add(bestChild);
        unconnected.delete(bestChild);
        this.graphService.addEdge(bestParent, bestChild, true);
        
        // Update in memory so LocalizationService knows it has a parent
        const childPole = this.graphService.getPole(bestChild);
        if (childPole) {
          childPole.parentPoleId = bestParent;
        }
      } else {
        // Fallback safety breaker if something goes horribly wrong
        break;
      }
    }
  }

  /**
   * Simple Euclidean distance calculation.
   * Design Decision: We use this instead of Haversine because the generated network
   * covers a very small geographic area where planetary curvature distortion is negligible,
   * keeping the implementation simple and extremely fast.
   */
  private calculateEuclideanDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
  }
}
