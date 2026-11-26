import {
  CheckCircle2,
  CloudOff,
  Package,
  RefreshCw,
  Send,
  ShoppingBag,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMastersOverview } from '../api/erp';
import { createSalesOrder, fetchSalesOrders } from '../api/orders';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Customer, ProductSku } from '../types/erp';
import {
  CustomerSalesSummary,
  QueuedOfflineOrder,
  SalesOrderRecord,
} from '../types/orders';
import { formatINR } from '../utils/format';
import {
  enqueueOfflineOrder,
  generateClientOrderId,
  getOfflineQueue,
  getSimulatedOfflineFlag,
  loadCachedSalesCatalog,
  ORDER_STATUS_BADGE,
  removeQueuedOrder,
  saveCachedSalesCatalog,
  setSimulatedOfflineFlag,
} from '../utils/offlineOrders';

const FACTORY_STATE_CODE = '33';

export default function SalesmanOrderPage() {
  const { user } = useAuth();
  const { t, localizeItemName } = useLanguage();
  const userId = user?.id ?? 'anon';

  const [customers, setCustomers] = useState<Customer[]>(() => loadCachedSalesCatalog()?.customers ?? []);
  const [skus, setSkus] = useState<ProductSku[]>(() => loadCachedSalesCatalog()?.productSkus ?? []);
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [customerSummary, setCustomerSummary] = useState<CustomerSalesSummary[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [qtyPackets, setQtyPackets] = useState(150);
  const [notes, setNotes] = useState('');

  const [navigatorOnline, setNavigatorOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOffline] = useState<boolean>(() =>
    getSimulatedOfflineFlag()
  );
  const isEffectiveOffline = !navigatorOnline || simulateOffline;

  const [offlineQueue, setOfflineQueue] = useState<QueuedOfflineOrder[]>(() =>
    getOfflineQueue(userId)
  );
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<'new' | 'orders'>('new');

  useEffect(() => {
    setOfflineQueue(getOfflineQueue(userId));
  }, [userId]);

  useEffect(() => {
    const onOnline = () => setNavigatorOnline(true);
    const onOffline = () => setNavigatorOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadOnlineData = useCallback(async () => {
    try {
      const [masters, ordersRes] = await Promise.all([
        fetchMastersOverview(),
        fetchSalesOrders(),
      ]);
      setCustomers(masters.customers);
      setSkus(masters.productSkus);
      setOrders(ordersRes.orders);
      setCustomerSummary(ordersRes.customerSalesSummary);

      saveCachedSalesCatalog({
        customers: masters.customers,
        productSkus: masters.productSkus,
        cachedAt: new Date().toISOString(),
      });

      if (masters.customers.length > 0 && !customerId) {
        setCustomerId(masters.customers[0].id);
      }
      if (masters.productSkus.length > 0 && !skuId) {
        setSkuId(masters.productSkus[0].id);
      }
    } catch {
      // Fall back to cached catalog when offline
      const cached = loadCachedSalesCatalog();
      if (cached) {
        setCustomers(cached.customers);
        setSkus(cached.productSkus);
        if (cached.customers.length > 0 && !customerId) {
          setCustomerId(cached.customers[0].id);
        }
        if (cached.productSkus.length > 0 && !skuId) {
          setSkuId(cached.productSkus[0].id);
        }
      }
    }
  }, [customerId, skuId]);

  useEffect(() => {
    if (!isEffectiveOffline) {
      void loadOnlineData();
    } else {
      const cached = loadCachedSalesCatalog();
      if (cached) {
        if (cached.customers.length > 0 && !customerId) setCustomerId(cached.customers[0].id);
        if (cached.productSkus.length > 0 && !skuId) setSkuId(cached.productSkus[0].id);
      }
    }
  }, [isEffectiveOffline, loadOnlineData, customerId, skuId]);

  const flushOfflineQueue = useCallback(async () => {
    const pending = getOfflineQueue(userId);
    if (pending.length === 0 || isEffectiveOffline || syncing) return;

    setSyncing(true);
    let syncedCount = 0;
    try {
      for (const queued of [...pending].reverse()) {
        await createSalesOrder({
          customerId: queued.customerId,
          clientOrderId: queued.clientOrderId,
          notes: queued.notes,
          items: queued.items,
        });
        removeQueuedOrder(userId, queued.clientOrderId);
        syncedCount += 1;
      }
      setOfflineQueue(getOfflineQueue(userId));
      if (syncedCount > 0) {
        setBanner({
          type: 'success',
          text: `Synced ${syncedCount} offline order${syncedCount > 1 ? 's' : ''} cleanly to the factory.`,
        });
        await loadOnlineData();
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Auto-sync encountered an error.',
      });
    } finally {
      setSyncing(false);
    }
  }, [userId, isEffectiveOffline, syncing, loadOnlineData]);

  // Auto-flush whenever connectivity returns
  useEffect(() => {
    if (!isEffectiveOffline && offlineQueue.length > 0) {
      void flushOfflineQueue();
    }
  }, [isEffectiveOffline, offlineQueue.length, flushOfflineQueue]);

  function toggleSimulateOffline() {
    const next = !simulateOffline;
    setSimulateOffline(next);
    setSimulatedOfflineFlag(next);
  }

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId]
  );
  const selectedSku = useMemo(() => skus.find((s) => s.id === skuId) ?? null, [skus, skuId]);

  const gstPreview = useMemo(() => {
    if (!selectedSku || !selectedCustomer || qtyPackets <= 0) {
      return {
        taxablePaisa: 0,
        cgstPaisa: 0,
        sgstPaisa: 0,
        igstPaisa: 0,
        totalPaisa: 0,
        isInterState: false,
      };
    }
    const taxablePaisa = qtyPackets * selectedSku.sellingPricePaisa;
    const totalGst = Math.round((taxablePaisa * selectedSku.gstRateBps) / 10000);
    const isInterState = selectedCustomer.stateCode !== FACTORY_STATE_CODE;
    if (isInterState) {
      return {
        taxablePaisa,
        cgstPaisa: 0,
        sgstPaisa: 0,
        igstPaisa: totalGst,
        totalPaisa: taxablePaisa + totalGst,
        isInterState: true,
      };
    }
    const cgstPaisa = Math.floor(totalGst / 2);
    const sgstPaisa = totalGst - cgstPaisa;
    return {
      taxablePaisa,
      cgstPaisa,
      sgstPaisa,
      igstPaisa: 0,
      totalPaisa: taxablePaisa + totalGst,
      isInterState: false,
    };
  }, [selectedSku, selectedCustomer, qtyPackets]);

  const cartonBreakdown = useMemo(() => {
    const perCarton = selectedSku?.packetsPerCarton ?? 20;
    const cartons = Math.floor(qtyPackets / perCarton);
    const loose = qtyPackets % perCarton;
    return { cartons, loose, perCarton };
  }, [selectedSku, qtyPackets]);

  async function handleSubmitOrder(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomer || !selectedSku || qtyPackets <= 0) return;

    setBanner(null);
    setSubmitting(true);
    const clientOrderId = generateClientOrderId();

    const payload = {
      customerId: selectedCustomer.id,
      clientOrderId,
      notes: notes.trim() || undefined,
      items: [
        {
          productSkuId: selectedSku.id,
          quantityPackets: qtyPackets,
          unitPricePaisa: selectedSku.sellingPricePaisa,
        },
      ],
    };

    if (isEffectiveOffline) {
      const updated = enqueueOfflineOrder(userId, {
        clientOrderId,
        createdAt: new Date().toISOString(),
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerStateCode: selectedCustomer.stateCode,
        skuName: selectedSku.name,
        qtyPackets,
        estimatedTotalPaisa: gstPreview.totalPaisa,
        notes: payload.notes,
        items: payload.items,
      });
      setOfflineQueue(updated);
      setNotes('');
      setSubmitting(false);
      setBanner({
        type: 'warn',
        text: `Saved offline (${selectedCustomer.name} · ${qtyPackets} pkts). Will auto-sync when online.`,
      });
      return;
    }

    try {
      const res = await createSalesOrder(payload);
      setNotes('');
      setBanner({
        type: 'success',
        text: `Order ${res.order.orderNo} submitted straight to the factory for ${selectedCustomer.name}!`,
      });
      await loadOnlineData();
    } catch {
      // Network failure fallback -> save offline cleanly
      const updated = enqueueOfflineOrder(userId, {
        clientOrderId,
        createdAt: new Date().toISOString(),
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerStateCode: selectedCustomer.stateCode,
        skuName: selectedSku.name,
        qtyPackets,
        estimatedTotalPaisa: gstPreview.totalPaisa,
        notes: payload.notes,
        items: payload.items,
      });
      setOfflineQueue(updated);
      setBanner({
        type: 'warn',
        text: 'Network unreachable — order safely queued offline and will auto-sync.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Mobile Header with Network / Simulate Offline Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-stone-900">{t('sales.deskTitle')}</h1>
          <p className="text-xs text-stone-500">
            Tap customer + pack qty — order goes direct to factory billing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isEffectiveOffline
                ? 'bg-amber-100 text-amber-900'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {isEffectiveOffline ? (
              <>
                <WifiOff className="h-3.5 w-3.5" /> Offline Mode
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5" /> Online
              </>
            )}
          </span>

          <button
            type="button"
            onClick={toggleSimulateOffline}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              simulateOffline
                ? 'border-amber-500 bg-amber-600 text-white'
                : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
            }`}
          >
            {simulateOffline ? 'Go Online (Sync)' : 'Simulate Offline'}
          </button>
        </div>
      </div>

      {/* Offline Pending Queue Card */}
      {offlineQueue.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <CloudOff className="h-4 w-4 text-amber-700" />
              Saved Offline — Pending Sync ({offlineQueue.length})
            </div>

            <button
              type="button"
              disabled={isEffectiveOffline || syncing}
              onClick={() => void flushOfflineQueue()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {offlineQueue.map((q) => (
              <div
                key={q.clientOrderId}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-stone-900">
                    {q.customerName} · {q.skuName} × {q.qtyPackets} pkts
                  </div>
                  <div className="text-stone-500">
                    Est. {formatINR(q.estimatedTotalPaisa)} · Queued{' '}
                    {new Date(q.createdAt).toLocaleTimeString('en-IN')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOfflineQueue(removeQueuedOrder(userId, q.clientOrderId))}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Discard queued order"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : banner.type === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Quick Sub-Tabs for Mobile */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-200/70 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className={`rounded-lg py-2 text-xs font-bold transition ${
            activeTab === 'new' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
          }`}
        >
          {t('sales.placeOrder')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`rounded-lg py-2 text-xs font-bold transition ${
            activeTab === 'orders' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
          }`}
        >
          {t('sales.myOrders')} ({orders.length})
        </button>
      </div>

      {activeTab === 'new' ? (
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          {/* Customer Picker Tap Cards */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {t('sales.selectCustomer')}
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {customers.map((c) => {
                const selected = c.id === customerId;
                const isInterState = c.stateCode !== FACTORY_STATE_CODE;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomerId(c.id)}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-600/20'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-stone-900">{c.name}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                        {c.type}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-stone-600">
                        {c.stateName} ({c.stateCode})
                      </span>
                      <span
                        className={`font-semibold ${
                          isInterState ? 'text-purple-700' : 'text-emerald-700'
                        }`}
                      >
                        {isInterState ? 'Inter-State IGST' : 'Intra-State CGST+SGST'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product & Quick Quantity Builder */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-4">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {t('sales.productQty')}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {skus.map((sku) => {
                const selected = sku.id === skuId;
                return (
                  <button
                    key={sku.id}
                    type="button"
                    onClick={() => setSkuId(sku.id)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-600/20'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-stone-900">
                        {localizeItemName(sku.name, sku.nameTamil)}
                      </div>
                      <div className="text-xs text-stone-500">
                        {formatINR(sku.sellingPricePaisa)} / pkt · GST {sku.gstRateBps / 100}%
                      </div>
                    </div>
                    <div className="text-right text-xs text-stone-600">
                      <Package className="ml-auto h-4 w-4 text-amber-700" />
                      <span>{sku.availablePackets} in stock</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-600">
                  Order Quantity (Packets)
                </label>
                <button
                  type="button"
                  onClick={() => setQtyPackets(0)}
                  className="text-xs font-semibold text-stone-500 hover:text-stone-800"
                >
                  Clear
                </button>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  required
                  value={qtyPackets || ''}
                  onChange={(e) => setQtyPackets(Math.max(0, Number(e.target.value) || 0))}
                  className="w-32 rounded-xl border border-stone-300 px-3 py-2.5 text-lg font-bold text-stone-900"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[10, 25, 50, 100].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setQtyPackets((q) => q + inc)}
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-800 active:scale-95 hover:bg-amber-50 hover:border-amber-300"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 text-xs text-stone-600">
                Packing preview:{' '}
                <strong>
                  {qtyPackets} pkts = {cartonBreakdown.cartons} cartons + {cartonBreakdown.loose}{' '}
                  loose pkts
                </strong>{' '}
                ({cartonBreakdown.perCarton} pkts/carton)
              </div>
            </div>

            <input
              type="text"
              placeholder="Optional delivery note (e.g., Afternoon route)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />

            {/* Live GST Summary & Submit */}
            <div className="rounded-xl bg-stone-50 p-3.5 text-xs space-y-1">
              <div className="flex justify-between text-stone-600">
                <span>Taxable Value</span>
                <span>{formatINR(gstPreview.taxablePaisa)}</span>
              </div>
              {gstPreview.isInterState ? (
                <div className="flex justify-between text-stone-600">
                  <span>IGST ({(selectedSku?.gstRateBps ?? 500) / 100}%)</span>
                  <span>{formatINR(gstPreview.igstPaisa)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-stone-600">
                    <span>CGST ({(selectedSku?.gstRateBps ?? 500) / 200}%)</span>
                    <span>{formatINR(gstPreview.cgstPaisa)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>SGST ({(selectedSku?.gstRateBps ?? 500) / 200}%)</span>
                    <span>{formatINR(gstPreview.sgstPaisa)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-bold text-stone-900">
                <span>Estimated Invoice Total</span>
                <span>{formatINR(gstPreview.totalPaisa)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedCustomer || !selectedSku || qtyPackets <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-700 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-800 active:scale-[0.99] disabled:opacity-50"
            >
              {isEffectiveOffline ? (
                <>
                  <CloudOff className="h-4 w-4" />
                  {t('sales.saveOffline')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {submitting ? 'Sending to Factory...' : t('sales.submitOrder')}
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Customer-wise Sales Summary */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-stone-900">My Customer-Wise Sales</h2>
            {customerSummary.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">No orders placed yet.</p>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {customerSummary.map((cs) => (
                  <div
                    key={cs.customerId}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-stone-900">
                      <span>{cs.customerName}</span>
                      <span>{formatINR(cs.totalWithGstPaisa)}</span>
                    </div>
                    <div className="mt-1 text-stone-600">
                      {cs.orderCount} order{cs.orderCount > 1 ? 's' : ''} · {cs.totalPackets} pkts
                      · {cs.stateName}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Orders List */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-amber-700" />
              <h2 className="text-sm font-bold text-stone-900">My Submitted Orders</h2>
            </div>

            {orders.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">No orders submitted yet.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="rounded-xl border border-stone-200 p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-stone-900">{ord.orderNo}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          ORDER_STATUS_BADGE[ord.status] ?? 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-stone-700">
                      <span>
                        {ord.customer.name} ({ord.customer.stateName})
                      </span>
                      <span className="font-bold text-stone-900">
                        {formatINR(ord.totalPaisa)}
                      </span>
                    </div>
                    <div className="text-stone-500">
                      {ord.items.map((it) => `${it.productSku.name} × ${it.qtyPackets} pkts`).join(', ')}
                      {ord.invoice && (
                        <span className="ml-2 inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {ord.invoice.invoiceNo}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
