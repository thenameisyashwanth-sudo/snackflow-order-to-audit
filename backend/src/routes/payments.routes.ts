import { PaymentMethod } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  getPaymentsAndReceivables,
  recordCustomerPayment,
} from '../services/payment.service.js';

const router = Router();

const createPaymentSchema = z.object({
  customerId: z.string().min(1),
  invoiceId: z.string().min(1).optional(),
  amountPaisa: z.number().int().positive(),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.UPI),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  receivedAt: z.string().optional(),
});

router.get(
  '/',
  authenticate,
  requireRole('ADMIN', 'OWNER', 'AUDITOR'),
  async (_req, res) => {
    const data = await getPaymentsAndReceivables();
    res.json(data);
  }
);

router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment payload' });
      return;
    }

    try {
      const payment = await recordCustomerPayment({
        ...parsed.data,
        recordedById: req.user!.id,
      });
      res.status(201).json({ payment });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to record payment',
      });
    }
  }
);

export default router;
