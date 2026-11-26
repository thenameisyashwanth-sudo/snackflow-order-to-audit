import { IndianRupee, Plus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPaymentsAndReceivables,
  recordCustomerPayment,
} from '../api/orders';
import { CustomerReceivable, PaymentRecord } from '../types/orders';
import { formatINR, rupeesInputToPaisa } from '../utils/format';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [openInvoices, setOpenInvoices] = useState<
    Array<{
      id: string;
      invoiceNo: string;
      customerId: string;
      totalPaisa: number;
      paidPaisa: number;
      outstandingPaisa: number;
      customer: { id: string; name: string };
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amountRupees, setAmountRupees] = useState('4000');
  const [method, setMethod] = useState<'UPI' | 'NEFT_RTGS' | 'CASH' | 'CHEQUE'>('UPI');
  const [referenceNo, setReferenceNo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPaymentsAndReceivables();
      setPayments(res.payments);
      setReceivables(res.receivables);
      setOpenInvoices(res.openInvoices);

      if (res.openInvoices.length > 0 && !invoiceId) {
        const firstInv = res.openInvoices[0];
        setCustomerId(firstInv.customerId);
        setInvoiceId(firstInv.id);
      } else if (res.receivables.length > 0 && !customerId) {
        setCustomerId(res.receivables[0].customerId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payments & receivables');
    } finally {
      setLoading(false);
    }
  }, [customerId, invoiceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const customerOpenInvoices = useMemo(
    () => openInvoices.filter((inv) => inv.customerId === customerId),
    [openInvoices, customerId]
  );

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const matching = openInvoices.find((inv) => inv.customerId === nextCustomerId);
    setInvoiceId(matching ? matching.id : '');
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const amountPaisa = rupeesInputToPaisa(amountRupees);
      const res = await recordCustomerPayment({
        customerId,
        invoiceId: invoiceId || undefined,
        amountPaisa,
        method,
        referenceNo: referenceNo || undefined,
      });
      setSuccessMsg(
        `Payment ${res.payment.paymentNo} (${formatINR(res.payment.amountPaisa)}) recorded for ${res.payment.customer.name}.`
      );
      setReferenceNo('');
      setInvoiceId('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record payment');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && payments.length === 0 && receivables.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading payments & receivables...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">
          Customer Payments & Live Receivables
        </h1>
        <p className="text-sm text-stone-600">
          Record collections against GST tax invoices and track live customer outstanding balances.
        </p>
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

      {/* Receivables Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {receivables.map((rec) => (
          <div
            key={rec.customerId}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-stone-900">{rec.customerName}</div>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                {rec.stateName}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-stone-500">Invoiced</div>
                <div className="font-semibold text-stone-900">
                  {formatINR(rec.totalInvoicedPaisa)}
                </div>
              </div>
              <div>
                <div className="text-stone-500">Collected</div>
                <div className="font-semibold text-emerald-700">
                  {formatINR(rec.totalPaidPaisa)}
                </div>
              </div>
              <div>
                <div className="text-stone-500">Outstanding</div>
                <div
                  className={`font-bold ${
                    rec.outstandingPaisa > 0 ? 'text-amber-800' : 'text-emerald-700'
                  }`}
                >
                  {formatINR(rec.outstandingPaisa)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Record Payment Form */}
      <form
        onSubmit={handleRecordPayment}
        className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <IndianRupee className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">Record Customer Collection</h2>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-5">
          <div>
            <label className="block text-xs font-semibold text-stone-600">Customer</label>
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              {receivables.map((r) => (
                <option key={r.customerId} value={r.customerId}>
                  {r.customerName} (Due: {formatINR(r.outstandingPaisa)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600">Against Invoice</label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">On-Account (Unallocated)</option>
              {customerOpenInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNo} (Due: {formatINR(inv.outstandingPaisa)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600">Method</label>
            <select
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as 'UPI' | 'NEFT_RTGS' | 'CASH' | 'CHEQUE')
              }
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="UPI">UPI</option>
              <option value="NEFT_RTGS">NEFT / RTGS</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-stone-600">Ref #</label>
              <input
                type="text"
                placeholder="UTR / UPI Ref"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
      </form>

      {/* Payment Ledger */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-stone-900">
          Collections History ({payments.length})
        </h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">No payments recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2">Payment #</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Method / Ref</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-semibold text-stone-900">{p.paymentNo}</td>
                    <td className="px-3 py-2 text-stone-600">
                      {new Date(p.receivedAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-3 py-2 font-medium text-stone-900">{p.customer.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-stone-700">
                      {p.invoice?.invoiceNo ?? 'On-Account'}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {p.method} {p.referenceNo ? `· ${p.referenceNo}` : ''}
                    </td>
                    <td className="px-3 py-2 font-bold text-emerald-700">
                      {formatINR(p.amountPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
