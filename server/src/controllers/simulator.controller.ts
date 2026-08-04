import { Request, Response } from 'express';
import { simulatorService, prisma, graphService } from '../index';

export const getOptions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, parentId } = req.query;

    if (type === 'feeders') {
      const feeders = await prisma.feeder.findMany({ select: { id: true, name: true } });
      res.json({ success: true, data: feeders });
    } else if (type === 'transformers') {
      const where = parentId ? { feederId: String(parentId) } : {};
      const dts = await prisma.transformer.findMany({ where, select: { id: true } });
      res.json({ success: true, data: dts });
    } else if (type === 'poles') {
      if (!parentId) {
        res.status(400).json({ success: false, message: 'Requires parentId (DT ID)' });
        return;
      }
      // Return poles from in-memory graph
      const poles = graphService.getTransformerPoles(String(parentId)).map(p => ({ id: p.id, deviceId: p.deviceId }));
      res.json({ success: true, data: poles });
    } else {
      res.status(400).json({ success: false, message: 'Invalid type' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch options' });
  }
};

export const getActiveSimulations = (req: Request, res: Response): void => {
  res.json({ success: true, data: simulatorService.getActiveSimulations() });
};

export const injectFault = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, targetId, subTargetId } = req.body;
    let result;

    switch (type) {
      case 'Span Fault':
        if (!targetId) {
           res.status(400).json({ success: false, message: 'Missing targetId (Pole ID)' });
           return;
        }
        result = await simulatorService.injectSpanFault(targetId);
        break;
      case 'DT Fault':
        if (!targetId) {
          res.status(400).json({ success: false, message: 'Missing targetId (Transformer ID)' });
          return;
        }
        result = await simulatorService.injectDtFault(targetId);
        break;
      case 'Feeder Fault':
        if (!targetId) {
          res.status(400).json({ success: false, message: 'Missing targetId (Feeder ID)' });
          return;
        }
        result = await simulatorService.injectFeederFault(targetId);
        break;
      case 'Sensor Failure':
        if (!targetId) {
          res.status(400).json({ success: false, message: 'Missing targetId (Pole ID)' });
          return;
        }
        result = simulatorService.injectSensorFailure(targetId);
        break;
      case 'Scheduled Outage':
        if (!targetId || !subTargetId) {
          res.status(400).json({ success: false, message: 'Missing targetId or target type (DT | Feeder)' });
          return;
        }
        result = await simulatorService.injectScheduledOutage(targetId, subTargetId as 'DT' | 'Feeder');
        break;
      default:
        res.status(400).json({ success: false, message: 'Invalid fault type' });
        return;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Injection failed' });
  }
};

export const restorePower = (req: Request, res: Response): void => {
  try {
    const { simId } = req.body;
    if (!simId) {
      res.status(400).json({ success: false, message: 'Missing simId' });
      return;
    }
    const result = simulatorService.restorePower(simId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Restoration failed' });
  }
};
