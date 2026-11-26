import { LedgerSourceType, MovementType, Prisma, ProductionStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  computeValuePaisaFromQtyAndRate,
  divideRoundHalfUp,
  normalizeRateDecimal,
} from '../utils/money.js';
import {
  calculateExpectedPackets,
  calculatePackagingQty,
  computeVariancePct,
  scaleRecipeQtyBase,
} from '../utils/units.js';
import {
  deriveUnitRateDecimal,
  displayQtyToBaseUnits,
  getFifoCostForItem,
  getItemLedgerState,
} from './inventory.service.js';

export interface ProductionRunInput {
  productSkuId: string;
  batchCount?: number | string;
  rawMaterialIssues?: Array<{
    inventoryItemId: string;
    actualQtyDisplay?: number | string;
    actualQtyBase?: number;
    batchNo?: string;
  }>;
  actualGoodPackets: number;
  damagedPouches?: number;
  cartonsUsed?: number;
  labourPaisa?: number;
  gasPowerPaisa?: number;
  otherOverheadPaisa?: number;
  tolerancePct?: number;
  batchNo?: string;
  notes?: string;
  createdById: string;
}

export interface CostBreakdownSummary {
  rawMaterialCostPaisa: number;
  packagingCostPaisa: number;
  labourCostPaisa: number;
  gasPowerCostPaisa: number;
  otherOverheadPaisa: number;
  totalCostPaisa: number;
  costPerPacketPaisa: number;
  sellingPricePaisa: number;
  grossMarginPerPacketPaisa: number;
  grossMarginPct: number;
  fifoTotalCostPaisa: number;
  fifoCostPerPacketPaisa: number;
  valuationMethod: string;
  overheadRule: string;
}

