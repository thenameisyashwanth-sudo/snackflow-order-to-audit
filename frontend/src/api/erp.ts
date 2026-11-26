import {
  Customer,
  InventoryBalance,
  ProductionRunRecord,
  ProductSku,
  PurchaseRecord,
  RecipeMaster,
  StockLedgerEntry,
  Supplier,
} from '../types/erp';
import { apiRequest } from './client';

export function fetchMastersOverview() {
  return apiRequest<{
    inventoryItems: InventoryBalance[];
    suppliers: Supplier[];
    customers: Customer[];
    recipes: RecipeMaster[];
    productSkus: ProductSku[];
  }>('/masters/overview');
}

export function createProductSku(payload: {
  name: string;
  nameTamil?: string;
  skuCode?: string;
  recipeId: string;
  netWeightG: number;
  packetsPerCarton: number;
  sellingPricePaisa: number;
  gstRateBps: number;
  hsnCode: string;
  shelfLifeDays?: number;
  pouchPackagingItemId?: string;
  cartonPackagingItemId?: string;
}) {
  return apiRequest<{ productSku: ProductSku }>('/masters/skus', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchInventoryBalances(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiRequest<{ balances: InventoryBalance[] }>(`/inventory/balances${qs}`);
}

export function fetchStockLedger(params?: {
  inventoryItemId?: string;
  category?: string;
  movementType?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.inventoryItemId) sp.set('inventoryItemId', params.inventoryItemId);
  if (params?.category) sp.set('category', params.category);
  if (params?.movementType) sp.set('movementType', params.movementType);
  const qs = sp.toString();
  return apiRequest<{ entries: StockLedgerEntry[] }>(
    `/inventory/ledger${qs ? `?${qs}` : ''}`
  );
}

export function fetchPurchases() {
  return apiRequest<{ purchases: PurchaseRecord[] }>('/purchases');
}

export function createPurchase(payload: {
  supplierId: string;
  supplierInvoiceNo?: string;
  purchaseDate?: string;
  notes?: string;
  items: Array<{
    inventoryItemId: string;
    qtyDisplay: string | number;
    ratePerDisplay: string | number;
    gstRateBps?: number;
    batchNo?: string;
    expiryDate?: string | null;
  }>;
}) {
  return apiRequest<{ purchase: PurchaseRecord }>('/purchases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchProductionRuns() {
  return apiRequest<{ runs: ProductionRunRecord[] }>('/production-runs');
}

export function createProductionRun(payload: {
  productSkuId: string;
  batchCount: number;
  rawMaterialIssues: Array<{
    inventoryItemId: string;
    actualQtyDisplay: string | number;
  }>;
  actualGoodPackets: number;
  damagedPouches: number;
  cartonsUsed: number;
  labourPaisa: number;
  gasPowerPaisa: number;
  otherOverheadPaisa?: number;
  tolerancePct?: number;
  notes?: string;
}) {
  return apiRequest<{ run: ProductionRunRecord }>('/production-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProductionOverheads(
  runId: string,
  payload: {
    labourPaisa: number;
    gasPowerPaisa: number;
    otherOverheadPaisa?: number;
    notes?: string;
  }
) {
  return apiRequest<{ run: ProductionRunRecord }>(
    `/production-runs/${runId}/overheads`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}
