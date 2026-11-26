import { SalesOrderStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createInvoiceFromOrder, verifySalesOrder } from '../services/invoice.service.js';
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

const verifyOrderSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'UPDATE_ONLY']),
  rejectionReason: z.string().optional(),
  items: z
    .array(
      z.object({
        productSkuId: z.string().min(1),
        qtyPackets: z.number().int().positive(),
        unitPricePaisa: z.number().int().nonnegative(),
      })
    )
    .optional(),
});

router.patch(
  '/:id/verify',
  authenticate,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed = verifyOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid verification input' });
      return;
    }

    try {
      const order = await verifySalesOrder({
        orderId: String(req.params.id),
        action: parsed.data.action,
        rejectionReason: parsed.data.rejectionReason,
        items: parsed.data.items,
        userId: req.user!.id,
      });
      res.json({ order });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to verify order',
      });
    }
  }
);

const createInvoiceSchema = z.object({
  autoApprove: z.boolean().optional(),
});

router.post(
  '/:id/invoice',
  authenticate,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed = createInvoiceSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid invoice request' });
      return;
    }

    try {
      const invoice = await createInvoiceFromOrder({
        orderId: String(req.params.id),
        userId: req.user!.id,
        autoApprove: parsed.data.autoApprove ?? true,
      });
      res.status(201).json({ invoice });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to raise GST invoice',
      });
    }
  }
);

export default router;
