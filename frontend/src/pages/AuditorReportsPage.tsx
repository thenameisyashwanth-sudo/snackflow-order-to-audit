import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  downloadReportExport,
  fetchGstReport,
  fetchProductionReport,
  fetchPurchaseReport,
  fetchReceivablesReport,
  fetchSalesReport,
  fetchStockReport,
} from '../api/reports';
import {
  GstSummaryReport,
  ProductionReport,
  PurchaseRegisterReport,
  ReceivablesReport,
  SalesRegisterReport,
  StockAndLedgerReport,
} from '../types/reports';
import { formatBaseQty, formatINR } from '../utils/format';

type ReportTab = 'sales' | 'gst' | 'purchases' | 'stock' | 'production' | 'receivables';

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'sales', label: '1. Sales Register' },
  { id: 'gst', label: '2. GST (GSTR-1 / 3B)' },
  { id: 'purchases', label: '3. Purchase Register' },
  { id: 'stock', label: '4. Stock & Ledger' },
  { id: 'production', label: '5. Production & Variance' },
  { id: 'receivables', label: '6. Payments & Ageing' },
];

function getDefaultMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
}

export default function AuditorReportsPage() {
  const defaults = getDefaultMonthRange();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [fromDate, setFromDate] = useState(defaults.fromDate);
  const [toDate, setToDate] = useState(defaults.toDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const [sales, setSales] = useState<SalesRegisterReport | null>(null);
  const [gst, setGst] = useState<GstSummaryReport | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRegisterReport | null>(null);
  const [stock, setStock] = useState<StockAndLedgerReport | null>(null);
  const [production, setProduction] = useState<ProductionReport | null>(null);
  const [receivables, setReceivables] = useState<ReceivablesReport | null>(null);

  const loadActiveReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'sales') {
        setSales(await fetchSalesReport(fromDate, toDate));
      } else if (activeTab === 'gst') {
        setGst(await fetchGstReport(fromDate, toDate));
      } else if (activeTab === 'purchases') {
        setPurchases(await fetchPurchaseReport(fromDate, toDate));
      } else if (activeTab === 'stock') {
        setStock(await fetchStockReport(fromDate, toDate));
      } else if (activeTab === 'production') {
        setProduction(await fetchProductionReport(fromDate, toDate));
      } else {
        setReceivables(await fetchReceivablesReport(fromDate, toDate));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load report');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fromDate, toDate]);

  useEffect(() => {
    void loadActiveReport();
  }, [loadActiveReport]);

  async function handleExport(format: 'xlsx' | 'csv' | 'pdf' | 'tally') {
    setExporting(format);
    setError(null);
    try {
      await downloadReportExport(activeTab, format, fromDate, toDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header & Date Filters */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-900">
              Accountant & Auditor Monthly Reports
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800">
              <Lock className="h-3 w-3" /> Read-Only Audit View
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Reconciled sales, GSTR-1/3B outward supplies, purchases, stock ledger, BOM variance,
            and customer ageing exports.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-stone-500">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-stone-500">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Report Tabs & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === t.id
                  ? 'bg-amber-700 text-white shadow-sm'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {exporting === 'xlsx' ? 'Exporting...' : 'Excel (.xlsx)'}
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('pdf')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('tally')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            <Download className="h-3.5 w-3.5" />
            Tally XML
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Loading report data...
        </div>
      ) : (
        <div className="space-y-6">
          {/* REPORT 1: SALES REGISTER */}
          {activeTab === 'sales' && sales && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-xs text-stone-500">Posted Invoices</div>
                  <div className="mt-1 text-xl font-bold">{sales.totals.invoiceCount}</div>
                  {sales.cancelledCount > 0 && (
                    <div className="text-[11px] text-rose-700">
                      +{sales.cancelledCount} cancelled via Credit Note
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-xs text-stone-500">Taxable Sales</div>
                  <div className="mt-1 text-xl font-bold">
                    {formatINR(sales.totals.taxablePaisa)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-xs text-stone-500">Total GST</div>
                  <div className="mt-1 text-xl font-bold">
                    {formatINR(
                      sales.totals.cgstPaisa + sales.totals.sgstPaisa + sales.totals.igstPaisa
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-xs text-stone-500">Gross Invoice Total</div>
                  <div className="mt-1 text-xl font-bold text-amber-800">
                    {formatINR(sales.totals.totalPaisa)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <h2 className="text-sm font-bold text-stone-900 mb-3">Invoice-Wise Register</h2>
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Pkts</th>
                      <th className="px-3 py-2">Taxable</th>
                      <th className="px-3 py-2">CGST</th>
                      <th className="px-3 py-2">SGST</th>
                      <th className="px-3 py-2">IGST</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {sales.invoices.map((inv) => (
                      <tr key={inv.id} className={inv.status === 'CANCELLED' ? 'opacity-60' : ''}>
                        <td className="px-3 py-2 font-mono font-semibold">{inv.invoiceNo}</td>
                        <td className="px-3 py-2 text-xs">
                          {inv.status}
                          {inv.creditNoteNos.length > 0 && ` (${inv.creditNoteNos.join(', ')})`}
                        </td>
                        <td className="px-3 py-2">{inv.customerName}</td>
                        <td className="px-3 py-2">{inv.totalPackets}</td>
                        <td className="px-3 py-2">{formatINR(inv.taxablePaisa)}</td>
                        <td className="px-3 py-2">{formatINR(inv.cgstPaisa)}</td>
                        <td className="px-3 py-2">{formatINR(inv.sgstPaisa)}</td>
                        <td className="px-3 py-2">{formatINR(inv.igstPaisa)}</td>
                        <td className="px-3 py-2 font-bold">{formatINR(inv.totalPaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-stone-900 mb-3">Customer-Wise Sales</h3>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 uppercase text-stone-500">
                      <tr>
                        <th className="px-2 py-2">Customer</th>
                        <th className="px-2 py-2">Pkts</th>
                        <th className="px-2 py-2">Taxable</th>
                        <th className="px-2 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {sales.customerWiseSummary.map((c) => (
                        <tr key={c.customerId}>
                          <td className="px-2 py-2 font-semibold">{c.customerName}</td>
                          <td className="px-2 py-2">{c.totalPackets}</td>
                          <td className="px-2 py-2">{formatINR(c.taxablePaisa)}</td>
                          <td className="px-2 py-2 font-bold">{formatINR(c.totalPaisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-stone-900 mb-3">Product-Wise Sales</h3>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 uppercase text-stone-500">
                      <tr>
                        <th className="px-2 py-2">Product</th>
                        <th className="px-2 py-2">HSN</th>
                        <th className="px-2 py-2">Pkts</th>
                        <th className="px-2 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {sales.productWiseSummary.map((p) => (
                        <tr key={p.productSkuId}>
                          <td className="px-2 py-2 font-semibold">{p.productName}</td>
                          <td className="px-2 py-2 font-mono">{p.hsnCode}</td>
                          <td className="px-2 py-2">{p.totalPackets}</td>
                          <td className="px-2 py-2 font-bold">{formatINR(p.totalPaisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* REPORT 2: GST SUMMARY (GSTR-1 / GSTR-3B) */}
          {activeTab === 'gst' && gst && (
            <>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <h2 className="text-sm font-bold text-stone-900 mb-3">
                  GSTR-3B · Table 3.1 Summary of Outward Taxable Supplies
                </h2>
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-3 py-2">Nature of Supplies</th>
                      <th className="px-3 py-2">Invoices</th>
                      <th className="px-3 py-2">Taxable Value</th>
                      <th className="px-3 py-2">CGST</th>
                      <th className="px-3 py-2">SGST</th>
                      <th className="px-3 py-2">IGST</th>
                      <th className="px-3 py-2">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    <tr>
                      <td className="px-3 py-2 font-medium">Intra-State (TN 33)</td>
                      <td className="px-3 py-2">{gst.gstr3bTable31.intraState.invoiceCount}</td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.intraState.taxablePaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.intraState.cgstPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.intraState.sgstPaisa)}
                      </td>
                      <td className="px-3 py-2">{formatINR(0)}</td>
                      <td className="px-3 py-2 font-semibold">
                        {formatINR(gst.gstr3bTable31.intraState.totalValuePaisa)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Inter-State (Other States)</td>
                      <td className="px-3 py-2">{gst.gstr3bTable31.interState.invoiceCount}</td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.interState.taxablePaisa)}
                      </td>
                      <td className="px-3 py-2">{formatINR(0)}</td>
                      <td className="px-3 py-2">{formatINR(0)}</td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.interState.igstPaisa)}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {formatINR(gst.gstr3bTable31.interState.totalValuePaisa)}
                      </td>
                    </tr>
                    <tr className="bg-amber-50/70 font-bold">
                      <td className="px-3 py-2">Net Outward Supplies Total</td>
                      <td className="px-3 py-2">
                        {gst.gstr3bTable31.netOutwardTotal.invoiceCount}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.netOutwardTotal.taxablePaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.netOutwardTotal.cgstPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.netOutwardTotal.sgstPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.netOutwardTotal.igstPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        {formatINR(gst.gstr3bTable31.netOutwardTotal.totalValuePaisa)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <h2 className="text-sm font-bold text-stone-900 mb-3">
                  GSTR-1 · B2B Invoice-Wise Outward Supplies
                </h2>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-3 py-2">GSTIN</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Invoice No</th>
                      <th className="px-3 py-2">POS</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Taxable</th>
                      <th className="px-3 py-2">CGST</th>
                      <th className="px-3 py-2">SGST</th>
                      <th className="px-3 py-2">IGST</th>
                      <th className="px-3 py-2">Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {gst.gstr1B2B.map((r) => (
                      <tr key={r.invoiceId}>
                        <td className="px-3 py-2 font-mono">{r.customerGstin}</td>
                        <td className="px-3 py-2 font-semibold">{r.customerName}</td>
                        <td className="px-3 py-2 font-mono">{r.invoiceNo}</td>
                        <td className="px-3 py-2">
                          {r.placeOfSupplyStateCode}-{r.placeOfSupplyStateName}
                        </td>
                        <td className="px-3 py-2">{r.gstRatePct}%</td>
                        <td className="px-3 py-2">{formatINR(r.taxablePaisa)}</td>
                        <td className="px-3 py-2">{formatINR(r.cgstPaisa)}</td>
                        <td className="px-3 py-2">{formatINR(r.sgstPaisa)}</td>
                        <td className="px-3 py-2">{formatINR(r.igstPaisa)}</td>
                        <td className="px-3 py-2 font-bold">{formatINR(r.invoiceValuePaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* REPORT 3: PURCHASE REGISTER */}
          {activeTab === 'purchases' && purchases && (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-stone-900">Supplier Purchase Register</h2>
                <span className="text-xs font-bold text-stone-800">
                  Total Purchases: {formatINR(purchases.totals.totalPaisa)} (Taxable{' '}
                  {formatINR(purchases.totals.taxablePaisa)})
                </span>
              </div>
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-stone-50 uppercase text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Purchase #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Supplier (GSTIN)</th>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Item & Qty</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">Taxable</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {purchases.rows.map((r, idx) => (
                    <tr key={`${r.purchaseId}-${idx}`}>
                      <td className="px-3 py-2 font-mono font-semibold">{r.purchaseNo}</td>
                      <td className="px-3 py-2">
                        {new Date(r.purchaseDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-3 py-2">
                        {r.supplierName}
                        <div className="font-mono text-[11px] text-stone-500">
                          {r.supplierGstin ?? '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.supplierInvoiceNo ?? '-'}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.itemName} · {r.qtyDisplay}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        ₹{r.ratePerDisplayDecimal}/{r.displayUnit}
                      </td>
                      <td className="px-3 py-2">{formatINR(r.taxablePaisa)}</td>
                      <td className="px-3 py-2 font-bold">{formatINR(r.totalPaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REPORT 4: STOCK SUMMARY & LEDGER */}
          {activeTab === 'stock' && stock && (
            <>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-stone-900">
                    Reconciled Stock Summary (Opening + Receipts − Issues/Sales ± Adjustments =
                    Closing)
                  </h2>
                  <span className="text-xs font-bold text-amber-800">
                    Total Valuation: {formatINR(stock.totalClosingValuePaisa)}
                  </span>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Opening</th>
                      <th className="px-2 py-2">Receipts</th>
                      <th className="px-2 py-2">Issues/Scrap</th>
                      <th className="px-2 py-2">Sales</th>
                      <th className="px-2 py-2">Closing</th>
                      <th className="px-2 py-2">WAC Rate</th>
                      <th className="px-2 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {[
                      ...stock.rawMaterials,
                      ...stock.packagingMaterials,
                      ...stock.finishedGoods,
                    ].map((b) => (
                      <tr key={b.inventoryItemId}>
                        <td className="px-2 py-2 text-stone-500">{b.category}</td>
                        <td className="px-2 py-2 font-semibold text-stone-900">{b.name}</td>
                        <td className="px-2 py-2">
                          {formatBaseQty(b.openingQtyBase, b.displayFactor, b.displayUnit)}
                        </td>
                        <td className="px-2 py-2 text-emerald-700">
                          +{formatBaseQty(b.receiptsQtyBase, b.displayFactor, b.displayUnit)}
                        </td>
                        <td className="px-2 py-2 text-amber-800">
                          -{formatBaseQty(b.issuesScrapQtyBase, b.displayFactor, b.displayUnit)}
                        </td>
                        <td className="px-2 py-2 text-sky-800">
                          -{formatBaseQty(b.salesDispatchQtyBase, b.displayFactor, b.displayUnit)}
                        </td>
                        <td className="px-2 py-2 font-bold">{b.closingDisplay}</td>
                        <td className="px-2 py-2 font-mono">
                          ₹{b.wacRateDecimal}/{b.displayUnit}
                        </td>
                        <td className="px-2 py-2 font-bold">{formatINR(b.closingValuePaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <h2 className="text-sm font-bold text-stone-900 mb-3">
                  Itemized Stock Ledger ({stock.ledger.length} movements)
                </h2>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Movement</th>
                      <th className="px-2 py-2">Delta</th>
                      <th className="px-2 py-2">Value</th>
                      <th className="px-2 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {stock.ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="px-2 py-2">
                          {new Date(l.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 font-semibold">{l.itemName}</td>
                        <td className="px-2 py-2 font-mono">{l.movementType}</td>
                        <td
                          className={`px-2 py-2 font-bold ${
                            l.qtyBaseDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {l.qtyDeltaDisplay}
                        </td>
                        <td className="px-2 py-2">{formatINR(l.totalValuePaisa)}</td>
                        <td className="px-2 py-2 text-stone-500">
                          {l.sourceType} {l.notes ? `· ${l.notes}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* REPORT 5: PRODUCTION & VARIANCE */}
          {activeTab === 'production' && production && (
            <div className="space-y-4">
              {production.runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2">
                    <div>
                      <span className="font-bold text-stone-900">
                        {run.runNo} · {run.productName}
                      </span>
                      <span className="ml-2 text-xs text-stone-500">
                        {new Date(run.startedAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {run.isYieldVarianceFlagged && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800">
                          <AlertTriangle className="h-3 w-3" /> Yield {run.yieldVariancePct}%
                        </span>
                      )}
                      <span className="font-bold text-stone-900">
                        WAC: {formatINR(run.costBreakdown.costPerPacketPaisa)}/pkt · Margin:{' '}
                        {run.costBreakdown.grossMarginPct}%
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-4">
                    <div>
                      Expected vs Actual:{' '}
                      <strong>
                        {run.actualGoodPackets} / {run.expectedPackets} pkts
                      </strong>
                    </div>
                    <div>
                      Scrap Pouches: <strong>{run.damagedPackets} pcs</strong>
                    </div>
                    <div>
                      Overheads:{' '}
                      <strong>
                        {formatINR(
                          run.costBreakdown.labourCostPaisa + run.costBreakdown.gasPowerCostPaisa
                        )}
                      </strong>
                    </div>
                    <div>
                      Total Cost: <strong>{formatINR(run.costBreakdown.totalCostPaisa)}</strong>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 uppercase text-stone-500">
                      <tr>
                        <th className="px-2 py-1.5">Input Material / Pkg</th>
                        <th className="px-2 py-1.5">Planned</th>
                        <th className="px-2 py-1.5">Actual</th>
                        <th className="px-2 py-1.5">Variance</th>
                        <th className="px-2 py-1.5">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {run.consumptions.map((c, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5 font-medium">{c.itemName}</td>
                          <td className="px-2 py-1.5">{c.plannedDisplay}</td>
                          <td className="px-2 py-1.5">{c.actualDisplay}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                c.isVarianceFlagged
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-stone-100 text-stone-700'
                              }`}
                            >
                              {c.variancePct >= 0 ? `+${c.variancePct}%` : `${c.variancePct}%`}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">{formatINR(c.totalCostPaisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* REPORT 6: PAYMENTS & AGEING */}
          {activeTab === 'receivables' && receivables && (
            <>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-stone-900">
                    Customer Outstanding & Ageing Analysis
                  </h2>
                  <span className="text-xs font-bold text-amber-800">
                    Total Outstanding: {formatINR(receivables.totalOutstandingPaisa)}
                  </span>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Invoiced</th>
                      <th className="px-2 py-2">Collected</th>
                      <th className="px-2 py-2">Net Due</th>
                      <th className="px-2 py-2">0–30 Days</th>
                      <th className="px-2 py-2">31–60 Days</th>
                      <th className="px-2 py-2">61–90 Days</th>
                      <th className="px-2 py-2">90+ Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {receivables.customerAgeing.map((c) => (
                      <tr key={c.customerId}>
                        <td className="px-2 py-2 font-semibold">{c.customerName}</td>
                        <td className="px-2 py-2">{formatINR(c.totalInvoicedPaisa)}</td>
                        <td className="px-2 py-2 text-emerald-700">
                          {formatINR(c.totalCollectedPaisa)}
                        </td>
                        <td className="px-2 py-2 font-bold text-amber-800">
                          {formatINR(c.netOutstandingPaisa)}
                        </td>
                        <td className="px-2 py-2">{formatINR(c.bucket0to30Paisa)}</td>
                        <td className="px-2 py-2">{formatINR(c.bucket31to60Paisa)}</td>
                        <td className="px-2 py-2">{formatINR(c.bucket61to90Paisa)}</td>
                        <td className="px-2 py-2">{formatINR(c.bucket90PlusPaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
                <h2 className="text-sm font-bold text-stone-900 mb-3">
                  Payments & Collections ({receivables.payments.length})
                </h2>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 uppercase text-stone-500">
                    <tr>
                      <th className="px-2 py-2">Payment #</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {receivables.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-2 py-2 font-semibold">{p.paymentNo}</td>
                        <td className="px-2 py-2">
                          {new Date(p.receivedAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-2 py-2">{p.customerName}</td>
                        <td className="px-2 py-2 font-mono">{p.invoiceNo}</td>
                        <td className="px-2 py-2">{p.method}</td>
                        <td className="px-2 py-2 font-bold text-emerald-700">
                          {formatINR(p.amountPaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
