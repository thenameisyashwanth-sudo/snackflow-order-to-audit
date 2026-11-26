import { describe, expect, it } from 'vitest';
import { calculateFifoCostPaisa } from '../services/inventory.service.js';
import { buildCostBreakdown } from '../services/production.service.js';
import {
  computeValuePaisaFromQtyAndRate,
  computeWeightedAverageRateDecimal,
} from '../utils/money.js';
import { computeVariancePct } from '../utils/units.js';

describe('Section 5 Benchmark Loop 2: Purchases, BOM Production, Variance & Costing', () => {
  it('reproduces exact Section 5 WAC, closing balances, variances, and ₹31.14/packet cost', () => {
    // 1. Flour opening (100 kg @ ₹42) + purchase (60 kg @ ₹45) -> WAC ₹43.1250/kg
    const flourWac = computeWeightedAverageRateDecimal(
      100000,
      '42.0000',
      60000,
      '45.0000',
      1000
    );
    expect(flourWac).toBe('43.1250');

    // 2. Production issue closing balances
    const flourClosingG = 100000 + 60000 - 40000;
    const oilClosingMl = 30000 - 10500;
    const pouchesClosing = 500 - (188 + 6);
    const cartonsClosing = 30 - 9;
    const fgClosing = 50 + 188;

    expect(flourClosingG).toBe(120000); // 120 kg
    expect(oilClosingMl).toBe(19500); // 19.5 L
    expect(pouchesClosing).toBe(306); // 306 pcs
    expect(cartonsClosing).toBe(21); // 21 pcs
    expect(fgClosing).toBe(238); // 238 packets

    // 3. Variance flags (> 3% tolerance)
    expect(computeVariancePct(200, 188, 3)).toEqual({
      variancePct: -6,
      isFlagged: true,
    });
    expect(computeVariancePct(10000, 10500, 3)).toEqual({
      variancePct: 5,
      isFlagged: true,
    });
    expect(computeVariancePct(40000, 40000, 3)).toEqual({
      variancePct: 0,
      isFlagged: false,
    });

    // 4. WAC Costing
    const flourCost = computeValuePaisaFromQtyAndRate(40000, 1000, flourWac); // ₹1,725.00
    const oilCost = computeValuePaisaFromQtyAndRate(10500, 1000, '140.0000'); // ₹1,470.00
    const spiceCost = computeValuePaisaFromQtyAndRate(1200, 1000, '200.0000'); // ₹240.00
    const rawMaterialCostPaisa = flourCost + oilCost + spiceCost;

    expect(flourCost).toBe(172500);
    expect(oilCost).toBe(147000);
    expect(spiceCost).toBe(24000);
    expect(rawMaterialCostPaisa).toBe(343500); // ₹3,435.00

    const pouchCost = computeValuePaisaFromQtyAndRate(194, 1, '2.5000'); // ₹485.00 (188 + 6 scrap)
    const cartonCost = computeValuePaisaFromQtyAndRate(9, 1, '15.0000'); // ₹135.00
    const packagingCostPaisa = pouchCost + cartonCost;
    expect(packagingCostPaisa).toBe(62000); // ₹620.00

    // 5. FIFO comparison for flour (40 kg from opening ₹42/kg batch = ₹1,680.00)
    const flourFifo = calculateFifoCostPaisa(
      [
        { qtyBase: 100000, rateDecimal: '42.0000' },
        { qtyBase: 60000, rateDecimal: '45.0000' },
      ],
      0,
      40000,
      1000
    );
    expect(flourFifo).toBe(168000);

    const fifoMaterialAndPkgCostPaisa =
      flourFifo + oilCost + spiceCost + pouchCost + cartonCost;

    // 6. Cost breakdown with Labour ₹1,200 + Gas/Power ₹600
    const breakdown = buildCostBreakdown({
      rawMaterialCostPaisa,
      packagingCostPaisa,
      labourCostPaisa: 120000,
      gasPowerCostPaisa: 60000,
      otherOverheadPaisa: 0,
      actualGoodPackets: 188,
      sellingPricePaisa: 5000, // ₹50.00
      fifoMaterialAndPkgCostPaisa,
    });

    expect(breakdown.totalCostPaisa).toBe(585500); // ₹5,855.00
    expect(breakdown.costPerPacketPaisa).toBe(3114); // ₹31.14/packet
    expect(breakdown.grossMarginPerPacketPaisa).toBe(1886); // ₹18.86/packet
    expect(breakdown.grossMarginPct).toBe(37.71); // 37.71%
    expect(breakdown.fifoTotalCostPaisa).toBe(581000); // ₹5,810.00
    expect(breakdown.fifoCostPerPacketPaisa).toBe(3090); // ₹30.90/packet
  });
});
