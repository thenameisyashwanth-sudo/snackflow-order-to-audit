import { InventoryBalance } from './erp';

export interface OwnerExecutiveSummary {
  generatedAt: string;
  todaysOrders: {
    count: number;
    totalPaisa: number;
  };
  loopMetrics?: {
    purchaseLineCount: number;
    purchaseTotalPaisa: number;
    rawPkgItemCount: number;
    rawPkgValuePaisa: number;
    productionRunCount: number;
    totalFgPackets: number;
    submittedOrdersCount: number;
    postedInvoiceCount: number;
    postedInvoiceTotalPaisa: number;
    dispatchedInvoiceCount: number;
    totalCollectedPaisa: number;
  };
  stockLevels: {
    rawMaterials: InventoryBalance[];
    packagingMaterials: InventoryBalance[];
    finishedGoods: InventoryBalance[];
    lowStockAlerts: InventoryBalance[];
    totalInventoryValuePaisa: number;
  };
  varianceAlerts: Array<{
    id: string;
    runNo: string;
    productName: string;
    expectedPackets: number;
    actualGoodPackets: number;
    yieldVariancePct: number;
    isYieldVarianceFlagged: boolean;
    hasConsumptionVarianceFlag: boolean;
    consumptions: Array<{
      itemName: string;
      plannedDisplay: string;
      actualDisplay: string;
      variancePct: number;
      isVarianceFlagged: boolean;
    }>;
  }>;
  latestCosting: {
    runNo: string;
    productName: string;
    actualGoodPackets: number;
    costPerPacketPaisa: number;
    sellingPricePaisa: number;
    grossMarginPerPacketPaisa: number;
    grossMarginPct: number;
    fifoCostPerPacketPaisa: number;
  } | null;
  receivables: {
    totalOutstandingPaisa: number;
    customerDues: Array<{
      customerId: string;
      customerName: string;
      stateName: string;
      totalInvoicedPaisa: number;
      totalCollectedPaisa: number;
      netOutstandingPaisa: number;
    }>;
  };
}

export interface SalesRegisterReport {
  totals: {
    invoiceCount: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalPaisa: number;
  };
  cancelledCount: number;
  invoices: Array<{
    id: string;
    invoiceNo: string;
    issuedAt: string;
    status: string;
    orderNo: string | null;
    customerName: string;
    customerGstin: string | null;
    placeOfSupplyStateCode: string;
    stateName: string;
    isInterState: boolean;
    totalPackets: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalPaisa: number;
    paidPaisa: number;
    creditNoteNos: string[];
  }>;
  customerWiseSummary: Array<{
    customerId: string;
    customerName: string;
    gstin: string | null;
    stateName: string;
    invoiceCount: number;
    totalPackets: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalPaisa: number;
  }>;
  productWiseSummary: Array<{
    productSkuId: string;
    skuCode: string;
    productName: string;
    hsnCode: string;
    totalPackets: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalPaisa: number;
  }>;
}

export interface GstSummaryReport {
  gstr1B2B: Array<{
    invoiceId: string;
    invoiceNo: string;
    issuedAt: string;
    customerGstin: string;
    customerName: string;
    placeOfSupplyStateCode: string;
    placeOfSupplyStateName: string;
    supplyType: string;
    gstRatePct: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    invoiceValuePaisa: number;
  }>;
  gstr3bTable31: {
    intraState: {
      invoiceCount: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalTaxPaisa: number;
      totalValuePaisa: number;
    };
    interState: {
      invoiceCount: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalTaxPaisa: number;
      totalValuePaisa: number;
    };
    netOutwardTotal: {
      invoiceCount: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalTaxPaisa: number;
      totalValuePaisa: number;
    };
  };
}

export interface PurchaseRegisterReport {
  totals: {
    lineCount: number;
    taxablePaisa: number;
    gstPaisa: number;
    totalPaisa: number;
  };
  rows: Array<{
    purchaseId: string;
    purchaseNo: string;
    purchaseDate: string;
    supplierName: string;
    supplierGstin: string | null;
    supplierInvoiceNo: string | null;
    itemName: string;
    qtyDisplay: string;
    ratePerDisplayDecimal: string;
    displayUnit: string;
    gstRatePct: number;
    taxablePaisa: number;
    gstPaisa: number;
    totalPaisa: number;
    batchNo: string | null;
  }>;
}

export interface StockAndLedgerReport {
  rawMaterials: InventoryBalance[];
  packagingMaterials: InventoryBalance[];
  finishedGoods: InventoryBalance[];
  totalClosingValuePaisa: number;
  ledger: Array<{
    id: string;
    createdAt: string;
    itemName: string;
    category: string;
    movementType: string;
    qtyDeltaDisplay: string;
    qtyBaseDelta: number;
    unitCostDecimal: string;
    displayUnit: string;
    totalValuePaisa: number;
    batchNo: string | null;
    sourceType: string;
    sourceId: string;
    notes: string | null;
    createdByName: string;
  }>;
}

export interface ProductionReport {
  runCount: number;
  flaggedRunCount: number;
  runs: Array<{
    id: string;
    runNo: string;
    startedAt: string;
    productName: string;
    batchNo: string;
    expectedPackets: number;
    actualGoodPackets: number;
    damagedPackets: number;
    yieldVariancePct: number;
    isYieldVarianceFlagged: boolean;
    hasConsumptionVarianceFlag: boolean;
    consumptions: Array<{
      itemName: string;
      plannedDisplay: string;
      actualDisplay: string;
      damagedQtyBase: number;
      variancePct: number;
      isVarianceFlagged: boolean;
      totalCostPaisa: number;
    }>;
    costBreakdown: {
      rawMaterialCostPaisa: number;
      packagingCostPaisa: number;
      labourCostPaisa: number;
      gasPowerCostPaisa: number;
      totalCostPaisa: number;
      costPerPacketPaisa: number;
      sellingPricePaisa: number;
      grossMarginPerPacketPaisa: number;
      grossMarginPct: number;
      fifoCostPerPacketPaisa: number;
    };
  }>;
}

export interface ReceivablesReport {
  totalCollectedInPeriodPaisa: number;
  totalOutstandingPaisa: number;
  payments: Array<{
    id: string;
    paymentNo: string;
    receivedAt: string;
    customerName: string;
    invoiceNo: string;
    method: string;
    referenceNo: string | null;
    amountPaisa: number;
    recordedByName: string;
  }>;
  customerAgeing: Array<{
    customerId: string;
    customerName: string;
    customerType: string;
    stateName: string;
    totalInvoicedPaisa: number;
    totalCollectedPaisa: number;
    netOutstandingPaisa: number;
    bucket0to30Paisa: number;
    bucket31to60Paisa: number;
    bucket61to90Paisa: number;
    bucket90PlusPaisa: number;
  }>;
}
