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

    const [
      recentFault,
      recentTicket,
      recentVerified,
      recentClosed
    ] = await Promise.all([
      prisma.incident.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.incident.findFirst({ where: { status: { in: ['verified', 'closed'] } }, orderBy: { closedAt: 'desc' } }),
      prisma.incident.findFirst({ where: { status: 'closed' }, orderBy: { closedAt: 'desc' } })
    ]);

    res.json({
      success: true,
      data: {
        totalTelemetryProcessed: totalTelemetry,
        queueSize: 0,
        activeIncidents,
        averageLocalizationTimeMs: 120,
        averageVerificationTimeMs,
        scheduledOutages,
        recentActivity: {
          faultLocalized: recentFault ? { id: recentFault.id, timestamp: recentFault.createdAt } : null,
          ticketCreated: recentTicket ? { id: recentTicket.id, timestamp: recentTicket.createdAt } : null,
          ticketVerified: recentVerified && recentVerified.closedAt ? { id: recentVerified.id, timestamp: recentVerified.closedAt } : null,
          ticketClosed: recentClosed && recentClosed.closedAt ? { id: recentClosed.id, timestamp: recentClosed.closedAt } : null
        },
        generatedAt: now.toISOString()
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch metrics' });
  }
};
