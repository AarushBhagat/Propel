import { PrismaClient, Pole } from '@prisma/client';

/**
 * GraphService is responsible ONLY for managing the electrical network graph in memory.
 * It loads poles from the database and constructs an adjacency list (tree) for O(1) traversal.
 * It does NOT perform fault localization.
 */
export class GraphService {
  private prisma: PrismaClient;
  
  // Maps a pole ID to the Pole object for O(1) lookups
  private polesMap: Map<string, Pole> = new Map();
  
  // Adjacency list representation: parentPoleId -> array of child pole objects
  private childrenMap: Map<string, Pole[]> = new Map();
  
  // transformerId -> array of all poles under that transformer
  private dtMap: Map<string, Pole[]> = new Map();

  // Edge metadata: childPoleId -> metadata. 
  // In a radial tree, a child has exactly one parent, so keying by childId is safe and efficient.
  private edgeMetadata: Map<string, { isEstimated: boolean }> = new Map();

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Loads all poles from the database and builds the in-memory graph using official topology.
   */
  public async loadGraph(): Promise<void> {
    const allPoles = await this.prisma.pole.findMany();
    
    this.polesMap.clear();
    this.childrenMap.clear();
    this.dtMap.clear();
    this.edgeMetadata.clear();

    // First pass: Build O(1) lookup maps and group by Transformer
    for (const pole of allPoles) {
      this.polesMap.set(pole.id, pole);
      
      if (!this.dtMap.has(pole.dtId)) {
        this.dtMap.set(pole.dtId, []);
      }
      this.dtMap.get(pole.dtId)!.push(pole);
    }

    // Second pass: Build adjacency list using official relationships ONLY
    for (const pole of allPoles) {
      if (pole.parentPoleId) {
        this.addEdge(pole.parentPoleId, pole.id, false);
      }
    }

    console.log(`[GraphService] Loaded ${allPoles.length} poles into memory.`);
  }

  /**
   * Adds a directional edge from parent to child in the graph.
   * Can be used to inject official topology or estimated topology.
   */
  public addEdge(parentId: string, childId: string, isEstimated: boolean): void {
    const parent = this.polesMap.get(parentId);
    const child = this.polesMap.get(childId);
    
    if (!parent || !child) {
      console.warn(`[GraphService] Cannot add edge ${parentId} -> ${childId}: missing nodes.`);
      return;
    }

    if (!this.childrenMap.has(parentId)) {
      this.childrenMap.set(parentId, []);
    }
    
    // Prevent duplicate edges if addEdge is called multiple times
    const children = this.childrenMap.get(parentId)!;
    if (!children.find(p => p.id === childId)) {
      children.push(child);
    }

    // Store metadata
    this.edgeMetadata.set(childId, { isEstimated });
  }

  /**
   * Checks if the relationship to a child pole was estimated (true) or official (false).
   */
  public isEdgeEstimated(childPoleId: string): boolean {
    return this.edgeMetadata.get(childPoleId)?.isEstimated || false;
  }

  public getPole(poleId: string): Pole | undefined {
    return this.polesMap.get(poleId);
  }

  public getTransformerPoles(dtId: string): Pole[] {
    return this.dtMap.get(dtId) || [];
  }

  public getParent(poleId: string): Pole | undefined {
    // We can infer parent from the DB property, but if an estimated edge was added,
    // we should really search the childrenMap or track parent mapping directly.
    // For simplicity, we just look up who contains this child in childrenMap.
    for (const [parentId, children] of this.childrenMap.entries()) {
      if (children.find(c => c.id === poleId)) {
        return this.polesMap.get(parentId);
      }
    }
    return undefined;
  }

  public getChildren(poleId: string): Pole[] {
    return this.childrenMap.get(poleId) || [];
  }

  public getDownstreamPoles(poleId: string): Pole[] {
    const result: Pole[] = [];
    const queue: Pole[] = [...this.getChildren(poleId)];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      queue.push(...this.getChildren(current.id));
    }
    
    return result;
  }
}