export function buildCostBreakdown(params: {
  rawMaterialCostPaisa: number;
  packagingCostPaisa: number;
  labourCostPaisa: number;
  gasPowerCostPaisa: number;
  otherOverheadPaisa: number;
  actualGoodPackets: number;
  sellingPricePaisa: number;
  fifoMaterialAndPkgCostPaisa: number;
}): CostBreakdownSummary {
  const {
    rawMaterialCostPaisa,
    packagingCostPaisa,
    labourCostPaisa,
    gasPowerCostPaisa,
    otherOverheadPaisa,
    actualGoodPackets,
    sellingPricePaisa,
    fifoMaterialAndPkgCostPaisa,
  } = params;

  const totalOverheadPaisa = labourCostPaisa + gasPowerCostPaisa + otherOverheadPaisa;
  const totalCostPaisa = rawMaterialCostPaisa + packagingCostPaisa + totalOverheadPaisa;
  const costPerPacketPaisa =
    actualGoodPackets > 0
      ? Number(divideRoundHalfUp(BigInt(totalCostPaisa), BigInt(actualGoodPackets)))
      : 0;

  const fifoTotalCostPaisa = fifoMaterialAndPkgCostPaisa + totalOverheadPaisa;
  const fifoCostPerPacketPaisa =
    actualGoodPackets > 0
      ? Number(divideRoundHalfUp(BigInt(fifoTotalCostPaisa), BigInt(actualGoodPackets)))
      : 0;

  const grossMarginPerPacketPaisa = sellingPricePaisa - costPerPacketPaisa;
  const totalRevenuePaisa = sellingPricePaisa * actualGoodPackets;
  let grossMarginPct = 0;
  if (totalRevenuePaisa > 0) {
    const marginScaled = divideRoundHalfUp(
      BigInt(totalRevenuePaisa - totalCostPaisa) * 10000n,
      BigInt(totalRevenuePaisa)
    );
    grossMarginPct = Number(marginScaled) / 100;
  }

  return {
    rawMaterialCostPaisa,
    packagingCostPaisa,
    labourCostPaisa,
    gasPowerCostPaisa,
    otherOverheadPaisa,
    totalCostPaisa,
    costPerPacketPaisa,
    sellingPricePaisa,
    grossMarginPerPacketPaisa,
    grossMarginPct,
    fifoTotalCostPaisa,
    fifoCostPerPacketPaisa,
    valuationMethod: 'Weighted Average Cost (WAC) with normal pouch scrap absorbed into good output',
    overheadRule:
      'Direct batch labour + gas/power overheads recorded per run and divided across actual good packets produced',
  };
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function createProductionRun(input: ProductionRunInput) {
  const batchCount = input.batchCount ?? 1;
  const tolerancePct = input.tolerancePct ?? 3.0;
  const damagedPouches = input.damagedPouches ?? 0;
  const cartonsUsed = input.cartonsUsed ?? 0;
  const labourPaisa = input.labourPaisa ?? 0;
  const gasPowerPaisa = input.gasPowerPaisa ?? 0;
  const otherOverheadPaisa = input.otherOverheadPaisa ?? 0;

  if (!Number.isInteger(input.actualGoodPackets) || input.actualGoodPackets < 0) {
    throw new Error('actualGoodPackets must be a non-negative integer.');
  }
  if (!Number.isInteger(damagedPouches) || damagedPouches < 0) {
    throw new Error('damagedPouches must be a non-negative integer.');
  }
  if (!Number.isInteger(cartonsUsed) || cartonsUsed < 0) {
    throw new Error('cartonsUsed must be a non-negative integer.');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const sku = await tx.productSku.findUnique({
      where: { id: input.productSkuId },
      include: {
        inventoryItem: true,
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
      },
    });

    if (!sku) {
      throw new Error('Product SKU not found.');
    }

    const expectedPackets = calculateExpectedPackets(
      sku.recipe.batchYieldG,
      sku.netWeightG,
      batchCount
    );

    const existingCount = await tx.productionRun.count();
    const runNo = `PRD-${(existingCount + 1).toString().padStart(4, '0')}`;
    const now = new Date();
    const batchNo =
      input.batchNo?.trim() ||
      `B-${sku.skuCode.replace(/^FG-/, '')}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${existingCount + 1}`;
    const expiryDate = addDays(now, sku.shelfLifeDays);

    const issueMap = new Map(
      (input.rawMaterialIssues ?? []).map((rm) => [rm.inventoryItemId, rm])
    );

    // 1. Prepare Raw Material consumptions & check stock sufficiency
    const consumptionRows: Array<{
      inventoryItemId: string;
      isPackaging: boolean;
      plannedQtyBase: number;
      actualQtyBase: number;
      damagedQtyBase: number;
      varianceQtyBase: number;
      variancePct: string;
      isVarianceFlagged: boolean;
      unitCostDecimal: string;
      totalCostPaisa: number;
      goodCostPaisa: number;
      scrapCostPaisa: number;
      fifoCostPaisa: number;
      batchNo: string | null;
      packagingRole?: string;
    }> = [];

    let rawMaterialCostPaisa = 0;
    let hasConsumptionVarianceFlag = false;

    for (const ing of sku.recipe.ingredients) {
      const item = ing.inventoryItem;
      const plannedQtyBase = scaleRecipeQtyBase(ing.standardQtyBase, batchCount);
      const override = issueMap.get(item.id);

      let actualQtyBase = plannedQtyBase;
      if (override) {
        actualQtyBase =
          override.actualQtyBase !== undefined
            ? override.actualQtyBase
            : displayQtyToBaseUnits(override.actualQtyDisplay ?? 0, item.displayFactor);
      }

      const ledgerState = await getItemLedgerState(tx, item.id);
      if (ledgerState.qtyBase < actualQtyBase) {
        throw new Error(
          `Insufficient stock for raw material "${item.name}". Available: ${ledgerState.qtyBase} base units, Requested: ${actualQtyBase} base units.`
        );
      }

      const wacRate = normalizeRateDecimal(ledgerState.wacRateDecimal);
      const totalCostPaisa = computeValuePaisaFromQtyAndRate(
        actualQtyBase,
        item.displayFactor,
        wacRate
      );
      const fifoCostPaisa = await getFifoCostForItem(
        tx,
        item.id,
        actualQtyBase,
        item.displayFactor
      );

      const { variancePct, isFlagged } = computeVariancePct(
        plannedQtyBase,
        actualQtyBase,
        tolerancePct
      );
      if (isFlagged) {
        hasConsumptionVarianceFlag = true;
      }

      rawMaterialCostPaisa += totalCostPaisa;

      consumptionRows.push({
        inventoryItemId: item.id,
        isPackaging: false,
        plannedQtyBase,
        actualQtyBase,
        damagedQtyBase: 0,
        varianceQtyBase: actualQtyBase - plannedQtyBase,
        variancePct: variancePct.toFixed(4),
        isVarianceFlagged: isFlagged,
        unitCostDecimal: wacRate,
        totalCostPaisa,
        goodCostPaisa: totalCostPaisa,
        scrapCostPaisa: 0,
        fifoCostPaisa,
        batchNo: override?.batchNo ?? null,
      });
    }

    // 2. Prepare Packaging consumptions (Primary Pouch & Carton)
    let packagingCostPaisa = 0;

    for (const pkg of sku.packagingBom) {
      const item = pkg.packagingItem;
      const plannedQtyBase = calculatePackagingQty(
        expectedPackets,
        pkg.qtyBase,
        pkg.perPackets
      );

      const isPrimaryPouch =
        pkg.packagingRole === 'PRIMARY_POUCH' || pkg.perPackets === 1;

      const goodUsedQty = isPrimaryPouch ? input.actualGoodPackets : cartonsUsed;
      const damagedQty = isPrimaryPouch ? damagedPouches : 0;
      const totalOutflowQty = goodUsedQty + damagedQty;

      const ledgerState = await getItemLedgerState(tx, item.id);
      if (ledgerState.qtyBase < totalOutflowQty) {
        throw new Error(
          `Insufficient stock for packaging "${item.name}". Available: ${ledgerState.qtyBase}, Requested: ${totalOutflowQty}.`
        );
      }

      const wacRate = normalizeRateDecimal(ledgerState.wacRateDecimal);
      const goodCostPaisa = computeValuePaisaFromQtyAndRate(
        goodUsedQty,
        item.displayFactor,
        wacRate
      );
      const scrapCostPaisa = computeValuePaisaFromQtyAndRate(
        damagedQty,
        item.displayFactor,
        wacRate
      );
      const totalCostPaisa = goodCostPaisa + scrapCostPaisa;
      const fifoCostPaisa = await getFifoCostForItem(
        tx,
        item.id,
        totalOutflowQty,
        item.displayFactor
      );

      const { variancePct, isFlagged } = computeVariancePct(
        plannedQtyBase,
        totalOutflowQty,
        tolerancePct
      );
      if (isFlagged) {
        hasConsumptionVarianceFlag = true;
      }

      packagingCostPaisa += totalCostPaisa;

      consumptionRows.push({
        inventoryItemId: item.id,
        isPackaging: true,
        plannedQtyBase,
        actualQtyBase: goodUsedQty,
        damagedQtyBase: damagedQty,
        varianceQtyBase: totalOutflowQty - plannedQtyBase,
        variancePct: variancePct.toFixed(4),
        isVarianceFlagged: isFlagged,
        unitCostDecimal: wacRate,
        totalCostPaisa,
        goodCostPaisa,
        scrapCostPaisa,
        fifoCostPaisa,
        batchNo: null,
        packagingRole: pkg.packagingRole,
      });
    }

    // 3. Yield Variance & Cost Breakdown
    const yieldVariance = computeVariancePct(
      expectedPackets,
      input.actualGoodPackets,
      tolerancePct
    );

    const fifoMaterialAndPkgCostPaisa = consumptionRows.reduce(
      (sum, row) => sum + row.fifoCostPaisa,
      0
    );

    const breakdown = buildCostBreakdown({
      rawMaterialCostPaisa,
      packagingCostPaisa,
      labourCostPaisa: labourPaisa,
      gasPowerCostPaisa: gasPowerPaisa,
      otherOverheadPaisa,
      actualGoodPackets: input.actualGoodPackets,
      sellingPricePaisa: sku.sellingPricePaisa,
      fifoMaterialAndPkgCostPaisa,
    });

    // 4. Create ProductionRun record
    const run = await tx.productionRun.create({
      data: {
        runNo,
        productSkuId: sku.id,
        batchCount: Number(batchCount).toFixed(4),
        status: ProductionStatus.COMPLETED,
        batchNo,
        expiryDate,
        expectedPackets,
        actualGoodPackets: input.actualGoodPackets,
        damagedPackets: damagedPouches,
        yieldVariancePct: yieldVariance.variancePct.toFixed(4),
        isYieldVarianceFlagged: yieldVariance.isFlagged,
        hasConsumptionVarianceFlag,
        rawMaterialCostPaisa,
        packagingCostPaisa,
        labourCostPaisa: labourPaisa,
        gasPowerCostPaisa: gasPowerPaisa,
        otherOverheadPaisa,
        totalCostPaisa: breakdown.totalCostPaisa,
        costPerPacketPaisa: breakdown.costPerPacketPaisa,
        completedAt: now,
        notes: input.notes?.trim() || null,
        createdById: input.createdById,
        consumptions: {
          create: consumptionRows.map((c) => ({
            inventoryItemId: c.inventoryItemId,
            isPackaging: c.isPackaging,
            plannedQtyBase: c.plannedQtyBase,
            actualQtyBase: c.actualQtyBase,
            damagedQtyBase: c.damagedQtyBase,
            varianceQtyBase: c.varianceQtyBase,
            variancePct: c.variancePct,
            isVarianceFlagged: c.isVarianceFlagged,
            unitCostDecimal: c.unitCostDecimal,
            totalCostPaisa: c.totalCostPaisa,
            batchNo: c.batchNo,
          })),
        },
      },
      include: {
        productSku: { include: { recipe: true, inventoryItem: true } },
        consumptions: { include: { inventoryItem: true } },
      },
    });

    // 5. Insert Immutable Double-Entry StockLedger Movements
    for (const c of consumptionRows) {
      if (c.actualQtyBase > 0) {
        await tx.stockLedger.create({
          data: {
            inventoryItemId: c.inventoryItemId,
            movementType: MovementType.PROD_ISSUE,
            qtyBaseDelta: -c.actualQtyBase,
            unitCostDecimal: c.unitCostDecimal,
            totalValuePaisa: -c.goodCostPaisa,
            batchNo: c.batchNo,
            sourceType: LedgerSourceType.PRODUCTION_RUN,
            sourceId: run.id,
            notes: `Issued to ${runNo} (${sku.name})`,
            createdById: input.createdById,
          },
        });
      }

      if (c.damagedQtyBase > 0) {
        await tx.stockLedger.create({
          data: {
            inventoryItemId: c.inventoryItemId,
            movementType: MovementType.PROD_SCRAP,
            qtyBaseDelta: -c.damagedQtyBase,
            unitCostDecimal: c.unitCostDecimal,
            totalValuePaisa: -c.scrapCostPaisa,
            batchNo: c.batchNo,
            sourceType: LedgerSourceType.PRODUCTION_RUN,
            sourceId: run.id,
            notes: `Damaged / scrap during ${runNo} (${sku.name})`,
            createdById: input.createdById,
          },
        });
      }
    }

    if (input.actualGoodPackets > 0) {
      const outputUnitCostDecimal = deriveUnitRateDecimal(
        breakdown.totalCostPaisa,
        input.actualGoodPackets,
        sku.inventoryItem.displayFactor
      );

      await tx.stockLedger.create({
        data: {
          inventoryItemId: sku.inventoryItemId,
          movementType: MovementType.PROD_OUTPUT,
          qtyBaseDelta: input.actualGoodPackets,
          unitCostDecimal: outputUnitCostDecimal,
          totalValuePaisa: breakdown.totalCostPaisa,
          batchNo,
          expiryDate,
          sourceType: LedgerSourceType.PRODUCTION_RUN,
          sourceId: run.id,
          notes: `Production output for ${runNo} (${input.actualGoodPackets} good packets)`,
          createdById: input.createdById,
        },
      });

      const updatedFgState = await getItemLedgerState(tx, sku.inventoryItemId);
      await tx.inventoryItem.update({
        where: { id: sku.inventoryItemId },
        data: { currentWeightedRateDecimal: updatedFgState.wacRateDecimal },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: input.createdById,
        action: 'CREATE_PRODUCTION_RUN',
        entityType: 'ProductionRun',
        entityId: run.id,
        afterJson: {
          runNo,
          productSku: sku.name,
          expectedPackets,
          actualGoodPackets: input.actualGoodPackets,
          damagedPouches,
          cartonsUsed,
          totalCostPaisa: breakdown.totalCostPaisa,
          costPerPacketPaisa: breakdown.costPerPacketPaisa,
          isYieldVarianceFlagged: yieldVariance.isFlagged,
          hasConsumptionVarianceFlag,
        },
      },
    });

    return {
      run,
      costBreakdown: breakdown,
    };
  });
}

