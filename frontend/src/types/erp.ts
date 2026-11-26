export type ItemCategory = 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD';

export interface FefoBatchSummary {
  batchNo: string;
  expiryDate: string | null;
  remainingQtyBase: number;
  remainingDisplay: string;
  isEarliestExpiry: boolean;
}

export interface InventoryBalance {
  inventoryItemId: string;
  skuCode: string;
  name: string;
  nameTamil: string | null;
  category: ItemCategory;
  baseUnit: 'GRAM' | 'MILLILITRE' | 'PIECE';
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
  fefoBatches?: FefoBatchSummary[];
}

export interface StockLedgerEntry {
  id: string;
  inventoryItemId: string;
  movementType: string;
  qtyBaseDelta: number;
  unitCostDecimal: string;
  totalValuePaisa: number;
  batchNo: string | null;
  expiryDate: string | null;
  sourceType: string;
  sourceId: string;
  notes: string | null;
  createdAt: string;
  inventoryItem: {
    id: string;
    skuCode: string;
    name: string;
    category: ItemCategory;
    displayUnit: string;
    displayFactor: number;
  };
  createdBy: {
    id: string;
    name: string;
    role: string;
  };
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string;
  stateName: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  type: 'RETAILER' | 'DISTRIBUTOR';
  gstin: string | null;
  stateCode: string;
  stateName: string;
  routeName: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface ProductSku {
  id: string;
  skuCode: string;
  name: string;
  nameTamil: string | null;
  recipeId: string;
  inventoryItemId: string;
  netWeightG: number;
  packetsPerCarton: number;
  sellingPricePaisa: number;
  gstRateBps: number;
  hsnCode: string;
  expectedPacketsPerBatch: number;
  availablePackets: number;
  recipe: {
    id: string;
    code: string;
    name: string;
    batchYieldG: number;
    ingredients: Array<{
      id: string;
      inventoryItemId: string;
      standardQtyBase: number;
      sequence: number;
      inventoryItem: {
        id: string;
        skuCode: string;
        name: string;
        displayUnit: string;
        displayFactor: number;
      };
    }>;
  };
  packagingBom: Array<{
    id: string;
    packagingItemId: string;
    packagingRole: string;
    qtyBase: number;
    perPackets: number;
    packagingItem: {
      id: string;
      skuCode: string;
      name: string;
      displayUnit: string;
      displayFactor: number;
    };
  }>;
}

export interface PurchaseRecord {
  id: string;
  purchaseNo: string;
  supplierInvoiceNo: string | null;
  purchaseDate: string;
  taxablePaisa: number;
  gstPaisa: number;
  totalPaisa: number;
  notes: string | null;
  supplier: Supplier;
  createdBy: { id: string; name: string; role: string };
  items: Array<{
    id: string;
    qtyBase: number;
    ratePerDisplayDecimal: string;
    gstRateBps: number;
    taxablePaisa: number;
    gstPaisa: number;
    totalPaisa: number;
    batchNo: string | null;
    expiryDate: string | null;
    inventoryItem: {
      id: string;
      skuCode: string;
      name: string;
      displayUnit: string;
      displayFactor: number;
    };
  }>;
}

export interface ProductionRunRecord {
  id: string;
  runNo: string;
  productSkuId: string;
  batchCount: string;
  status: string;
  batchNo: string;
  expiryDate: string | null;
  expectedPackets: number;
  actualGoodPackets: number | null;
  damagedPackets: number;
  yieldVariancePct: string | null;
  isYieldVarianceFlagged: boolean;
  hasConsumptionVarianceFlag: boolean;
  rawMaterialCostPaisa: number;
  packagingCostPaisa: number;
  labourCostPaisa: number;
  gasPowerCostPaisa: number;
  otherOverheadPaisa: number;
  totalCostPaisa: number;
  costPerPacketPaisa: number;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  productSku: {
    id: string;
    skuCode: string;
    name: string;
    sellingPricePaisa: number;
    netWeightG: number;
    packetsPerCarton: number;
    recipe: { name: string; batchYieldG: number };
  };
  createdBy: { id: string; name: string; role: string };
  consumptions: Array<{
    id: string;
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
    inventoryItem: {
      id: string;
      name: string;
      displayUnit: string;
      displayFactor: number;
    };
  }>;
  costBreakdown: {
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
  };
}
