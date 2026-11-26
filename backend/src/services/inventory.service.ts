import { ItemCategory, MovementType, Prisma, PrismaClient } from '@prisma/client';
import {
  computeValuePaisaFromQtyAndRate,
  divideRoundHalfUp,
  formatScaledBigInt,
  normalizeRateDecimal,
  parseScaledBigInt,
} from '../utils/money.js';
import { fromBaseUnits } from '../utils/units.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ItemStockSummary {
  inventoryItemId: string;
  skuCode: string;
  name: string;
  nameTamil: string | null;
  category: ItemCategory;
  baseUnit: string;
  displayUnit: string;
  displayFactor: number;
  reorderLevelBase: number;
  openingQtyBase: number;
  receiptsQtyBase: number;
  issuesScrapQtyBase: number;
  salesDispatchQtyBase: number;
  returnsQtyBase: number;
  adjustmentsQtyBase: number;
  closingQtyBase: number;
  closingDisplay: string;
  closingValuePaisa: number;
  wacRateDecimal: string;
  isLowStock: boolean;
  hsnCode: string | null;
  gstRateBps: number;
}

/**
 * Computes live stock balance and Weighted Average Cost (WAC) for a single inventory item
 * strictly by aggregating all StockLedger movements (never overwriting balances directly).
 *
 * WAC formula:
 *   totalValuePaisa = SUM(signed totalValuePaisa from StockLedger)
 *   totalQtyBase    = SUM(signed qtyBaseDelta from StockLedger)
 *   wacRateDecimal  = (totalValuePaisa * displayFactor) / (totalQtyBase * 100)
 */
export async function getItemLedgerState(
  db: DbClient,
  inventoryItemId: string
): Promise<{
  qtyBase: number;
  totalValuePaisa: number;
  wacRateDecimal: string;
  displayFactor: number;
}> {
  const item = await db.inventoryItem.findUniqueOrThrow({
    where: { id: inventoryItemId },
    select: {
      id: true,
      displayFactor: true,
      currentWeightedRateDecimal: true,
    },
  });

  const agg = await db.stockLedger.aggregate({
    where: { inventoryItemId },
    _sum: {
      qtyBaseDelta: true,
      totalValuePaisa: true,
    },
  });

  const qtyBase = agg._sum.qtyBaseDelta ?? 0;
  const totalValuePaisa = agg._sum.totalValuePaisa ?? 0;

  let wacRateDecimal = normalizeRateDecimal(item.currentWeightedRateDecimal.toString());
  if (qtyBase > 0 && totalValuePaisa > 0) {
    // (totalValuePaisa / 100) / (qtyBase / displayFactor) = (totalValuePaisa * displayFactor * 10000) / (qtyBase * 100)
    const numerator = BigInt(totalValuePaisa) * BigInt(item.displayFactor) * 10000n;
    const denominator = BigInt(qtyBase) * 100n;
    const scaled = divideRoundHalfUp(numerator, denominator);
    wacRateDecimal = formatScaledBigInt(scaled, 4);
  }

  return {
    qtyBase,
    totalValuePaisa,
    wacRateDecimal,
    displayFactor: item.displayFactor,
  };
}

/**
 * Pure helper to calculate FIFO cost in paisa for consuming `consumeQtyBase`
 * from chronological inflow layers after accounting for `priorOutflowsQtyBase`.
 */
export function calculateFifoCostPaisa(
  inflows: Array<{ qtyBase: number; rateDecimal: string }>,
  priorOutflowsQtyBase: number,
  consumeQtyBase: number,
  displayFactor: number
): number {
  let skipRemaining = Math.max(0, priorOutflowsQtyBase);
  let needRemaining = consumeQtyBase;
  let totalCostPaisa = 0;

  for (const layer of inflows) {
    if (needRemaining <= 0) break;
    if (layer.qtyBase <= 0) continue;

    if (skipRemaining >= layer.qtyBase) {
      skipRemaining -= layer.qtyBase;
      continue;
    }

    const availableInLayer = layer.qtyBase - skipRemaining;
    skipRemaining = 0;

    const takeQty = Math.min(availableInLayer, needRemaining);
    totalCostPaisa += computeValuePaisaFromQtyAndRate(
      takeQty,
      displayFactor,
      layer.rateDecimal
    );
    needRemaining -= takeQty;
  }

  // Fallback if consumption exceeds recorded inflows (should not happen in valid runs)
  if (needRemaining > 0 && inflows.length > 0) {
    const lastRate = inflows[inflows.length - 1].rateDecimal;
    totalCostPaisa += computeValuePaisaFromQtyAndRate(needRemaining, displayFactor, lastRate);
  }

  return totalCostPaisa;
}

/**
 * Computes FIFO cost for an item directly from its StockLedger history.
 */
export async function getFifoCostForItem(
  db: DbClient,
  inventoryItemId: string,
  consumeQtyBase: number,
  displayFactor: number
): Promise<number> {
  const entries = await db.stockLedger.findMany({
    where: { inventoryItemId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      qtyBaseDelta: true,
      unitCostDecimal: true,
    },
  });

  const inflows: Array<{ qtyBase: number; rateDecimal: string }> = [];
  let priorOutflowsQtyBase = 0;

  for (const entry of entries) {
    if (entry.qtyBaseDelta > 0) {
      inflows.push({
        qtyBase: entry.qtyBaseDelta,
        rateDecimal: entry.unitCostDecimal.toString(),
      });
    } else if (entry.qtyBaseDelta < 0) {
      priorOutflowsQtyBase += Math.abs(entry.qtyBaseDelta);
    }
  }

  return calculateFifoCostPaisa(inflows, priorOutflowsQtyBase, consumeQtyBase, displayFactor);
}

