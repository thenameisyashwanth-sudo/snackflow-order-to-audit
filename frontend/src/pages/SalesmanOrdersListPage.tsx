import { CheckCircle2, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchSalesOrders } from '../api/orders';
import { CustomerSalesSummary, SalesOrderRecord } from '../types/orders';
import { formatINR } from '../utils/format';
import { ORDER_STATUS_BADGE } from '../utils/offlineOrders';

export default function SalesmanOrdersListPage() {
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [summary, setSummary] = useState<CustomerSalesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSalesOrders()
      .then((res) => {
        setOrders(res.orders);
        setSummary(res.customerSalesSummary);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load your orders');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-stone-500">Loading your orders...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">My Orders & Customer-Wise Sales</h1>
        <p className="text-sm text-stone-600">
          Real-time order statuses (submitted → approved → invoiced → dispatched) scoped to your
          salesman account.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Customer-wise summary */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-stone-900">Customer-Wise Sales Summary</h2>
        {summary.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No sales orders placed yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Type / State</th>
                  <th className="px-3 py-2">Orders</th>
                  <th className="px-3 py-2">Packets</th>
                  <th className="px-3 py-2">Taxable</th>
                  <th className="px-3 py-2">Total (incl. GST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {summary.map((row) => (
                  <tr key={row.customerId}>
                    <td className="px-3 py-2.5 font-semibold text-stone-900">
                      {row.customerName}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">
                      {row.customerType} · {row.stateName} ({row.stateCode})
                    </td>
                    <td className="px-3 py-2.5">{row.orderCount}</td>
                    <td className="px-3 py-2.5 font-medium">{row.totalPackets}</td>
                    <td className="px-3 py-2.5">{formatINR(row.totalTaxablePaisa)}</td>
                    <td className="px-3 py-2.5 font-bold text-stone-900">
                      {formatINR(row.totalWithGstPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order List */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3">
          <ShoppingBag className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">Order History ({orders.length})</h2>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-stone-500">No orders placed yet.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((ord) => (
              <div key={ord.id} className="rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-stone-900">{ord.orderNo}</span>
                    <span className="mx-2 text-stone-300">·</span>
                    <span className="font-medium text-stone-800">{ord.customer.name}</span>
                    <span className="ml-2 text-xs text-stone-500">
                      {new Date(ord.orderDate).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      ORDER_STATUS_BADGE[ord.status] ?? 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {ord.status}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="text-stone-600">
                    {ord.items
                      .map((i) => `${i.productSku.name} × ${i.qtyPackets} pkts`)
                      .join(', ')}
                  </div>
                  <div className="font-bold text-stone-900">{formatINR(ord.totalPaisa)}</div>
                </div>

                {ord.invoice && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Invoice {ord.invoice.invoiceNo} ({ord.invoice.status})
                    {ord.invoice.dispatchedAt ? ' · Dispatched' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
