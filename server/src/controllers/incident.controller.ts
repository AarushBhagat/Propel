import { Request, Response } from 'express';
import { prisma } from '../index';

export const getIncidents = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where: { closedAt: null }, // Active incidents
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: true
        }
      }),
      prisma.incident.count({ where: { closedAt: null } })
    ]);

    res.json({
      success: true,
      data: {
        incidents,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch incidents' });
  }
};

export const getIncidentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        ticket: true,
        incidentPoles: {
          include: {
            pole: true
          }
        }
      }
    });

    if (!incident) {
      res.status(404).json({ success: false, message: 'Incident not found' });
      return;
    }

    res.json({ success: true, data: incident });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch incident' });
  }
};
