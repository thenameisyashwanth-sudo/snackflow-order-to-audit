import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  FileText,
  IndianRupee,
  PackageCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '../types/auth';
import { OwnerExecutiveSummary } from '../types/reports';
import { formatINR } from '../utils/format';

export default function TwoLoopFactoryFlow({
  summary,
  role,
}: {
  summary: OwnerExecutiveSummary;
  role: UserRole;
}) {
  const navigate = useNavigate();
  const isAdmin = role === 'ADMIN';
  const lm = summary.loopMetrics;

  const totalFgPackets =
    lm?.totalFgPackets ??
    summary.stockLevels.finishedGoods.reduce((s, b) => s + b.closingQtyBase, 0);
  const rawPkgValue =
    lm?.rawPkgValuePaisa ??
    [...summary.stockLevels.rawMaterials, ...summary.stockLevels.packagingMaterials].reduce(
      (s, b) => s + b.closingValuePaisa,
      0
    );

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white via-amber-50/30 to-stone-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Live Two-Loop Factory Flow (Section 2 Architecture)
          </h2>
          <p className="text-xs text-stone-600">
            Production Loop &amp; Sales Loop converge at <strong>Finished Goods Stock</strong> —
            click any stage to inspect live records.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900">
          Single-Entry Ledger Sync
        </span>
      </div>

      {/* LOOP 2: PRODUCTION LOOP */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
          Loop 2 · Production Loop (Purchases → BOM Production → Finished Goods)
        </div>
        <div className="grid gap-2 lg:grid-cols-7 lg:items-center">
          {/* Node 1: Raw Purchases */}
          <button
            type="button"
            onClick={() => navigate(isAdmin ? '/purchases' : '/reports')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-emerald-700">
              <Truck className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Purchases</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {lm?.purchaseLineCount ?? 0} receipts
            </div>
            <div className="text-[11px] text-stone-500">
              {formatINR(lm?.purchaseTotalPaisa ?? 0)}
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-emerald-600" />
          </div>

          {/* Node 2: Raw & Packaging Stock */}
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-emerald-700">
              <Boxes className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Raw &amp; Pkg</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {formatINR(rawPkgValue)}
            </div>
            <div className="text-[11px] text-stone-500">
              {summary.stockLevels.lowStockAlerts.length > 0 ? (
                <span className="font-semibold text-rose-600">
                  {summary.stockLevels.lowStockAlerts.length} low-stock alerts
                </span>
              ) : (
                `${lm?.rawPkgItemCount ?? 5} items healthy`
              )}
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-emerald-600" />
          </div>

          {/* Node 3: Production Run */}
          <button
            type="button"
            onClick={() => navigate('/production/runs')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-emerald-700">
              <Factory className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">BOM Run</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {summary.latestCosting
                ? `${formatINR(summary.latestCosting.costPerPacketPaisa)}/pkt`
                : `${lm?.productionRunCount ?? 0} runs`}
            </div>
            <div className="text-[11px]">
              {summary.varianceAlerts.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 font-semibold text-rose-600">
                  <AlertTriangle className="h-3 w-3" /> {summary.varianceAlerts.length} variance
                  &gt;3%
                </span>
              ) : (
                <span className="text-stone-500">
                  {summary.latestCosting
                    ? `${summary.latestCosting.actualGoodPackets} good pkts`
                    : 'No runs yet'}
                </span>
              )}
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-amber-700" />
          </div>

          {/* Convergence Node: Finished Goods Stock */}
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="lg:col-span-1 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-amber-100/80 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-amber-900">
              <PackageCheck className="h-4 w-4" />
              <span className="text-[10px] font-extrabold uppercase">FG Hub</span>
            </div>
            <div className="mt-1.5 text-sm font-extrabold text-stone-900">
              {totalFgPackets} pkts
            </div>
            <div className="text-[11px] font-medium text-amber-900">
              Finished Goods Stock
            </div>
          </button>
        </div>
      </div>

      {/* Convergence Connector */}
      <div className="my-2 hidden items-center justify-end pr-12 lg:flex">
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
          <ArrowDown className="h-3 w-3" />
          Both Loops Meet Here
        </div>
      </div>

      {/* LOOP 1: SALES LOOP */}
      <div className="mt-3 lg:mt-0">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-800">
          Loop 1 · Sales Loop (Orders → GST Invoice → Dispatch from FG Stock → Collections)
        </div>
        <div className="grid gap-2 lg:grid-cols-7 lg:items-center">
          {/* Node 5: Field Sales Orders */}
          <button
            type="button"
            onClick={() => navigate(isAdmin ? '/admin/orders' : '/reports')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-sky-700">
              <ShoppingBag className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Orders</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {summary.todaysOrders.count} today
            </div>
            <div className="text-[11px] text-stone-500">
              {lm?.submittedOrdersCount ?? 0} pending verify
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-sky-600" />
          </div>

          {/* Node 6: Admin Verify & GST Invoice */}
          <button
            type="button"
            onClick={() => navigate(isAdmin ? '/admin/invoices' : '/reports')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-sky-700">
              <FileText className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">GST Bill</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {lm?.postedInvoiceCount ?? 0} invoices
            </div>
            <div className="text-[11px] text-stone-500">
              {formatINR(lm?.postedInvoiceTotalPaisa ?? 0)}
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-sky-600" />
          </div>

          {/* Node 7: Dispatch */}
          <button
            type="button"
            onClick={() => navigate(isAdmin ? '/admin/invoices' : '/inventory')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-sky-700">
              <ClipboardCheck className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Dispatch</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {lm?.dispatchedInvoiceCount ?? 0} dispatched
            </div>
            <div className="text-[11px] text-emerald-700 inline-flex items-center gap-0.5">
              <CheckCircle2 className="h-3 w-3" /> Deducts FG Stock
            </div>
          </button>

          <div className="hidden justify-center lg:flex">
            <ArrowRight className="h-4 w-4 text-sky-600" />
          </div>

          {/* Node 8: Collections & Receivables */}
          <button
            type="button"
            onClick={() => navigate(isAdmin ? '/admin/payments' : '/reports')}
            className="lg:col-span-1 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-sky-700">
              <IndianRupee className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase">Collections</span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-amber-800">
              {formatINR(summary.receivables.totalOutstandingPaisa)} due
            </div>
            <div className="text-[11px] text-emerald-700">
              {formatINR(lm?.totalCollectedPaisa ?? 0)} collected
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
