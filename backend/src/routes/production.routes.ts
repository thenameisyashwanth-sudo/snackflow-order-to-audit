import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  buildCostBreakdown,
  computeRunFifoMaterialCost,
  createProductionRun,
  updateProductionRunOverheads,
} from '../services/production.service.js';

const router = Router();

const createRunSchema = z.object({
  productSkuId: z.string().min(1),
  batchCount: z.union([z.number(), z.string()]).default(1),
  rawMaterialIssues: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        actualQtyDisplay: z.union([z.number(), z.string()]).optional(),
        actualQtyBase: z.number().int().nonnegative().optional(),
        batchNo: z.string().optional(),
      })
    )
    .optional(),
  actualGoodPackets: z.number().int().nonnegative(),
  damagedPouches: z.number().int().nonnegative().default(0),
  cartonsUsed: z.number().int().nonnegative().default(0),
  labourPaisa: z.number().int().nonnegative().default(0),
  gasPowerPaisa: z.number().int().nonnegative().default(0),
  otherOverheadPaisa: z.number().int().nonnegative().default(0),
  tolerancePct: z.number().positive().default(3.0),
  batchNo: z.string().optional(),
  notes: z.string().optional(),
});

const overheadsSchema = z.object({
  labourPaisa: z.number().int().nonnegative(),
  gasPowerPaisa: z.number().int().nonnegative(),
  otherOverheadPaisa: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});

router.get(
  '/',
  authenticate,
  requireRole('PRODUCTION', 'ADMIN', 'AUDITOR', 'OWNER'),
  async (_req, res) => {
    const runs = await prisma.productionRun.findMany({
      include: {
        productSku: {
          include: {
            recipe: true,
            inventoryItem: true,
          },
        },
        createdBy: { select: { id: true, name: true, role: true } },
        consumptions: {
          include: { inventoryItem: true },
          orderBy: { isPackaging: 'asc' },
        },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const enriched = await Promise.all(
      runs.map(async (run) => {
        const fifoMaterialCost = await computeRunFifoMaterialCost(prisma, run.id);
        const costBreakdown = buildCostBreakdown({
          rawMaterialCostPaisa: run.rawMaterialCostPaisa,
          packagingCostPaisa: run.packagingCostPaisa,
          labourCostPaisa: run.labourCostPaisa,
          gasPowerCostPaisa: run.gasPowerCostPaisa,
          otherOverheadPaisa: run.otherOverheadPaisa,
          actualGoodPackets: run.actualGoodPackets ?? 0,
          sellingPricePaisa: run.productSku.sellingPricePaisa,
          fifoMaterialAndPkgCostPaisa: fifoMaterialCost,
        });
        return { ...run, costBreakdown };
      })
    );

    res.json({ runs: enriched });
  }
);

router.post(
  '/',
  authenticate,
  requireRole('PRODUCTION', 'ADMIN'),
  async (req, res) => {
    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid production run input' });
      return;
    }

    try {
      const result = await createProductionRun({
        ...parsed.data,
        createdById: req.user!.id,
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to record production run',
      });
    }
  }
);

router.patch(
  '/:id/overheads',
  authenticate,
  requireRole('PRODUCTION', 'ADMIN', 'OWNER'),
  async (req, res) => {
    const parsed = overheadsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid overhead amounts' });
      return;
    }

    try {
      const result = await updateProductionRunOverheads({
        runId: String(req.params.id),
        labourPaisa: parsed.data.labourPaisa,
        gasPowerPaisa: parsed.data.gasPowerPaisa,
        otherOverheadPaisa: parsed.data.otherOverheadPaisa,
        notes: parsed.data.notes,
        userId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to update overheads',
      });
    }
  }
);

export default router;
