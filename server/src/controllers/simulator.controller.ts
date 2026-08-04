import { Request, Response } from 'express';
import { simulatorService, prisma, graphService } from '../index';

export const getOptions = async (req: Request, res: Response) => {
  try {
    const { type, parentId } = req.query;

    if (type === 'feeders') {
      const feeders = await prisma.feeder.findMany({ select: { id: true, name: true } });
      res.json(feeders);
    } else if (type === 'transformers') {
      const where = parentId ? { feederId: String(parentId) } : {};
      const dts = await prisma.transformer.findMany({ where, select: { id: true } });
      res.json(dts);
    } else if (type === 'poles') {
      if (!parentId) return res.status(400).json({ error: 'Requires parentId (DT ID)' });
      // Return poles from in-memory graph
      const poles = graphService.getTransformerPoles(String(parentId)).map(p => ({ id: p.id, deviceId: p.deviceId }));
      res.json(poles);
    } else {
      res.status(400).json({ error: 'Invalid type' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch options' });
  }
};

export const getActiveSimulations = (req: Request, res: Response) => {
  res.json(simulatorService.getActiveSimulations());
};

export const injectFault = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, targetId, subTargetId } = req.body;
    let result;

    switch (type) {
      case 'Span Fault':
        if (!targetId) {
           res.status(400).json({ error: 'Missing targetId (Pole ID)' });
           return;
        }
        result = await simulatorService.injectSpanFault(targetId);
        break;
      case 'DT Fault':
        if (!targetId) {
          res.status(400).json({ error: 'Missing targetId (Transformer ID)' });
          return;
        }
        result = await simulatorService.injectDtFault(targetId);
        break;
      case 'Feeder Fault':
        if (!targetId) {
          res.status(400).json({ error: 'Missing targetId (Feeder ID)' });
          return;
        }
        result = await simulatorService.injectFeederFault(targetId);
        break;
      case 'Sensor Failure':
        if (!targetId) {
          res.status(400).json({ error: 'Missing targetId (Pole ID)' });
          return;
        }
        result = simulatorService.injectSensorFailure(targetId);
        break;
      case 'Scheduled Outage':
        if (!targetId || !subTargetId) {
          res.status(400).json({ error: 'Missing targetId or target type (DT | Feeder)' });
          return;
        }
        result = await simulatorService.injectScheduledOutage(targetId, subTargetId as 'DT' | 'Feeder');
        break;
      default:
        res.status(400).json({ error: 'Invalid fault type' });
        return;
    }

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const restorePower = (req: Request, res: Response): void => {
  try {
    const { simId } = req.body;
    if (!simId) {
      res.status(400).json({ error: 'Missing simId' });
      return;
    }
    const result = simulatorService.restorePower(simId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
