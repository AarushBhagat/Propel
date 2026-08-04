import { Router } from 'express';
import { updateTicketStatus } from '../controllers/ticket.controller';

const router = Router();

router.patch('/:id/status', updateTicketStatus);

export default router;
