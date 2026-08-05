import { Request, Response } from 'express';
import { prisma } from '../index';

export const getActiveOutages = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();

    const outages = await prisma.scheduledOutage.findMany({
      where: {
        AND: [
          { start: { lte: now } },
          { end: { gte: now } }
        ]
      },
      include: {
        feeder: {
          select: { id: true }
        },
        transformer: {
          select: { id: true }
        }
      }
    });

    res.json({ success: true, data: outages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch scheduled outages' });
  }
};
