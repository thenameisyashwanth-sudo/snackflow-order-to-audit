import {
  CustomerReceivable,
  CustomerSalesSummary,
  InvoiceRecord,
  PaymentRecord,
  SalesOrderRecord,
  SalesmanVisitRecord,
} from '../types/orders';
import { apiRequest, getStoredToken } from './client';

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

export function verifySalesOrder(
  orderId: string,
  payload: {
    action: 'APPROVE' | 'REJECT' | 'UPDATE_ONLY';
    rejectionReason?: string;
    items?: Array<{
      productSkuId: string;
      qtyPackets: number;
      unitPricePaisa: number;
    }>;
  }
) {
  return apiRequest<{ order: SalesOrderRecord }>(`/orders/${orderId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function raiseInvoiceForOrder(orderId: string, autoApprove = true) {
  return apiRequest<{ invoice: InvoiceRecord }>(`/orders/${orderId}/invoice`, {
    method: 'POST',
    body: JSON.stringify({ autoApprove }),
  });
}

export function fetchInvoices() {
  return apiRequest<{ invoices: InvoiceRecord[] }>('/invoices');
}

export function dispatchInvoiceRequest(invoiceId: string) {
  return apiRequest<{ invoice: InvoiceRecord }>(`/invoices/${invoiceId}/dispatch`, {
    method: 'POST',
  });
}

export function cancelInvoiceRequest(
  invoiceId: string,
  payload: { reason: string; restockGoods?: boolean }
) {
  return apiRequest<{ invoice: InvoiceRecord; creditNote: { creditNoteNo: string } }>(
    `/invoices/${invoiceId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function downloadInvoicePdf(invoiceId: string, invoiceNo: string): Promise<void> {
  const apiBase = import.meta.env.VITE_API_URL ?? '/api';
  const token = getStoredToken();
  const res = await fetch(`${apiBase}/invoices/${invoiceId}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Unable to download invoice PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Invoice-${invoiceNo.replace(/[/\\]/g, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fetchEInvoiceJson(invoiceId: string) {
  return apiRequest<{ einvoice: Record<string, unknown> }>(
    `/invoices/${invoiceId}/einvoice-json`
  );
}

export function fetchPaymentsAndReceivables() {
  return apiRequest<{
    payments: PaymentRecord[];
    receivables: CustomerReceivable[];
    openInvoices: Array<{
      id: string;
      invoiceNo: string;
      customerId: string;
      totalPaisa: number;
      paidPaisa: number;
      outstandingPaisa: number;
      customer: { id: string; name: string };
    }>;
  }>('/payments');
}

export function recordCustomerPayment(payload: {
  customerId: string;
  invoiceId?: string;
  amountPaisa: number;
  method: 'CASH' | 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'BANK_TRANSFER';
  referenceNo?: string;
  notes?: string;
}) {
  return apiRequest<{ payment: PaymentRecord }>('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
