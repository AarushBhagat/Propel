import { Request, Response } from 'express';
import { ticketWorkflowService } from '../index';

export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: 'Missing status in request body' });
      return;
    }

    // The controller remains thin; it delegates state transition rules to the TicketWorkflowService
    const result = await ticketWorkflowService.transitionState(id, status);

    res.json({ success: true, data: result });
  } catch (error: any) {
    // Return 400 for validation/transition errors, 500 for others
    const isValidationError = error.message.includes('Invalid state transition') || error.message.includes('not found');
    const statusCode = isValidationError ? 400 : 500;
    
    res.status(statusCode).json({ success: false, message: error.message || 'Failed to update ticket status' });
  }
};
