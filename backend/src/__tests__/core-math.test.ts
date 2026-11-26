import { describe, expect, it } from 'vitest';
import {
  computeValuePaisaFromQtyAndRate,
  computeWeightedAverageRateDecimal,
  formatINR,
  paisaToRupeesString,
  rupeesToPaisa,
} from '../utils/money.js';
import {
  calculateExpectedPackets,
  calculatePackagingQty,
  computeVariancePct,
  fromBaseUnits,
  toBaseUnits,
} from '../utils/units.js';
import {
  computeGstLineItem,
  formatInvoiceNumber,
  getIndianFinancialYear,
} from '../utils/gst.js';

describe('Money arithmetic (integer paisa & Decimal(14,4))', () => {
  it('converts rupees to paisa without float drift', () => {
    expect(rupeesToPaisa('187.50')).toBe(18750);
    expect(rupeesToPaisa(19.99)).toBe(1999);
    expect(rupeesToPaisa('7875')).toBe(787500);
    expect(paisaToRupeesString(18750)).toBe('187.50');
    expect(formatINR(787500)).toBe('₹7,875.00');
  });

  it('computes exact Section 5 weighted average rate for flour (₹43.1250/kg)', () => {
    // Opening: 100 kg @ ₹42/kg; Purchase: 60 kg @ ₹45/kg
    const newRate = computeWeightedAverageRateDecimal(100000, '42.0000', 60000, '45.0000', 1000);
    expect(newRate).toBe('43.1250');

    // Issue 40 kg (40,000 g) at ₹43.1250/kg = ₹1,725.00 (172500 paisa)
    const issueCostPaisa = computeValuePaisaFromQtyAndRate(40000, 1000, newRate);
    expect(issueCostPaisa).toBe(172500);
  });
});

describe('Unit conversions and Two-Layer BOM math', () => {
  it('converts kg, L, g, ml, pcs, and cartons to integer base units', () => {
    expect(toBaseUnits(40, 'kg')).toBe(40000);
    expect(toBaseUnits(10.5, 'L')).toBe(10500);
    expect(toBaseUnits(1.2, 'kg')).toBe(1200);
    expect(toBaseUnits(9, 'carton', 20)).toBe(180);

    expect(fromBaseUnits(120000, 1000)).toBe('120');
    expect(fromBaseUnits(19500, 1000)).toBe('19.5');
    expect(fromBaseUnits(306, 1)).toBe('306');
  });

  it('calculates expected packets dynamically for 200 g and 500 g SKUs sharing one recipe', () => {
    // 40,000 g batch yield
    expect(calculateExpectedPackets(40000, 200, 1)).toBe(200);
    expect(calculateExpectedPackets(40000, 500, 1)).toBe(80);
  });

  it('calculates packaging BOM quantities and variance flags accurately', () => {
    expect(calculatePackagingQty(200, 1, 1)).toBe(200); // pouches
    expect(calculatePackagingQty(200, 1, 20)).toBe(10); // cartons
    expect(calculatePackagingQty(188, 1, 20, 'floor')).toBe(9);

    // Yield variance: 188 vs 200 => -6%, flagged (> 3%)
    expect(computeVariancePct(200, 188, 3)).toEqual({ variancePct: -6, isFlagged: true });
    // Oil consumption variance: 10.5 L vs 10 L => +5%, flagged (> 3%)
    expect(computeVariancePct(10000, 10500, 3)).toEqual({ variancePct: 5, isFlagged: true });
  });
});

describe('Indian GST and Financial Year numbering', () => {
  it('computes FY correctly around April 1 boundary', () => {
    expect(getIndianFinancialYear(new Date('2026-11-26'))).toBe('FY26-27');
    expect(getIndianFinancialYear(new Date('2026-04-01'))).toBe('FY26-27');
    expect(getIndianFinancialYear(new Date('2026-03-31'))).toBe('FY25-26');
    expect(formatInvoiceNumber('FY26-27', 1)).toBe('FY26-27/001');
  });

  it('computes Section 5 Retailer A (Tamil Nadu) CGST + SGST and Distributor B (Karnataka) IGST', () => {
    const retailerA = computeGstLineItem({
      qtyPackets: 150,
      unitPricePaisa: 5000, // ₹50.00
      gstRateBps: 500, // 5%
      factoryStateCode: '33', // TN
      placeOfSupplyStateCode: '33', // TN
    });
    expect(retailerA).toEqual({
      taxablePaisa: 750000, // ₹7,500
      cgstPaisa: 18750, // ₹187.50
      sgstPaisa: 18750, // ₹187.50
      igstPaisa: 0,
      totalGstPaisa: 37500,
      totalPaisa: 787500, // ₹7,875
      isInterState: false,
    });

    const distributorB = computeGstLineItem({
      qtyPackets: 120,
      unitPricePaisa: 5000,
      gstRateBps: 500,
      factoryStateCode: '33', // TN
      placeOfSupplyStateCode: '29', // KA
    });
    expect(distributorB).toEqual({
      taxablePaisa: 600000, // ₹6,000
      cgstPaisa: 0,
      sgstPaisa: 0,
      igstPaisa: 30000, // ₹300.00 IGST
      totalGstPaisa: 30000,
      totalPaisa: 630000, // ₹6,300
      isInterState: true,
    });
  });
});