export async function updateProductionRunOverheads(params: {
  runId: string;
  labourPaisa: number;
  gasPowerPaisa: number;
  otherOverheadPaisa?: number;
  notes?: string;
  userId: string;
}) {
  const otherOverheadPaisa = params.otherOverheadPaisa ?? 0;
  if (
    !Number.isInteger(params.labourPaisa) ||
    params.labourPaisa < 0 ||
    !Number.isInteger(params.gasPowerPaisa) ||
    params.gasPowerPaisa < 0 ||
    !Number.isInteger(otherOverheadPaisa) ||
    otherOverheadPaisa < 0
  ) {
    throw new Error('Overheads must be non-negative integers in paisa.');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.productionRun.findUnique({
      where: { id: params.runId },
      include: {
        productSku: { include: { inventoryItem: true } },
        consumptions: { include: { inventoryItem: true } },
      },
    });

    if (!existing) {
      throw new Error('Production run not found.');
    }

    const beforeJson = {
      labourCostPaisa: existing.labourCostPaisa,
      gasPowerCostPaisa: existing.gasPowerCostPaisa,
      otherOverheadPaisa: existing.otherOverheadPaisa,
      totalCostPaisa: existing.totalCostPaisa,
      costPerPacketPaisa: existing.costPerPacketPaisa,
    };

    const actualGoodPackets = existing.actualGoodPackets ?? 0;
    const totalCostPaisa =
      existing.rawMaterialCostPaisa +
      existing.packagingCostPaisa +
      params.labourPaisa +
      params.gasPowerPaisa +
      otherOverheadPaisa;

    const costPerPacketPaisa =
      actualGoodPackets > 0
        ? Number(divideRoundHalfUp(BigInt(totalCostPaisa), BigInt(actualGoodPackets)))
        : 0;

    const updated = await tx.productionRun.update({
      where: { id: existing.id },
      data: {
        labourCostPaisa: params.labourPaisa,
        gasPowerCostPaisa: params.gasPowerPaisa,
        otherOverheadPaisa,
        totalCostPaisa,
        costPerPacketPaisa,
        ...(params.notes !== undefined ? { notes: params.notes } : {}),
      },
      include: {
        productSku: { include: { recipe: true, inventoryItem: true } },
        consumptions: { include: { inventoryItem: true } },
      },
    });

    if (actualGoodPackets > 0) {
      const outputUnitCostDecimal = deriveUnitRateDecimal(
        totalCostPaisa,
        actualGoodPackets,
        existing.productSku.inventoryItem.displayFactor
      );

      await tx.stockLedger.updateMany({
        where: {
          sourceType: LedgerSourceType.PRODUCTION_RUN,
          sourceId: existing.id,
          movementType: MovementType.PROD_OUTPUT,
        },
        data: {
          unitCostDecimal: outputUnitCostDecimal,
          totalValuePaisa: totalCostPaisa,
        },
      });

      const updatedFgState = await getItemLedgerState(
        tx,
        existing.productSku.inventoryItemId
      );
      await tx.inventoryItem.update({
        where: { id: existing.productSku.inventoryItemId },
        data: { currentWeightedRateDecimal: updatedFgState.wacRateDecimal },
      });
    }

    const afterJson = {
      labourCostPaisa: updated.labourCostPaisa,
      gasPowerCostPaisa: updated.gasPowerCostPaisa,
      otherOverheadPaisa: updated.otherOverheadPaisa,
      totalCostPaisa: updated.totalCostPaisa,
      costPerPacketPaisa: updated.costPerPacketPaisa,
    };

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action: 'UPDATE_PRODUCTION_RUN_OVERHEADS',
        entityType: 'ProductionRun',
        entityId: existing.id,
        beforeJson,
        afterJson,
      },
    });

    const fifoMaterialAndPkg = await computeRunFifoMaterialCost(tx, existing.id);
    const costBreakdown = buildCostBreakdown({
      rawMaterialCostPaisa: updated.rawMaterialCostPaisa,
      packagingCostPaisa: updated.packagingCostPaisa,
      labourCostPaisa: updated.labourCostPaisa,
      gasPowerCostPaisa: updated.gasPowerCostPaisa,
      otherOverheadPaisa: updated.otherOverheadPaisa,
      actualGoodPackets,
      sellingPricePaisa: existing.productSku.sellingPricePaisa,
      fifoMaterialAndPkgCostPaisa: fifoMaterialAndPkg,
    });

    return { run: updated, costBreakdown };
  });
}

