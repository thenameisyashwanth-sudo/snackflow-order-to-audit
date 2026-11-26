import { BaseUnit, ItemCategory, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
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

const createSkuSchema = z.object({
  name: z.string().min(2),
  nameTamil: z.string().optional(),
  skuCode: z.string().optional(),
  recipeId: z.string().min(1),
  netWeightG: z.number().int().positive(),
  packetsPerCarton: z.number().int().positive().default(20),
  sellingPricePaisa: z.number().int().nonnegative(),
  gstRateBps: z.number().int().nonnegative().default(500),
  hsnCode: z.string().min(4).default('19059090'),
  shelfLifeDays: z.number().int().positive().default(90),
  pouchPackagingItemId: z.string().optional(),
  cartonPackagingItemId: z.string().optional(),
});

router.post(
  '/skus',
  authenticate,
  requireRole('ADMIN', 'OWNER'),
  async (req, res) => {
    const parsed = createSkuSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid SKU payload' });
      return;
    }

    const input = parsed.data;
    const normalizedCode =
      input.skuCode?.trim().toUpperCase() ||
      `FG-${input.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`;

    try {
      const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const recipe = await tx.recipe.findUnique({ where: { id: input.recipeId } });
        if (!recipe) {
          throw new Error('Selected Recipe not found.');
        }

        const existingSku = await tx.productSku.findUnique({
          where: { skuCode: normalizedCode },
        });
        if (existingSku) {
          throw new Error(`SKU code "${normalizedCode}" already exists.`);
        }

        const fgItem = await tx.inventoryItem.create({
          data: {
            skuCode: normalizedCode,
            name: input.name.trim(),
            nameTamil: input.nameTamil?.trim() || null,
            category: ItemCategory.FINISHED_GOOD,
            baseUnit: BaseUnit.PIECE,
            displayUnit: 'pkt',
            displayFactor: 1,
            reorderLevelBase: 20,
            currentWeightedRateDecimal: '0.0000',
            hsnCode: input.hsnCode.trim(),
            gstRateBps: input.gstRateBps,
          },
        });

        const productSku = await tx.productSku.create({
          data: {
            skuCode: normalizedCode,
            name: input.name.trim(),
            nameTamil: input.nameTamil?.trim() || null,
            recipeId: recipe.id,
            inventoryItemId: fgItem.id,
            netWeightG: input.netWeightG,
            packetsPerCarton: input.packetsPerCarton,
            sellingPricePaisa: input.sellingPricePaisa,
            gstRateBps: input.gstRateBps,
            hsnCode: input.hsnCode.trim(),
            shelfLifeDays: input.shelfLifeDays,
          },
        });

        // Attach primary pouch packaging BOM
        let pouchId = input.pouchPackagingItemId?.trim();
        if (!pouchId) {
          const pouchCode = `PKG-POUCH-${input.netWeightG}G`;
          const existingPouch = await tx.inventoryItem.findUnique({
            where: { skuCode: pouchCode },
          });
          if (existingPouch) {
            pouchId = existingPouch.id;
          } else {
            const newPouch = await tx.inventoryItem.create({
              data: {
                skuCode: pouchCode,
                name: `${input.netWeightG} g pouch`,
                nameTamil: `${input.netWeightG} கி பை`,
                category: ItemCategory.PACKAGING,
                baseUnit: BaseUnit.PIECE,
                displayUnit: 'pcs',
                displayFactor: 1,
                reorderLevelBase: 100,
                currentWeightedRateDecimal: '3.5000',
                hsnCode: '39232990',
                gstRateBps: 1800,
              },
            });
            pouchId = newPouch.id;
          }
        }

        await tx.skuPackagingBom.create({
          data: {
            productSkuId: productSku.id,
            packagingItemId: pouchId,
            packagingRole: 'PRIMARY_POUCH',
            qtyBase: 1,
            perPackets: 1,
          },
        });

        // Attach carton packaging BOM if selected
        if (input.cartonPackagingItemId?.trim()) {
          await tx.skuPackagingBom.create({
            data: {
              productSkuId: productSku.id,
              packagingItemId: input.cartonPackagingItemId.trim(),
              packagingRole: 'CARTON',
              qtyBase: 1,
              perPackets: input.packetsPerCarton,
            },
          });
        }

        const fullSku = await tx.productSku.findUniqueOrThrow({
          where: { id: productSku.id },
          include: {
            recipe: { include: { ingredients: { include: { inventoryItem: true } } } },
            packagingBom: { include: { packagingItem: true } },
            inventoryItem: true,
          },
        });

        const expectedPacketsPerBatch = calculateExpectedPackets(
          recipe.batchYieldG,
          productSku.netWeightG,
          1
        );

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'CREATE_PRODUCT_SKU',
            entityType: 'ProductSku',
            entityId: productSku.id,
            afterJson: {
              skuCode: productSku.skuCode,
              name: productSku.name,
              recipeName: recipe.name,
              netWeightG: productSku.netWeightG,
              expectedPacketsPerBatch,
              packetsPerCarton: productSku.packetsPerCarton,
              sellingPricePaisa: productSku.sellingPricePaisa,
            },
          },
        });

        return {
          ...fullSku,
          expectedPacketsPerBatch,
          availablePackets: 0,
        };
      });

      res.status(201).json({ productSku: created });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to create product SKU',
      });
    }
  }
);

export default router;
