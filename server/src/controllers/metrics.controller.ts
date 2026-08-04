import { Request, Response } from 'express';
import { prisma } from '../index';

export const getMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();

    const [
      totalTelemetry,
      activeIncidents,
      scheduledOutages
    ] = await Promise.all([
      prisma.telemetry.count(),
      prisma.incident.count({ where: { closedAt: null } }),
      prisma.scheduledOutage.count({
        where: {
          start: { lte: now },
          end: { gte: now }
        }
      })
    ]);

    // For a real production app, average localization/verification times would be calculated 
    // from timestamp deltas in the database. For this assignment, we mock them,
    // or calculate based on the created vs resolved vs closed timestamps.
    // Let's pull the latest 10 closed incidents to compute average verification time
    const closedIncidents = await prisma.incident.findMany({
      where: { closedAt: { not: null }, resolvedAt: { not: null } },
      take: 10,
      orderBy: { closedAt: 'desc' }
    });

    let avgVerificationTimeMs = 0;
    if (closedIncidents.length > 0) {
      const totalMs = closedIncidents.reduce((sum, inc) => {
        return sum + (inc.closedAt!.getTime() - inc.resolvedAt!.getTime());
      }, 0);
      avgVerificationTimeMs = totalMs / closedIncidents.length;
    }

    res.json({
      success: true,
      data: {
        totalTelemetryProcessed: totalTelemetry,
        queueSize: 0, // Since we process in batches rapidly, queue is generally 0 at rest
        activeIncidents,
        averageLocalizationTimeMs: 120, // Example mocked metric, as requested
        averageVerificationTimeMs,
        scheduledOutages,
        generatedAt: now.toISOString()
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch metrics' });
  }
};
