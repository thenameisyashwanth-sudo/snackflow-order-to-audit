import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  FilePlus2,
  Save,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchSalesOrders,
  raiseInvoiceForOrder,
  verifySalesOrder,
} from '../api/orders';
import { SalesOrderRecord } from '../types/orders';
import { formatINR, rupeesInputToPaisa } from '../utils/format';
import { ORDER_STATUS_BADGE } from '../utils/offlineOrders';

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // Inline edits state keyed by orderId -> lineId -> { qty, rateRupees }
  const [edits, setEdits] = useState<
    Record<string, Record<string, { qty: string; rateRupees: string }>>
  >({});

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSalesOrders();
      setOrders(res.orders);
      const nextEdits: Record<string, Record<string, { qty: string; rateRupees: string }>> = {};
      for (const o of res.orders) {
        nextEdits[o.id] = {};
        for (const it of o.items) {
          nextEdits[o.id][it.id] = {
            qty: String(it.qtyPackets),
            rateRupees: (it.unitPricePaisa / 100).toFixed(2),
          };
        }
      }
      setEdits(nextEdits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incoming orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function getEditedLines(order: SalesOrderRecord) {
    const orderEdits = edits[order.id] ?? {};
    return order.items.map((it) => {
      const e = orderEdits[it.id];
      return {
        productSkuId: it.productSkuId,
        qtyPackets: e ? Math.max(1, Number(e.qty) || it.qtyPackets) : it.qtyPackets,
        unitPricePaisa: e ? rupeesInputToPaisa(e.rateRupees) : it.unitPricePaisa,
      };
    });
  }

  async function handleSaveEdits(order: SalesOrderRecord) {
    setError(null);
    setSuccessMsg(null);
    setBusyOrderId(order.id);
    try {
      await verifySalesOrder(order.id, {
        action: 'UPDATE_ONLY',
        items: getEditedLines(order),
      });
      setSuccessMsg(`Saved edits for ${order.orderNo} and logged to Audit Trail.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleApproveAndInvoice(order: SalesOrderRecord) {
    setError(null);
    setSuccessMsg(null);
    setBusyOrderId(order.id);
    try {
      // Save any inline edits + approve
      await verifySalesOrder(order.id, {
        action: 'APPROVE',
        items: getEditedLines(order),
      });
      const invRes = await raiseInvoiceForOrder(order.id, false);
      setSuccessMsg(
        `Order ${order.orderNo} approved & GST Invoice ${invRes.invoice.invoiceNo} posted! Go to GST Invoices & Dispatch to download PDF or record dispatch.`
      );
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve & invoice order');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleReject(order: SalesOrderRecord) {
    const reason = window.prompt(`Reason for rejecting ${order.orderNo}:`, 'Customer requested hold');
    if (reason === null) return;
    setError(null);
    setSuccessMsg(null);
    setBusyOrderId(order.id);
    try {
      await verifySalesOrder(order.id, {
        action: 'REJECT',
        rejectionReason: reason,
      });
      setSuccessMsg(`Order ${order.orderNo} rejected.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setBusyOrderId(null);
    }
  }

  function handlePlanProductionForShortage(order: SalesOrderRecord) {
    const shortageLine = order.items.find((it) => !it.isStockSufficient) ?? order.items[0];
    if (!shortageLine) return;
    navigate(
      `/production/runs?skuId=${encodeURIComponent(shortageLine.productSkuId)}&batches=1`
    );
  }

  if (loading && orders.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading incoming salesman orders...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Incoming Sales Orders & Stock Verification
          </h1>
          <p className="text-sm text-stone-600">
            Verify quantities & rates, check live Finished Goods stock before approval, and raise
            GST Tax Invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/invoices')}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
        >
          View GST Invoices & Dispatch →
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No orders submitted yet. Sign in as Salesman A or Salesman B to place field orders.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isEditable = order.status === 'SUBMITTED' || order.status === 'APPROVED';
            const isBusy = busyOrderId === order.id;
            const hasShortage = !order.allItemsInStock;
            const gst = order.gstPreview;

            return (
              <div
                key={order.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-amber-700" />
                      <span className="text-base font-bold text-stone-900">{order.orderNo}</span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          ORDER_STATUS_BADGE[order.status] ?? 'bg-stone-100'
                        }`}
                      >
                        {order.status}
                      </span>
                      {order.invoice && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-900">
                          Invoice: {order.invoice.invoiceNo}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-stone-600">
                      Customer: <strong>{order.customer.name}</strong> ({order.customer.type} ·{' '}
                      {order.customer.stateName} [{order.customer.stateCode}]) · Salesman:{' '}
                      <strong>{order.salesman.name}</strong> ·{' '}
                      {new Date(order.orderDate).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-stone-900">
                      {formatINR(order.totalPaisa)}
                    </div>
                    <div className="text-xs text-stone-500">
                      {gst?.isInterState
                        ? `Taxable ${formatINR(gst.taxablePaisa)} + IGST 5% (${formatINR(gst.igstPaisa)})`
                        : gst
                          ? `Taxable ${formatINR(gst.taxablePaisa)} + CGST ${formatINR(gst.cgstPaisa)} + SGST ${formatINR(gst.sgstPaisa)}`
                          : `Taxable ${formatINR(order.subtotalPaisa)} + GST ${formatINR(order.gstPaisa)}`}
                    </div>
                  </div>
                </div>

                {/* Live Stock Availability Banner */}
                {isEditable && (
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
                      hasShortage
                        ? 'border-rose-300 bg-rose-50 text-rose-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {hasShortage ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                          <span>
                            Insufficient Stock: Shortage of {order.totalShortagePackets} packets.{' '}
                            {gst?.isInterState
                              ? `5% IGST (${formatINR(gst.igstPaisa)}) applies if invoiced after production.`
                              : 'CGST + SGST applies.'}
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>
                            Stock Covers Order — Ready for Approval & GST Invoicing (
                            {order.items
                              .map(
                                (it) =>
                                  `${it.availablePackets ?? 0} avail → ${(it.availablePackets ?? 0) - it.qtyPackets} remaining after dispatch`
                              )
                              .join('; ')}
                            )
                          </span>
                        </>
                      )}
                    </div>

                    {hasShortage && (
                      <button
                        type="button"
                        onClick={() => handlePlanProductionForShortage(order)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                      >
                        <Factory className="h-3.5 w-3.5" />
                        Plan Production Run for Shortage (1 Batch)
                      </button>
                    )}
                  </div>
                )}

                {/* Order Line Items (Inline Editable before Invoicing) */}
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                      <tr>
                        <th className="px-3 py-2">Product SKU</th>
                        <th className="px-3 py-2">FG Stock</th>
                        <th className="px-3 py-2">Ordered (Pkts)</th>
                        <th className="px-3 py-2">Rate (₹/Pkt)</th>
                        <th className="px-3 py-2">Taxable</th>
                        <th className="px-3 py-2">GST</th>
                        <th className="px-3 py-2">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {order.items.map((it) => {
                        const editRow = edits[order.id]?.[it.id];
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-medium text-stone-900">
                              {it.productSku.name}
                              <div className="font-mono text-[11px] text-stone-500">
                                HSN {it.productSku.hsnCode}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <span
                                className={`font-semibold ${
                                  it.isStockSufficient ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {it.availablePackets ?? 0} pkts
                              </span>
                              {(it.shortagePackets ?? 0) > 0 && (
                                <div className="text-rose-600">
                                  Short: {it.shortagePackets} pkts
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isEditable && editRow ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={editRow.qty}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [order.id]: {
                                        ...prev[order.id],
                                        [it.id]: { ...editRow, qty: e.target.value },
                                      },
                                    }))
                                  }
                                  className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                                />
                              ) : (
                                <span>{it.qtyPackets}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isEditable && editRow ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={editRow.rateRupees}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [order.id]: {
                                        ...prev[order.id],
                                        [it.id]: { ...editRow, rateRupees: e.target.value },
                                      },
                                    }))
                                  }
                                  className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                                />
                              ) : (
                                <span>{formatINR(it.unitPricePaisa)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{formatINR(it.taxablePaisa)}</td>
                            <td className="px-3 py-2 text-xs text-stone-600">
                              {formatINR(it.gstPaisa)} ({it.gstRateBps / 100}%)
                            </td>
                            <td className="px-3 py-2 font-semibold text-stone-900">
                              {formatINR(it.totalPaisa)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action Bar */}
                {isEditable && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleReject(order)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSaveEdits(order)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Qty/Price Edits
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || hasShortage}
                      onClick={() => void handleApproveAndInvoice(order)}
                      title={
                        hasShortage
                          ? 'Cannot approve/invoice while finished-goods stock is insufficient'
                          : 'Approve order & generate sequential GST Tax Invoice'
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      {isBusy ? 'Processing...' : 'Approve & Raise GST Invoice'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
