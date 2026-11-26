import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createPurchase } from '../services/purchase.service.js';

const router = Router();

const createPurchaseSchema = z.object({
  supplierId: z.string().min(1),
  supplierInvoiceNo: z.string().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        qtyDisplay: z.union([z.number(), z.string()]).optional(),
        qtyBase: z.number().int().positive().optional(),
        ratePerDisplay: z.union([z.number(), z.string()]),
        gstRateBps: z.number().int().nonnegative().optional(),
        batchNo: z.string().optional(),
        expiryDate: z.string().nullable().optional(),
      })
    )
    .min(1),
});

router.get(
  '/',
  authenticate,
  requireRole('PRODUCTION', 'ADMIN', 'AUDITOR', 'OWNER'),
  async (_req, res) => {
    const purchases = await prisma.purchase.findMany({
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                skuCode: true,
                name: true,
                displayUnit: true,
                displayFactor: true,
              },
            },
          },
        },
      },
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ purchases });
  }
);

router.post(
  '/',
  authenticate,
  requireRole('PRODUCTION', 'ADMIN'),
  async (req, res) => {
    const parsed = createPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid purchase input' });
      return;
    }

    try {
      const purchase = await createPurchase({
        ...parsed.data,
        createdById: req.user!.id,
      });
      res.status(201).json({ purchase });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to record purchase',
      });
    }
  }
);

export default router;
