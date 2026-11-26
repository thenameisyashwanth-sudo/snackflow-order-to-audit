import {
  GstSummaryReport,
  OwnerExecutiveSummary,
  ProductionReport,
  PurchaseRegisterReport,
  ReceivablesReport,
  SalesRegisterReport,
  StockAndLedgerReport,
} from '../types/reports';
import { apiRequest, getStoredToken } from './client';

function buildRangeQs(fromDate?: string, toDate?: string): string {
  const sp = new URLSearchParams();
  if (fromDate) sp.set('fromDate', fromDate);
  if (toDate) sp.set('toDate', toDate);
  const str = sp.toString();
  return str ? `?${str}` : '';
}

export function fetchOwnerSummary() {
  return apiRequest<OwnerExecutiveSummary>('/reports/owner-summary');
}

export function fetchSalesReport(fromDate?: string, toDate?: string) {
  return apiRequest<SalesRegisterReport>(`/reports/sales${buildRangeQs(fromDate, toDate)}`);
}

export function fetchGstReport(fromDate?: string, toDate?: string) {
  return apiRequest<GstSummaryReport>(`/reports/gst${buildRangeQs(fromDate, toDate)}`);
}

export function fetchPurchaseReport(fromDate?: string, toDate?: string) {
  return apiRequest<PurchaseRegisterReport>(
    `/reports/purchases${buildRangeQs(fromDate, toDate)}`
  );
}

export function fetchStockReport(fromDate?: string, toDate?: string) {
  return apiRequest<StockAndLedgerReport>(`/reports/stock${buildRangeQs(fromDate, toDate)}`);
}

export function fetchProductionReport(fromDate?: string, toDate?: string) {
  return apiRequest<ProductionReport>(`/reports/production${buildRangeQs(fromDate, toDate)}`);
}

export function fetchReceivablesReport(fromDate?: string, toDate?: string) {
  return apiRequest<ReceivablesReport>(
    `/reports/receivables${buildRangeQs(fromDate, toDate)}`
  );
}

export async function downloadReportExport(
  reportType: 'sales' | 'gst' | 'purchases' | 'stock' | 'production' | 'receivables',
  format: 'xlsx' | 'csv' | 'pdf' | 'tally',
  fromDate?: string,
  toDate?: string
): Promise<void> {
  const apiBase = import.meta.env.VITE_API_URL ?? '/api';
  const token = getStoredToken();
  const sp = new URLSearchParams({ format });
  if (fromDate) sp.set('fromDate', fromDate);
  if (toDate) sp.set('toDate', toDate);

  const res = await fetch(`${apiBase}/reports/${reportType}/export?${sp.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const ext = format === 'tally' ? 'xml' : format;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snackflow-${reportType}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
