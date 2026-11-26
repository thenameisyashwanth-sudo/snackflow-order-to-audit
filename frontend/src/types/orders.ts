import { Customer, ProductSku } from '../types/erp';

export interface SalesOrderLine {
  id: string;
  productSkuId: string;
  qtyPackets: number;
  unitPricePaisa: number;
  gstRateBps: number;
  taxablePaisa: number;
  gstPaisa: number;
  totalPaisa: number;
  availablePackets?: number;
  shortagePackets?: number;
  isStockSufficient?: boolean;
  productSku: {
    id: string;
    skuCode: string;
    name: string;
    inventoryItemId: string;
    netWeightG: number;
    packetsPerCarton: number;
    hsnCode: string;
  };
}

export interface SalesOrderRecord {
  id: string;
  orderNo: string;
  clientOrderId: string | null;
  customerId: string;
  salesmanId: string;
  status:
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'INVOICED'
    | 'PARTIALLY_DISPATCHED'
    | 'DISPATCHED'
    | 'CANCELLED';
  orderDate: string;
  subtotalPaisa: number;
  gstPaisa: number;
  totalPaisa: number;
  notes: string | null;
  rejectionReason: string | null;
  allItemsInStock?: boolean;
  totalShortagePackets?: number;
  customer: Customer;
  salesman: { id: string; name: string; email: string };
  invoice?: {
    id: string;
    invoiceNo: string;
    status: string;
    dispatchedAt: string | null;
    totalPaisa: number;
    paidPaisa: number;
  } | null;
  items: SalesOrderLine[];
}

export interface CustomerSalesSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  customerType: string;
  stateCode: string;
  stateName: string;
  orderCount: number;
  totalPackets: number;
  totalTaxablePaisa: number;
  totalGstPaisa: number;
  totalWithGstPaisa: number;
}

export interface QueuedOfflineOrder {
  clientOrderId: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  customerStateCode: string;
  skuName: string;
  qtyPackets: number;
  estimatedTotalPaisa: number;
  notes?: string;
  items: Array<{
    productSkuId: string;
    quantityPackets: number;
    unitPricePaisa?: number;
  }>;
}

export interface CachedSalesCatalog {
  customers: Customer[];
  productSkus: ProductSku[];
  cachedAt: string;
}

export interface SalesmanVisitRecord {
  id: string;
  visitedAt: string;
  outcome: string;
  notes: string | null;
  latitude: string | null;
  longitude: string | null;
  customer: {
    id: string;
    name: string;
    type: string;
    routeName: string | null;
    stateName: string;
  };
}
