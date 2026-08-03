import { PrismaClient, Pole } from '@prisma/client';

/**
 * GraphService is responsible ONLY for managing the electrical network graph in memory.
 * It loads poles from the database and constructs an adjacency list (tree) for O(1) traversal.
 * It does NOT perform fault localization or missing topology estimation.
 */
export class GraphService {
  private prisma: PrismaClient;
  
  // Maps a pole ID to the Pole object for O(1) lookups
  private polesMap: Map<string, Pole> = new Map();
  
  // Adjacency list representation
  // parentPoleId -> array of child pole objects
  private childrenMap: Map<string, Pole[]> = new Map();
  
  // transformerId -> array of all poles under that transformer
  private dtMap: Map<string, Pole[]> = new Map();

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Loads all poles from the database and builds the in-memory graph.
   * This should be called once on server startup.
   */
  public async loadGraph(): Promise<void> {
    // 1. Load all poles from the database
    const allPoles = await this.prisma.pole.findMany();
    
    // Reset state in case this is called again to refresh
    this.polesMap.clear();
    this.childrenMap.clear();
    this.dtMap.clear();

    // 2. First pass: Build O(1) lookup maps and group by Transformer
    for (const pole of allPoles) {
      this.polesMap.set(pole.id, pole);
      
      // Group by DT for quick scope filtering
      if (!this.dtMap.has(pole.dtId)) {
        this.dtMap.set(pole.dtId, []);
      }
      this.dtMap.get(pole.dtId)!.push(pole);
    }

    // 3. Second pass: Build adjacency list using official parent_pole_id relationships
    // Only builds relationships for poles that actually have a parent defined.
    // (Missing topology is handled by another service).
    for (const pole of allPoles) {
      if (pole.parentPoleId) {
        if (!this.childrenMap.has(pole.parentPoleId)) {
          this.childrenMap.set(pole.parentPoleId, []);
        }
        this.childrenMap.get(pole.parentPoleId)!.push(pole);
      }
    }

    console.log(`[GraphService] Loaded ${allPoles.length} poles into memory.`);
  }

  /**
   * Retrieves a pole by its ID.
   */
  public getPole(poleId: string): Pole | undefined {
    return this.polesMap.get(poleId);
  }

  /**
   * Retrieves all poles associated with a specific transformer.
   */
  public getTransformerPoles(dtId: string): Pole[] {
    return this.dtMap.get(dtId) || [];
  }

  /**
   * Gets the immediate parent of a pole, using the in-memory map.
   */
  public getParent(poleId: string): Pole | undefined {
    const pole = this.polesMap.get(poleId);
    if (!pole || !pole.parentPoleId) return undefined;
    return this.polesMap.get(pole.parentPoleId);
  }

  /**
   * Gets all immediate children of a pole.
   */
  public getChildren(poleId: string): Pole[] {
    return this.childrenMap.get(poleId) || [];
  }

  /**
   * Recursively gets all downstream poles (children, grandchildren, etc.).
   * Uses Breadth-First Search (BFS) to traverse the adjacency list.
   */
  public getDownstreamPoles(poleId: string): Pole[] {
    const result: Pole[] = [];
    // Initialize a queue with the immediate children
    const queue: Pole[] = [...this.getChildren(poleId)];
    
    // BFS traversal
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      // Add this child's children to the queue
      const nextChildren = this.getChildren(current.id);
      queue.push(...nextChildren);
    }
    
    return result;
  }
}
