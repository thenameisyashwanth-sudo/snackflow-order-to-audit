/**
 * Indian GST and Financial Year numbering utilities.
 *
 * Financial Year runs from April 1 to March 31.
 * Example: 2026-11-26 => "FY26-27"
 *          2026-02-15 => "FY25-26"
 */

import { divideRoundHalfUp } from './money.js';

export function getIndianFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const startYY = (startYear % 100).toString().padStart(2, '0');
  const endYY = (endYear % 100).toString().padStart(2, '0');
  return `FY${startYY}-${endYY}`;
}

export function formatInvoiceNumber(financialYear: string, sequenceNo: number): string {
  return `${financialYear}/${sequenceNo.toString().padStart(3, '0')}`;
}

export function formatCreditNoteNumber(financialYear: string, sequenceNo: number): string {
  return `CN/${financialYear}/${sequenceNo.toString().padStart(3, '0')}`;
}

export interface GstLineCalculation {
  taxablePaisa: number;
  cgstPaisa: number;
  sgstPaisa: number;
  igstPaisa: number;
  totalGstPaisa: number;
  totalPaisa: number;
  isInterState: boolean;
}

/**
 * Calculates GST split (CGST+SGST for intra-state vs IGST for inter-state)
 * using exact integer paisa arithmetic.
 *
 * @param qtyPackets Number of packets
 * @param unitPricePaisa Pre-tax price per packet in integer paisa
 * @param gstRateBps GST rate in basis points (e.g., 500 = 5.00%, 1200 = 12.00%)
 * @param factoryStateCode 2-digit GST state code of factory (e.g., "33" = Tamil Nadu)
 * @param placeOfSupplyStateCode 2-digit GST state code of customer (e.g., "33" = TN, "29" = KA)
 */
export function computeGstLineItem(params: {
  qtyPackets: number;
  unitPricePaisa: number;
  gstRateBps: number;
  factoryStateCode: string;
  placeOfSupplyStateCode: string;
}): GstLineCalculation {
  const { qtyPackets, unitPricePaisa, gstRateBps, factoryStateCode, placeOfSupplyStateCode } =
    params;

  if (!Number.isInteger(qtyPackets) || qtyPackets < 0) {
    throw new Error(`Invalid qtyPackets: ${qtyPackets}`);
  }
  if (!Number.isInteger(unitPricePaisa) || unitPricePaisa < 0) {
    throw new Error(`Invalid unitPricePaisa: ${unitPricePaisa}`);
  }
  if (!Number.isInteger(gstRateBps) || gstRateBps < 0) {
    throw new Error(`Invalid gstRateBps: ${gstRateBps}`);
  }

  const taxablePaisa = qtyPackets * unitPricePaisa;
  const totalGstBig = divideRoundHalfUp(BigInt(taxablePaisa) * BigInt(gstRateBps), 10000n);
  const totalGstPaisa = Number(totalGstBig);
  const isInterState = factoryStateCode.trim() !== placeOfSupplyStateCode.trim();

  if (isInterState) {
    return {
      taxablePaisa,
      cgstPaisa: 0,
      sgstPaisa: 0,
      igstPaisa: totalGstPaisa,
      totalGstPaisa,
      totalPaisa: taxablePaisa + totalGstPaisa,
      isInterState: true,
    };
  }

  const cgstPaisa = Math.floor(totalGstPaisa / 2);
  const sgstPaisa = totalGstPaisa - cgstPaisa;

  return {
    taxablePaisa,
    cgstPaisa,
    sgstPaisa,
    igstPaisa: 0,
    totalGstPaisa,
    totalPaisa: taxablePaisa + cgstPaisa + sgstPaisa,
    isInterState: false,
  };
}
