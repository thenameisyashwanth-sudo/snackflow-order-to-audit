import { AlertTriangle, Layers, Warehouse } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchInventoryBalances, fetchStockLedger } from '../api/erp';
import { InventoryBalance, ItemCategory, StockLedgerEntry } from '../types/erp';
import { formatBaseQty, formatINR } from '../utils/format';

const CATEGORY_TABS: Array<{ id: 'ALL' | ItemCategory; label: string }> = [
  { id: 'ALL', label: 'All Stock' },
  { id: 'RAW_MATERIAL', label: 'Raw Materials' },
  { id: 'PACKAGING', label: 'Packaging' },
  { id: 'FINISHED_GOOD', label: 'Finished Goods' },
];

export default function InventoryStockPage() {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [ledger, setLedger] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cat = categoryFilter === 'ALL' ? undefined : categoryFilter;
      const [balRes, ledRes] = await Promise.all([
        fetchInventoryBalances(cat),
        fetchStockLedger({
          category: cat,
          inventoryItemId: selectedItemId || undefined,
        }),
      ]);
      setBalances(balRes.balances);
      setLedger(ledRes.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock & ledger');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, selectedItemId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalInventoryValuePaisa = useMemo(
    () => balances.reduce((sum, b) => sum + b.closingValuePaisa, 0),
    [balances]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Live Stock Summary & Immutable Stock Ledger
          </h1>
          <p className="text-sm text-stone-600">
            All balances are computed live from StockLedger: Opening + Receipts − Issues/Scrap −
            Sales + Returns ± Adjustments = Closing.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-right">
          <div className="text-[11px] font-semibold uppercase text-amber-900">
            Stock Valuation (Shown)
          </div>
          <div className="text-lg font-bold text-stone-900">
            {formatINR(totalInventoryValuePaisa)}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setCategoryFilter(tab.id);
              setSelectedItemId('');
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              categoryFilter === tab.id
                ? 'bg-amber-700 text-white'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Balances Table */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3">
          <Warehouse className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">
            Item Balances ({balances.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Opening</th>
                <th className="px-3 py-2.5">Receipts</th>
                <th className="px-3 py-2.5">Issues/Scrap</th>
                <th className="px-3 py-2.5">Sales</th>
                <th className="px-3 py-2.5">Closing</th>
                <th className="px-3 py-2.5">WAC Rate</th>
                <th className="px-3 py-2.5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {balances.map((b) => (
                <tr
                  key={b.inventoryItemId}
                  onClick={() =>
                    setSelectedItemId((prev) =>
                      prev === b.inventoryItemId ? '' : b.inventoryItemId
                    )
                  }
                  className={`cursor-pointer transition hover:bg-amber-50/40 ${
                    selectedItemId === b.inventoryItemId ? 'bg-amber-50/60' : ''
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-stone-900">{b.name}</div>
                    <div className="font-mono text-[11px] text-stone-500">{b.skuCode}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-stone-600">{b.category}</td>
                  <td className="px-3 py-2.5 text-stone-700">
                    {formatBaseQty(b.openingQtyBase, b.displayFactor, b.displayUnit)}
                  </td>
                  <td className="px-3 py-2.5 text-emerald-700">
                    +{formatBaseQty(b.receiptsQtyBase, b.displayFactor, b.displayUnit)}
                  </td>
                  <td className="px-3 py-2.5 text-amber-800">
                    -{formatBaseQty(b.issuesScrapQtyBase, b.displayFactor, b.displayUnit)}
                  </td>
                  <td className="px-3 py-2.5 text-sky-800">
                    -{formatBaseQty(b.salesDispatchQtyBase, b.displayFactor, b.displayUnit)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-stone-900">
                      <span>{b.closingDisplay}</span>
                      {b.isLowStock && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                          <AlertTriangle className="h-3 w-3" /> Low
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-stone-700">
                    ₹{b.wacRateDecimal}/{b.displayUnit}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-stone-900">
                    {formatINR(b.closingValuePaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable Double-Entry Stock Ledger */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-700" />
            <h2 className="text-base font-bold text-stone-900">
              Stock Ledger Movements ({ledger.length})
            </h2>
          </div>
          {selectedItemId && (
            <button
              type="button"
              onClick={() => setSelectedItemId('')}
              className="text-xs font-semibold text-amber-700 hover:underline"
            >
              Clear item filter
            </button>
          )}
        </div>

        {loading && ledger.length === 0 ? (
          <p className="text-sm text-stone-500">Loading ledger entries...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">Movement</th>
                  <th className="px-3 py-2.5">Qty Delta</th>
                  <th className="px-3 py-2.5">Unit Rate</th>
                  <th className="px-3 py-2.5">Value</th>
                  <th className="px-3 py-2.5">Source / Notes</th>
                  <th className="px-3 py-2.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {ledger.map((row) => {
                  const isPositive = row.qtyBaseDelta >= 0;
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-stone-500">
                        {new Date(row.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 font-medium text-stone-900">
                        {row.inventoryItem.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-stone-700">
                          {row.movementType}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 font-semibold ${
                          isPositive ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatBaseQty(
                          row.qtyBaseDelta,
                          row.inventoryItem.displayFactor,
                          row.inventoryItem.displayUnit
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-stone-600">
                        ₹{row.unitCostDecimal}/{row.inventoryItem.displayUnit}
                      </td>
                      <td className="px-3 py-2 font-medium text-stone-900">
                        {formatINR(row.totalValuePaisa)}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600">
                        <span className="font-mono text-stone-500">{row.sourceType}</span>
                        {row.batchNo && <span className="ml-1">[{row.batchNo}]</span>}
                        {row.notes && <div className="text-stone-500">{row.notes}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600">
                        {row.createdBy.name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
