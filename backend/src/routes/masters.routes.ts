import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getAllInventoryBalances } from '../services/inventory.service.js';
import { calculateExpectedPackets } from '../utils/units.js';

const router = Router();

router.get('/overview', authenticate, async (_req, res) => {
  const [balances, suppliers, customers, recipes, productSkus] = await Promise.all([
    getAllInventoryBalances(prisma),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.recipe.findMany({
      where: { isActive: true },
      include: {
        ingredients: {
          include: { inventoryItem: true },
          orderBy: { sequence: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.productSku.findMany({
      where: { isActive: true },
      include: {
        recipe: {
          include: {
            ingredients: {
              include: { inventoryItem: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
        packagingBom: {
          include: { packagingItem: true },
        },
        inventoryItem: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const balanceMap = new Map(balances.map((b) => [b.inventoryItemId, b]));

  const enrichedSkus = productSkus.map((sku) => ({
    ...sku,
    expectedPacketsPerBatch: calculateExpectedPackets(
      sku.recipe.batchYieldG,
      sku.netWeightG,
      1
    ),
    availablePackets: balanceMap.get(sku.inventoryItemId)?.closingQtyBase ?? 0,
  }));

  res.json({
    inventoryItems: balances,
    suppliers,
    customers,
    recipes,
    productSkus: enrichedSkus,
  });
});

export default router;
