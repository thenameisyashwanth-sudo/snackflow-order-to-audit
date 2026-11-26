import { describe, expect, it } from 'vitest';
import { calculateExpectedPackets, calculatePackagingQty } from '../utils/units.js';

describe('Two-Layer BOM Live Pack-Size Extensibility', () => {
  it('computes 80 packets/batch and scaled packaging when adding Murukku 500 g to Murukku Base Batch', () => {
    const batchYieldG = 40000; // Murukku Base Batch (40 kg)

    // Layer 2 SKU #1: Murukku 200 g (20 pkts/carton)
    const pkts200 = calculateExpectedPackets(batchYieldG, 200, 1);
    expect(pkts200).toBe(200);
    expect(calculatePackagingQty(pkts200, 1, 1)).toBe(200); // pouches
    expect(calculatePackagingQty(pkts200, 1, 20)).toBe(10); // cartons

    // Layer 2 SKU #2: Murukku 500 g (10 pkts/carton) sharing same Recipe
    const pkts500 = calculateExpectedPackets(batchYieldG, 500, 1);
    expect(pkts500).toBe(80);
    expect(calculatePackagingQty(pkts500, 1, 1)).toBe(80); // 500 g pouches
    expect(calculatePackagingQty(pkts500, 1, 10)).toBe(8); // cartons
  });
});
