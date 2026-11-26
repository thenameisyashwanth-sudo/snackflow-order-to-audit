import { SalesOrderStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createSalesOrder, listSalesOrders } from '../services/order.service.js';

const router = Router();

const createOrderSchema = z.object({
  customerId: z.string().min(1),
  clientOrderId: z.string().min(1).optional(),
  notes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  items: z
    .array(
      z.object({
        productSkuId: z.string().min(1),
        quantityPackets: z.number().int().positive(),
        unitPricePaisa: z.number().int().nonnegative().optional(),
      })
    )
    .min(1),
});

const createVisitSchema = z.object({
  customerId: z.string().min(1),
  outcome: z.string().min(1),
  notes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

router.get(
  '/',
  authenticate,
  requireRole('SALESMAN', 'ADMIN', 'OWNER', 'AUDITOR'),
  async (req, res) => {
    const statusParam = req.query.status ? String(req.query.status) : undefined;
    const status =
      statusParam && Object.values(SalesOrderStatus).includes(statusParam as SalesOrderStatus)
        ? (statusParam as SalesOrderStatus)
        : undefined;

    const result = await listSalesOrders({
      role: req.user!.role,
      userId: req.user!.id,
      status,
    });

    res.json(result);
  }
);

router.post(
  '/',
  authenticate,
  requireRole('SALESMAN', 'ADMIN'),
  async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid order payload' });
      return;
    }

    try {
      const { order, deduplicated } = await createSalesOrder({
        ...parsed.data,
        salesmanId: req.user!.id,
      });

      res.status(deduplicated ? 200 : 201).json({ order, deduplicated });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to submit order',
      });
    }
  }
);

router.get(
  '/visits',
  authenticate,
  requireRole('SALESMAN', 'ADMIN', 'OWNER'),
  async (req, res) => {
    const visits = await prisma.salesmanVisit.findMany({
      where: req.user!.role === 'SALESMAN' ? { salesmanId: req.user!.id } : {},
      include: {
        customer: { select: { id: true, name: true, type: true, routeName: true, stateName: true } },
        salesman: { select: { id: true, name: true } },
      },
      orderBy: { visitedAt: 'desc' },
      take: 100,
    });
    res.json({ visits });
  }
);

router.post(
  '/visits',
  authenticate,
  requireRole('SALESMAN'),
  async (req, res) => {
    const parsed = createVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid visit payload' });
      return;
    }

    const visit = await prisma.salesmanVisit.create({
      data: {
        salesmanId: req.user!.id,
        customerId: parsed.data.customerId,
        outcome: parsed.data.outcome,
        notes: parsed.data.notes?.trim() || null,
        latitude: parsed.data.latitude !== undefined ? parsed.data.latitude.toFixed(7) : null,
        longitude: parsed.data.longitude !== undefined ? parsed.data.longitude.toFixed(7) : null,
      },
      include: {
        customer: { select: { id: true, name: true, type: true, routeName: true, stateName: true } },
      },
    });
    res.status(201).json({ visit });
  }
);

export default router;
