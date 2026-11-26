import { Plus, Truck } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPurchase, fetchMastersOverview, fetchPurchases } from '../api/erp';
import { useAuth } from '../context/AuthContext';
import { InventoryBalance, PurchaseRecord, Supplier } from '../types/erp';
import { formatBaseQty, formatINR, rupeesInputToPaisa } from '../utils/format';

export default function PurchasesPage() {
  const { user } = useAuth();
  const canRecord = user?.role === 'PRODUCTION' || user?.role === 'ADMIN';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryBalance[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [qtyDisplay, setQtyDisplay] = useState('60');
  const [ratePerDisplay, setRatePerDisplay] = useState('45');
  const [gstRatePct, setGstRatePct] = useState('5');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [masters, purRes] = await Promise.all([
        fetchMastersOverview(),
        fetchPurchases(),
      ]);
      const purchasable = masters.inventoryItems.filter(
        (i) => i.category !== 'FINISHED_GOOD'
      );
      setSuppliers(masters.suppliers);
      setItems(purchasable);
      setPurchases(purRes.purchases);

      if (masters.suppliers.length > 0 && !supplierId) {
        setSupplierId(masters.suppliers[0].id);
      }
      if (purchasable.length > 0 && !inventoryItemId) {
        setInventoryItemId(purchasable[0].inventoryItemId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [supplierId, inventoryItemId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedItem = useMemo(
    () => items.find((i) => i.inventoryItemId === inventoryItemId) ?? null,
    [items, inventoryItemId]
  );

  const previewTaxablePaisa = useMemo(() => {
    const qty = Number(qtyDisplay) || 0;
    const rate = Number(ratePerDisplay) || 0;
    return Math.round(qty * rate * 100);
  }, [qtyDisplay, ratePerDisplay]);

  const previewGstPaisa = useMemo(() => {
    const bps = Math.round((Number(gstRatePct) || 0) * 100);
    return Math.round((previewTaxablePaisa * bps) / 10000);
  }, [previewTaxablePaisa, gstRatePct]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId || !inventoryItemId) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      // Validate rate input cleanly
      rupeesInputToPaisa(Number(ratePerDisplay).toFixed(2));
      const res = await createPurchase({
        supplierId,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        items: [
          {
            inventoryItemId,
            qtyDisplay,
            ratePerDisplay,
            gstRateBps: Math.round((Number(gstRatePct) || 0) * 100),
            batchNo: batchNo || undefined,
            expiryDate: expiryDate || null,
          },
        ],
      });
      setSuccessMsg(
        `Recorded ${res.purchase.purchaseNo}. StockLedger updated and WAC recalculated.`
      );
      setSupplierInvoiceNo('');
      setBatchNo('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save purchase');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && purchases.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading purchases & suppliers...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">
          Raw Material & Packaging Receipts
        </h1>
        <p className="text-sm text-stone-600">
          Record supplier purchases into the immutable StockLedger and automatically update
          Weighted Average Cost (WAC).
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

      {canRecord && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
            <Truck className="h-5 w-5 text-amber-700" />
            <h2 className="text-base font-bold text-stone-900">Record Purchase Receipt</h2>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-stone-600">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stateName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Item (Raw / Packaging)
              </label>
              <select
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {items.map((item) => (
                  <option key={item.inventoryItemId} value={item.inventoryItemId}>
                    {item.name} (Stock: {item.closingDisplay} · WAC ₹{item.wacRateDecimal}/
                    {item.displayUnit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Supplier Invoice #
              </label>
              <input
                type="text"
                placeholder="e.g. KAM/26-27/104"
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Quantity ({selectedItem?.displayUnit ?? 'unit'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={qtyDisplay}
                onChange={(e) => setQtyDisplay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Rate per {selectedItem?.displayUnit ?? 'unit'} (₹ excl. GST)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={ratePerDisplay}
                onChange={(e) => setRatePerDisplay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">GST %</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={gstRatePct}
                onChange={(e) => setGstRatePct(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Batch Number (Optional)
              </label>
              <input
                type="text"
                placeholder="Auto-generated if blank"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-end justify-between rounded-xl bg-stone-50 px-4 py-2">
              <div className="text-xs text-stone-600">
                Taxable: <strong>{formatINR(previewTaxablePaisa)}</strong>
                <br />
                Total incl. GST: <strong>{formatINR(previewTaxablePaisa + previewGstPaisa)}</strong>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting ? 'Saving...' : 'Save Receipt'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Current WAC & Purchase History */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-stone-900">
          Purchase History ({purchases.length})
        </h2>
        {purchases.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">No purchases recorded since opening stock.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Purchase #</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Item & Qty</th>
                  <th className="px-4 py-2.5">Rate</th>
                  <th className="px-4 py-2.5">Taxable</th>
                  <th className="px-4 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-semibold text-stone-900">
                      {p.purchaseNo}
                      {p.supplierInvoiceNo && (
                        <div className="text-[11px] font-normal text-stone-500">
                          Bill: {p.supplierInvoiceNo}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600">
                      {new Date(p.purchaseDate).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-stone-800">{p.supplier.name}</td>
                    <td className="px-4 py-2.5">
                      {p.items.map((it) => (
                        <div key={it.id}>
                          {it.inventoryItem.name}:{' '}
                          <strong>
                            {formatBaseQty(
                              it.qtyBase,
                              it.inventoryItem.displayFactor,
                              it.inventoryItem.displayUnit
                            )}
                          </strong>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-stone-700">
                      {p.items.map((it) => (
                        <div key={it.id}>
                          ₹{it.ratePerDisplayDecimal}/{it.inventoryItem.displayUnit}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-stone-800">{formatINR(p.taxablePaisa)}</td>
                    <td className="px-4 py-2.5 font-semibold text-stone-900">
                      {formatINR(p.totalPaisa)}
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
