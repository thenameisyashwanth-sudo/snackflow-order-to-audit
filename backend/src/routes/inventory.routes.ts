import { ItemCategory, MovementType } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getAllInventoryBalances } from '../services/inventory.service.js';

const router = Router();

router.get(
  '/balances',
  authenticate,
  requireRole('ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'),
  async (req, res) => {
    const categoryParam = req.query.category as string | undefined;
    const category =
      categoryParam && Object.values(ItemCategory).includes(categoryParam as ItemCategory)
        ? (categoryParam as ItemCategory)
        : undefined;

    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const balances = await getAllInventoryBalances(prisma, { category, from, to });
    res.json({ balances });
  }
);

router.get(
  '/ledger',
  authenticate,
  requireRole('ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'),
  async (req, res) => {
    const inventoryItemId = req.query.inventoryItemId
      ? String(req.query.inventoryItemId)
      : undefined;
    const movementTypeParam = req.query.movementType
      ? String(req.query.movementType)
      : undefined;
    const categoryParam = req.query.category ? String(req.query.category) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const entries = await prisma.stockLedger.findMany({
      where: {
        ...(inventoryItemId ? { inventoryItemId } : {}),
        ...(movementTypeParam &&
        Object.values(MovementType).includes(movementTypeParam as MovementType)
          ? { movementType: movementTypeParam as MovementType }
          : {}),
        ...(categoryParam &&
        Object.values(ItemCategory).includes(categoryParam as ItemCategory)
          ? { inventoryItem: { category: categoryParam as ItemCategory } }
          : {}),
        ...((from || to)
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            skuCode: true,
            name: true,
            category: true,
            displayUnit: true,
            displayFactor: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });

    res.json({ entries });
  }
);

export default router;