/**
 * Computes full inventory balance sheet across all items strictly from StockLedger rows:
 * Opening + Receipts - Issues/Scrap - Sales + Returns ± Adjustments = Closing.
 */
export async function getAllInventoryBalances(
  db: DbClient,
  filters?: { category?: ItemCategory; from?: Date; to?: Date }
): Promise<ItemStockSummary[]> {
  const items = await db.inventoryItem.findMany({
    where: {
      isActive: true,
      ...(filters?.category ? { category: filters.category } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const ledgerRows = await db.stockLedger.findMany({
    where: {
      ...(filters?.to ? { createdAt: { lte: filters.to } } : {}),
    },
    select: {
      inventoryItemId: true,
      movementType: true,
      qtyBaseDelta: true,
      totalValuePaisa: true,
      createdAt: true,
    },
  });

  const rowsByItem = new Map<string, typeof ledgerRows>();
  for (const row of ledgerRows) {
    const arr = rowsByItem.get(row.inventoryItemId) ?? [];
    arr.push(row);
    rowsByItem.set(row.inventoryItemId, arr);
  }

  return items.map((item) => {
    const rows = rowsByItem.get(item.id) ?? [];

    let openingQtyBase = 0;
    let receiptsQtyBase = 0;
    let issuesScrapQtyBase = 0;
    let salesDispatchQtyBase = 0;
    let returnsQtyBase = 0;
    let adjustmentsQtyBase = 0;
    let totalValuePaisa = 0;

    for (const row of rows) {
      totalValuePaisa += row.totalValuePaisa;
      const inWindow = !filters?.from || row.createdAt >= filters.from;

      if (!inWindow) {
        // Everything prior to `from` rolls into opening balance for that period
        openingQtyBase += row.qtyBaseDelta;
        continue;
      }

      switch (row.movementType) {
        case MovementType.INITIAL_OPENING:
          openingQtyBase += row.qtyBaseDelta;
          break;
        case MovementType.PURCHASE_RECEIPT:
        case MovementType.PROD_OUTPUT:
          receiptsQtyBase += row.qtyBaseDelta;
          break;
        case MovementType.PROD_ISSUE:
        case MovementType.PROD_SCRAP:
          issuesScrapQtyBase += Math.abs(row.qtyBaseDelta);
          break;
        case MovementType.SALES_DISPATCH:
          salesDispatchQtyBase += Math.abs(row.qtyBaseDelta);
          break;
        case MovementType.CREDIT_NOTE_RETURN:
          returnsQtyBase += row.qtyBaseDelta;
          break;
        case MovementType.ADJUSTMENT:
          adjustmentsQtyBase += row.qtyBaseDelta;
          break;
      }
    }

    const closingQtyBase =
      openingQtyBase +
      receiptsQtyBase -
      issuesScrapQtyBase -
      salesDispatchQtyBase +
      returnsQtyBase +
      adjustmentsQtyBase;

    let wacRateDecimal = normalizeRateDecimal(item.currentWeightedRateDecimal.toString());
    if (closingQtyBase > 0 && totalValuePaisa > 0) {
      const numerator = BigInt(totalValuePaisa) * BigInt(item.displayFactor) * 10000n;
      const denominator = BigInt(closingQtyBase) * 100n;
      wacRateDecimal = formatScaledBigInt(divideRoundHalfUp(numerator, denominator), 4);
    }

    return {
      inventoryItemId: item.id,
      skuCode: item.skuCode,
      name: item.name,
      nameTamil: item.nameTamil,
      category: item.category,
      baseUnit: item.baseUnit,
      displayUnit: item.displayUnit,
      displayFactor: item.displayFactor,
      reorderLevelBase: item.reorderLevelBase,
      openingQtyBase,
      receiptsQtyBase,
      issuesScrapQtyBase,
      salesDispatchQtyBase,
      returnsQtyBase,
      adjustmentsQtyBase,
      closingQtyBase,
      closingDisplay: `${fromBaseUnits(closingQtyBase, item.displayFactor)} ${item.displayUnit}`,
      closingValuePaisa: totalValuePaisa,
      wacRateDecimal,
      isLowStock: closingQtyBase <= item.reorderLevelBase,
      hsnCode: item.hsnCode,
      gstRateBps: item.gstRateBps,
    };
  });
}

/**
 * Helper to format a rupee rate per display unit from total paisa and qtyBase.
 */
export function deriveUnitRateDecimal(
  totalPaisa: number,
  qtyBase: number,
  displayFactor: number
): string {
  if (qtyBase <= 0) return '0.0000';
  const numerator = BigInt(totalPaisa) * BigInt(displayFactor) * 10000n;
  const denominator = BigInt(qtyBase) * 100n;
  return formatScaledBigInt(divideRoundHalfUp(numerator, denominator), 4);
}

/**
 * Validates that display quantity string/number parses cleanly and converts to integer base units.
 */
export function displayQtyToBaseUnits(
  qtyDisplay: number | string,
  displayFactor: number
): number {
  const scaled = parseScaledBigInt(qtyDisplay, 4);
  const result = Number(divideRoundHalfUp(scaled * BigInt(displayFactor), 10000n));
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Invalid display quantity: ${qtyDisplay}`);
  }
  return result;
}
