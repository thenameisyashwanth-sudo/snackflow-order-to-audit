import {
  AlertTriangle,
  BarChart3,
  FileSpreadsheet,
  IndianRupee,
  Package,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOwnerSummary } from '../api/reports';
import { OwnerExecutiveSummary } from '../types/reports';
import { formatINR } from '../utils/format';

export default function OwnerDashboardPage() {
  const [summary, setSummary] = useState<OwnerExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOwnerSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load summary'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-stone-500">Loading owner executive dashboard...</div>;
  }

  if (error || !summary) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error ?? 'No summary data available'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Owner Executive Dashboard</h1>
          <p className="text-sm text-stone-600">
            Real-time factory pulse: today&apos;s orders, ledger stock levels, variance alerts,
            cost per packet, and outstanding customer dues.
          </p>
        </div>
        <Link
          to="/reports"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Open Monthly Audit Reports
        </Link>
      </div>

      {/* Top KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>TODAY&apos;S ORDERS</span>
            <ShoppingBag className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            {summary.todaysOrders.count} orders
          </div>
          <div className="mt-1 text-xs text-stone-600">
            Value: <strong>{formatINR(summary.todaysOrders.totalPaisa)}</strong>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>LATEST COST / PACKET</span>
            <TrendingUp className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            {summary.latestCosting
              ? formatINR(summary.latestCosting.costPerPacketPaisa)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-semibold">
            {summary.latestCosting
              ? `Margin: ${formatINR(summary.latestCosting.grossMarginPerPacketPaisa)} (${summary.latestCosting.grossMarginPct.toFixed(2)}%)`
              : 'No runs logged yet'}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>VARIANCE & STOCK ALERTS</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            {summary.varianceAlerts.length + summary.stockLevels.lowStockAlerts.length} alerts
          </div>
          <div className="mt-1 text-xs text-stone-600">
            {summary.varianceAlerts.length} production (&gt;3%) ·{' '}
            {summary.stockLevels.lowStockAlerts.length} low stock
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>OUTSTANDING DUES</span>
            <IndianRupee className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-800">
            {formatINR(summary.receivables.totalOutstandingPaisa)}
          </div>
          <div className="mt-1 text-xs text-stone-600">
            Inventory Value: <strong>{formatINR(summary.stockLevels.totalInventoryValuePaisa)}</strong>
          </div>
        </div>
      </div>

      {/* Variance Alerts & Costing Detail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h2 className="text-base font-bold text-stone-900">
              Production Variance Alerts (&gt;3% Tolerance)
            </h2>
          </div>

          {summary.varianceAlerts.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              No production variance alerts flagged yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {summary.varianceAlerts.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between font-bold text-stone-900">
                    <span>
                      {run.runNo} · {run.productName}
                    </span>
                    {run.isYieldVarianceFlagged && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">
                        Yield {run.yieldVariancePct >= 0 ? '+' : ''}
                        {run.yieldVariancePct}% ({run.actualGoodPackets}/{run.expectedPackets} pkts)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {run.consumptions
                      .filter((c) => c.isVarianceFlagged)
                      .map((c, idx) => (
                        <span
                          key={idx}
                          className="rounded-lg bg-white px-2 py-1 text-rose-800 border border-rose-200"
                        >
                          {c.itemName}: {c.actualDisplay} vs {c.plannedDisplay} (
                          {c.variancePct >= 0 ? '+' : ''}
                          {c.variancePct}%)
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Outstanding Dues */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
            <BarChart3 className="h-5 w-5 text-amber-700" />
            <h2 className="text-base font-bold text-stone-900">
              Customer Receivables & Latest Costing
            </h2>
          </div>

          {summary.latestCosting && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-xs">
              <div className="font-bold text-amber-950">
                Latest Run ({summary.latestCosting.runNo} · {summary.latestCosting.productName})
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-stone-700">
                <span>
                  WAC Cost: <strong>{formatINR(summary.latestCosting.costPerPacketPaisa)}/pkt</strong>{' '}
                  (FIFO: {formatINR(summary.latestCosting.fifoCostPerPacketPaisa)}/pkt)
                </span>
                <span>
                  Sell: <strong>{formatINR(summary.latestCosting.sellingPricePaisa)}/pkt</strong> ·{' '}
                  Margin: <strong className="text-emerald-700">{summary.latestCosting.grossMarginPct}%</strong>
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {summary.receivables.customerDues.length === 0 ? (
              <p className="text-sm text-stone-500">No invoiced receivables yet.</p>
            ) : (
              summary.receivables.customerDues.map((c) => (
                <div
                  key={c.customerId}
                  className="flex items-center justify-between rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="font-bold text-stone-900">{c.customerName}</div>
                    <div className="text-stone-500">
                      Invoiced {formatINR(c.totalInvoicedPaisa)} · Collected{' '}
                      {formatINR(c.totalCollectedPaisa)}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-amber-800">
                    {formatINR(c.netOutstandingPaisa)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live Stock Levels Across All 3 Categories */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Package className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">Live Stock Levels</h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { title: 'Raw Materials', items: summary.stockLevels.rawMaterials },
            { title: 'Packaging Materials', items: summary.stockLevels.packagingMaterials },
            { title: 'Finished Goods', items: summary.stockLevels.finishedGoods },
          ].map((group) => (
            <div key={group.title} className="rounded-xl border border-stone-200 p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
                {group.title}
              </h3>
              {group.items.map((item) => (
                <div
                  key={item.inventoryItemId}
                  className="flex items-center justify-between text-xs border-b border-stone-100 pb-1.5 last:border-none"
                >
                  <div>
                    <span className="font-semibold text-stone-900">{item.name}</span>
                    {item.isLowStock && (
                      <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                        Low
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-stone-900">{item.closingDisplay}</div>
                    <div className="text-[11px] text-stone-500">
                      {formatINR(item.closingValuePaisa)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