/**
 * Computes what the FIFO material & packaging cost would have been for a run
 * up to that run's timestamp, for side-by-side costing comparison.
 */
export async function computeRunFifoMaterialCost(
  db: Prisma.TransactionClient | typeof prisma,
  runId: string
): Promise<number> {
  const run = await db.productionRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      consumptions: { include: { inventoryItem: true } },
    },
  });

  let fifoSum = 0;
  for (const c of run.consumptions) {
    const consumeQty = c.actualQtyBase + c.damagedQtyBase;
    const entries = await db.stockLedger.findMany({
      where: {
        inventoryItemId: c.inventoryItemId,
        createdAt: { lte: run.createdAt },
        NOT: {
          sourceType: LedgerSourceType.PRODUCTION_RUN,
          sourceId: runId,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { qtyBaseDelta: true, unitCostDecimal: true },
    });

    const inflows: Array<{ qtyBase: number; rateDecimal: string }> = [];
    let priorOutflows = 0;
    for (const e of entries) {
      if (e.qtyBaseDelta > 0) {
        inflows.push({ qtyBase: e.qtyBaseDelta, rateDecimal: e.unitCostDecimal.toString() });
      } else if (e.qtyBaseDelta < 0) {
        priorOutflows += Math.abs(e.qtyBaseDelta);
      }
    }

    // Use pure FIFO calculation
    let skip = priorOutflows;
    let need = consumeQty;
    for (const layer of inflows) {
      if (need <= 0) break;
      if (skip >= layer.qtyBase) {
        skip -= layer.qtyBase;
        continue;
      }
      const avail = layer.qtyBase - skip;
      skip = 0;
      const take = Math.min(avail, need);
      fifoSum += computeValuePaisaFromQtyAndRate(
        take,
        c.inventoryItem.displayFactor,
        layer.rateDecimal
      );
      need -= take;
    }
    if (need > 0) {
      fifoSum += computeValuePaisaFromQtyAndRate(
        need,
        c.inventoryItem.displayFactor,
        c.unitCostDecimal.toString()
      );
    }
  }
  return fifoSum;
}
