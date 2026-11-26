import { CustomerSalesSummary, SalesOrderRecord, SalesmanVisitRecord } from '../types/orders';
import { apiRequest } from './client';

export function fetchSalesOrders(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<{
    orders: SalesOrderRecord[];
    customerSalesSummary: CustomerSalesSummary[];
  }>(`/orders${qs}`);
}

export function createSalesOrder(payload: {
  customerId: string;
  clientOrderId?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  items: Array<{
    productSkuId: string;
    quantityPackets: number;
    unitPricePaisa?: number;
  }>;
}) {
  return apiRequest<{ order: SalesOrderRecord; deduplicated: boolean }>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchSalesmanVisits() {
  return apiRequest<{ visits: SalesmanVisitRecord[] }>('/orders/visits');
}

export function createSalesmanVisit(payload: {
  customerId: string;
  outcome: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}) {
  return apiRequest<{ visit: SalesmanVisitRecord }>('/orders/visits', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
