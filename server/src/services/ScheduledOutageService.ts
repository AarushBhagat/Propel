import { PrismaClient } from '@prisma/client';

/**
 * Service responsible for checking if active maintenance windows exist
 * for specific network assets.
 */
export class ScheduledOutageService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Checks if there is an active scheduled outage overlapping with the current time
   * for either the specified Transformer (DT) or its parent Feeder.
   */
  public async hasActiveOutage(feederId: string, dtId: string): Promise<boolean> {
    const now = new Date();

    const activeOutage = await this.prisma.scheduledOutage.findFirst({
      where: {
        AND: [
          { start: { lte: now } },
          { end: { gte: now } },
          {
            OR: [
              { transformerId: dtId },
              { feederId: feederId }
            ]
          }
        ]
      }
    });

    return !!activeOutage;
  }
}
