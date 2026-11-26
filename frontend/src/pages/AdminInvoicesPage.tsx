import {
  Ban,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Truck,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  cancelInvoiceRequest,
  dispatchInvoiceRequest,
  downloadInvoicePdf,
  fetchEInvoiceJson,
  fetchInvoices,
} from '../api/orders';
import { InvoiceRecord } from '../types/orders';
import { formatINR } from '../utils/format';

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Credit Note Cancel Modal
  const [cancellingInv, setCancellingInv] = useState<InvoiceRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('Customer cancelled order / price correction');
  const [restockGoods, setRestockGoods] = useState(true);

  // e-Invoice / e-Way Bill JSON Modal
  const [einvoiceModal, setEinvoiceModal] = useState<{
    invoiceNo: string;
    jsonText: string;
  } | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchInvoices();
      setInvoices(res.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  async function handleDispatch(inv: InvoiceRecord) {
    setError(null);
    setSuccessMsg(null);
    setBusyId(inv.id);
    try {
      await dispatchInvoiceRequest(inv.id);
      setSuccessMsg(
        `Invoice ${inv.invoiceNo} dispatched! Finished Goods StockLedger deducted automatically.`
      );
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to dispatch invoice');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownloadPdf(inv: InvoiceRecord) {
    setError(null);
    try {
      await downloadInvoicePdf(inv.id, inv.invoiceNo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PDF');
    }
  }

  async function handleViewEInvoice(inv: InvoiceRecord) {
    setError(null);
    setCopiedJson(false);
    try {
      const res = await fetchEInvoiceJson(inv.id);
      setEinvoiceModal({
        invoiceNo: inv.invoiceNo,
        jsonText: JSON.stringify(res.einvoice, null, 2),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch e-Invoice JSON');
    }
  }

  async function handleCopyJson() {
    if (!einvoiceModal) return;
    await navigator.clipboard.writeText(einvoiceModal.jsonText);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  async function handleConfirmCancel(e: FormEvent) {
    e.preventDefault();
    if (!cancellingInv) return;
    setError(null);
    setSuccessMsg(null);
    setBusyId(cancellingInv.id);
    try {
      const res = await cancelInvoiceRequest(cancellingInv.id, {
        reason: cancelReason,
        restockGoods,
      });
      setSuccessMsg(
        `Invoice ${cancellingInv.invoiceNo} cancelled via Credit Note ${res.creditNote.creditNoteNo} (logged to Audit Trail).`
      );
      setCancellingInv(null);
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invoice');
    } finally {
      setBusyId(null);
    }
  }

  function buildShareMessage(inv: InvoiceRecord): string {
    return [
      `GST Tax Invoice ${inv.invoiceNo} from Kaveri Traditional Snacks Pvt Ltd`,
      `Customer: ${inv.customer.name}`,
      `Taxable: ${formatINR(inv.taxablePaisa)}`,
      inv.isInterState
        ? `IGST: ${formatINR(inv.igstPaisa)}`
        : `CGST: ${formatINR(inv.cgstPaisa)} + SGST: ${formatINR(inv.sgstPaisa)}`,
      `Grand Total: ${formatINR(inv.totalPaisa)}`,
      `Outstanding: ${formatINR(inv.outstandingPaisa)}`,
    ].join('\n');
  }

  if (loading && invoices.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading GST invoices...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">
          GST Tax Invoices, Dispatch & Credit Notes
        </h1>
        <p className="text-sm text-stone-600">
          Financial-year sequential invoices (CGST+SGST / IGST), PDF downloads, WhatsApp/Email
          sharing, dispatch ledger deduction, and Credit Note cancellations.
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

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No GST invoices posted yet. Approve an incoming order in Orders & Approval to raise one.
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => {
            const shareText = encodeURIComponent(buildShareMessage(inv));
            const mailSubject = encodeURIComponent(`Tax Invoice ${inv.invoiceNo} - Kaveri Snacks`);
            const isPosted = inv.status === 'POSTED';
            const isDispatched = Boolean(inv.dispatchedAt);

            return (
              <div
                key={inv.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-5 w-5 text-amber-700" />
                      <span className="font-mono text-base font-bold text-stone-900">
                        {inv.invoiceNo}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isPosted
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {inv.status}
                      </span>
                      {isDispatched ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Dispatched
                        </span>
                      ) : (
                        isPosted && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                            Pending Dispatch
                          </span>
                        )
                      )}
                    </div>

                    <div className="mt-1 text-xs text-stone-600">
                      Customer: <strong>{inv.customer.name}</strong> (GSTIN:{' '}
                      {inv.customer.gstin ?? 'Unregistered'}) · Place of Supply:{' '}
                      <strong>
                        {inv.placeOfSupplyStateCode} - {inv.customer.stateName}
                      </strong>{' '}
                      ({inv.isInterState ? 'Inter-State IGST' : 'Intra-State CGST+SGST'})
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-stone-900">
                      {formatINR(inv.totalPaisa)}
                    </div>
                    <div className="text-xs text-stone-600">
                      Paid: {formatINR(inv.paidPaisa)} ·{' '}
                      <strong
                        className={
                          inv.outstandingPaisa > 0 ? 'text-amber-800' : 'text-emerald-700'
                        }
                      >
                        Outstanding: {formatINR(inv.outstandingPaisa)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Tax Breakdown & Items */}
                <div className="grid gap-3 rounded-xl bg-stone-50 p-3 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-stone-500">Items</div>
                    <div className="font-semibold text-stone-900">
                      {inv.items
                        .map((i) => `${i.productSku.name} × ${i.qtyPackets} pkts`)
                        .join(', ')}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-500">Taxable Value</div>
                    <div className="font-semibold text-stone-900">
                      {formatINR(inv.taxablePaisa)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-500">GST Split</div>
                    <div className="font-semibold text-stone-900">
                      {inv.isInterState
                        ? `IGST: ${formatINR(inv.igstPaisa)}`
                        : `CGST ${formatINR(inv.cgstPaisa)} + SGST ${formatINR(inv.sgstPaisa)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-500">Credit Notes</div>
                    <div className="font-semibold text-stone-900">
                      {inv.creditNotes.length > 0
                        ? inv.creditNotes.map((cn) => cn.creditNoteNo).join(', ')
                        : 'None'}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(inv)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                  >
                    <Download className="h-3.5 w-3.5 text-amber-700" />
                    Download GST PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleViewEInvoice(inv)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    e-Invoice / e-Way Bill JSON
                  </button>

                  <a
                    href={`https://wa.me/?text=${shareText}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp Share
                  </a>

                  <a
                    href={`mailto:${inv.customer.email ?? ''}?subject=${mailSubject}&body=${shareText}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>

                  {isPosted && !isDispatched && (
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => void handleDispatch(inv)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      {busyId === inv.id ? 'Dispatching...' : 'Record Dispatch'}
                    </button>
                  )}

                  {isPosted && (
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => {
                        setCancellingInv(inv);
                        setRestockGoods(Boolean(inv.dispatchedAt));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Cancel via Credit Note
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel via Credit Note Modal */}
      {cancellingInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900">
                Cancel {cancellingInv.invoiceNo} via Credit Note
              </h3>
              <button
                type="button"
                onClick={() => setCancellingInv(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Posted invoices are never deleted. A sequential Credit Note will be issued and
              logged in the Audit Trail.
            </p>

            <form onSubmit={handleConfirmCancel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600">
                  Cancellation Reason
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              {cancellingInv.dispatchedAt && (
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={restockGoods}
                    onChange={(e) => setRestockGoods(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-amber-700"
                  />
                  Restock returned packets into Finished Goods StockLedger (`CREDIT_NOTE_RETURN`)
                </label>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancellingInv(null)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700"
                >
                  Keep Invoice
                </button>
                <button
                  type="submit"
                  disabled={busyId === cancellingInv.id}
                  className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  {busyId === cancellingInv.id ? 'Issuing Credit Note...' : 'Issue Credit Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* e-Invoice / e-Way Bill JSON Modal */}
      {einvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Mock NIC e-Invoice (IRN) &amp; e-Way Bill JSON · {einvoiceModal.invoiceNo}
                </h3>
                <p className="text-xs text-stone-500">
                  GST e-Invoice v1.1 schema with deterministic SHA-256 IRN &amp; EwbDtls
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyJson()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  {copiedJson ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedJson ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => setEinvoiceModal(null)}
                  className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <pre className="mt-4 flex-1 overflow-auto rounded-xl bg-stone-950 p-4 text-xs text-emerald-300">
              {einvoiceModal.jsonText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
