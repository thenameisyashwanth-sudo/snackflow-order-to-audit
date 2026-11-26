/**
 * Physical quantity conversion and Two-Layer BOM calculation utilities.
 *
 * Strict rule: All physical quantities are stored in integer base units:
 * - Weight: grams (g)
 * - Volume: millilitres (ml)
 * - Count: pieces (pcs / packets)
 */

import { divideRoundHalfUp, parseScaledBigInt } from './money.js';

export type SupportedUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs' | 'pkt' | 'carton';

export const BASE_UNIT_DISPLAY_FACTORS = {
  GRAM: 1000, // 1 kg = 1000 g
  MILLILITRE: 1000, // 1 L = 1000 ml
  PIECE: 1, // 1 piece = 1 piece
} as const;

/**
 * Converts a display quantity (integer or decimal string/number, e.g., 10.5 L or 1.2 kg)
 * into integer base units (10500 ml or 1200 g).
 */
export function toBaseUnits(
  qty: number | string,
  unit: SupportedUnit,
  packetsPerCarton = 20
): number {
  let multiplier: number;
  switch (unit) {
    case 'kg':
    case 'L':
      multiplier = 1000;
      break;
    case 'g':
    case 'ml':
    case 'pcs':
    case 'pkt':
      multiplier = 1;
      break;
    case 'carton':
      multiplier = packetsPerCarton;
      break;
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unsupported unit: ${exhaustive}`);
    }
  }

  const scaledQty = parseScaledBigInt(qty, 4); // up to 4 decimal places in input
  const baseBig = divideRoundHalfUp(scaledQty * BigInt(multiplier), 10000n);
  const result = Number(baseBig);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Base quantity exceeds safe integer range: ${baseBig}`);
  }
  return result;
}

/**
 * Converts integer base units into a clean display string using displayFactor.
 * Examples:
 *   fromBaseUnits(120000, 1000) => "120"
 *   fromBaseUnits(19500, 1000)  => "19.5"
 *   fromBaseUnits(306, 1)       => "306"
 */
export function fromBaseUnits(qtyBase: number, displayFactor: number, maxDecimals = 3): string {
  if (!Number.isInteger(qtyBase) || !Number.isInteger(displayFactor) || displayFactor <= 0) {
    throw new Error(`Invalid qtyBase (${qtyBase}) or displayFactor (${displayFactor})`);
  }
  const factor = 10n ** BigInt(maxDecimals);
  const scaled = divideRoundHalfUp(BigInt(qtyBase) * factor, BigInt(displayFactor));
  const isNeg = scaled < 0n;
  const abs = isNeg ? -scaled : scaled;
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(maxDecimals, '0').replace(/0+$/, '');
  const sign = isNeg ? '-' : '';
  return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Two-Layer BOM Layer 2 calculation:
 * Expected packets per batch = floor(recipe.batchYieldG / sku.netWeightG) * batchCount
 *
 * Example:
 *   40,000 g yield / 200 g pack = 200 packets for 1 batch
 *   40,000 g yield / 500 g pack = 80 packets for 1 batch
 */
export function calculateExpectedPackets(
  batchYieldG: number,
  netWeightG: number,
  batchCount: number | string = 1
): number {
  if (!Number.isInteger(batchYieldG) || batchYieldG <= 0) {
    throw new Error(`Invalid batchYieldG: ${batchYieldG}`);
  }
  if (!Number.isInteger(netWeightG) || netWeightG <= 0) {
    throw new Error(`Invalid netWeightG: ${netWeightG}`);
  }
  const packetsPerSingleBatch = Math.floor(batchYieldG / netWeightG);
  const scaledBatches = parseScaledBigInt(batchCount, 4);
  const expected = divideRoundHalfUp(BigInt(packetsPerSingleBatch) * scaledBatches, 10000n);
  return Number(expected);
}

/**
 * Scales a standard recipe ingredient quantity (in base units) by batchCount.
 */
export function scaleRecipeQtyBase(standardQtyBase: number, batchCount: number | string): number {
  const scaledBatches = parseScaledBigInt(batchCount, 4);
  return Number(divideRoundHalfUp(BigInt(standardQtyBase) * scaledBatches, 10000n));
}

/**
 * Calculates required packaging units for a given packet count using integer ratios:
 * `qtyBase` pieces per `perPackets` packets.
 *
 * Examples:
 * - Pouches (1 per 1 packet) for 200 packets => 200
 * - Cartons (1 per 20 packets) for 200 packets => 10
 * - Cartons (1 per 20 packets) for 188 packets (floor) => 9
 */
export function calculatePackagingQty(
  packetCount: number,
  qtyBase: number,
  perPackets: number,
  mode: 'floor' | 'ceil' | 'round' = 'round'
): number {
  if (packetCount < 0 || qtyBase < 0 || perPackets <= 0) {
    throw new Error('Invalid packaging calculation inputs');
  }
  const numerator = packetCount * qtyBase;
  if (mode === 'floor') {
    return Math.floor(numerator / perPackets);
  }
  if (mode === 'ceil') {
    return Math.ceil(numerator / perPackets);
  }
  return Number(divideRoundHalfUp(BigInt(numerator), BigInt(perPackets)));
}

/**
 * Computes percentage variance: ((actual - planned) / planned) * 100
 * Returned as a number rounded to 2 decimal places (e.g., -6.00 or +5.00),
 * plus whether |variance| exceeds tolerancePct.
 */
export function computeVariancePct(
  planned: number,
  actual: number,
  tolerancePct = 3
): { variancePct: number; isFlagged: boolean } {
  if (planned === 0) {
    return { variancePct: actual === 0 ? 0 : 100, isFlagged: actual !== 0 };
  }
  // Use scaled BigInt for exact 2-decimal percentage
  const diff = BigInt(actual - planned);
  const scaledPct = divideRoundHalfUp(diff * 10000n, BigInt(planned)); // percent * 100
  const variancePct = Number(scaledPct) / 100;
  const isFlagged = Math.abs(variancePct) > tolerancePct;
  return { variancePct, isFlagged };
}
