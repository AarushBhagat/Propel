import { TicketWorkflowService } from '../../src/services/TicketWorkflowService';
import { PrismaClient } from '@prisma/client';

describe('TicketWorkflowService', () => {
  let ticketWorkflowService: TicketWorkflowService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      ticket: {
        update: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn()
      },
      incident: {
        update: jest.fn(),
        findUnique: jest.fn()
      }
    } as unknown as PrismaClient;
    
    // We mock AI summary service out so we don't hit the API
    ticketWorkflowService = new TicketWorkflowService(mockPrisma);
    ticketWorkflowService['aiSummaryService'] = {
      generateSummary: jest.fn().mockResolvedValue('Mock summary')
    } as any;
  });

  describe('transitionState', () => {
    it('should transition from detected to acknowledged', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: 'I-1', status: 'detected', ticket: { id: 'T-1', status: 'detected' } });
      mockPrisma.incident.update.mockResolvedValue({ id: 'I-1', status: 'acknowledged', ticket: { id: 'T-1', status: 'acknowledged' } });

      const result = await ticketWorkflowService.transitionState('I-1', 'acknowledged');
      
      expect(result.incident.status).toBe('acknowledged');
      expect(mockPrisma.incident.update).toHaveBeenCalledWith({
        where: { id: 'I-1' },
        data: { status: 'acknowledged' },
        include: { ticket: true }
      });
    });

    it('should fail transition from detected directly to resolved', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: 'I-1', status: 'detected', ticket: { id: 'T-1', status: 'detected' } });

      await expect(ticketWorkflowService.transitionState('I-1', 'resolved')).rejects.toThrow('Invalid state transition');
    });

    it('should close the incident and set closedAt when transitioning to closed', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: 'I-1', status: 'verified', ticket: { id: 'T-1', status: 'verified' } });
      mockPrisma.incident.update.mockResolvedValue({ id: 'I-1', status: 'closed', closedAt: new Date(), ticket: { id: 'T-1', status: 'closed' } });

      const result = await ticketWorkflowService.transitionState('I-1', 'closed');
      
      expect(result.incident.status).toBe('closed');
      // Validate incident update was called with closedAt
      expect(mockPrisma.incident.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date)
        })
      }));
    });
  });
});
