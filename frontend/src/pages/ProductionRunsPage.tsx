import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Edit3,
  Factory,
  Plus,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createProductionRun,
  fetchMastersOverview,
  fetchProductionRuns,
  updateProductionOverheads,
} from '../api/erp';
import { useAuth } from '../context/AuthContext';
import { InventoryBalance, ProductionRunRecord, ProductSku } from '../types/erp';
import { formatBaseQty, formatINR, rupeesInputToPaisa } from '../utils/format';

export default function ProductionRunsPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'PRODUCTION' || user?.role === 'ADMIN';
  const canEditOverheads =
    user?.role === 'PRODUCTION' || user?.role === 'ADMIN' || user?.role === 'OWNER';

  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [runs, setRuns] = useState<ProductionRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Run Form State
  const [skuId, setSkuId] = useState('');
  const [batchCount, setBatchCount] = useState('1');
  const [issueInputs, setIssueInputs] = useState<Record<string, string>>({});
  const [actualGoodPackets, setActualGoodPackets] = useState('188');
  const [damagedPouches, setDamagedPouches] = useState('6');
  const [cartonsUsed, setCartonsUsed] = useState('9');
  const [labourRupees, setLabourRupees] = useState('0');
  const [gasRupees, setGasRupees] = useState('0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Overheads Edit Modal State
  const [editingRun, setEditingRun] = useState<ProductionRunRecord | null>(null);
  const [modalLabourRupees, setModalLabourRupees] = useState('');
  const [modalGasRupees, setModalGasRupees] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [masters, runsRes] = await Promise.all([
        fetchMastersOverview(),
        fetchProductionRuns(),
      ]);
      setSkus(masters.productSkus);
      setBalances(masters.inventoryItems);
      setRuns(runsRes.runs);

      if (masters.productSkus.length > 0 && !skuId) {
        const firstSku = masters.productSkus[0];
        setSkuId(firstSku.id);
        const defaults: Record<string, string> = {};
        for (const ing of firstSku.recipe.ingredients) {
          defaults[ing.inventoryItemId] = (
            ing.standardQtyBase / ing.inventoryItem.displayFactor
          ).toString();
        }
        setIssueInputs(defaults);
      }

      if (runsRes.runs.length > 0 && !selectedRunId) {
        setSelectedRunId(runsRes.runs[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load production data');
    } finally {
      setLoading(false);
    }
  }, [skuId, selectedRunId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeSku = useMemo(() => skus.find((s) => s.id === skuId) ?? null, [skus, skuId]);
  const balanceMap = useMemo(
    () => new Map(balances.map((b) => [b.inventoryItemId, b])),
    [balances]
  );

  const numericBatches = Math.max(0.1, Number(batchCount) || 1);
  const expectedPackets = activeSku
    ? Math.round(activeSku.expectedPacketsPerBatch * numericBatches)
    : 0;

  function handleSkuChange(nextId: string) {
    setSkuId(nextId);
    const found = skus.find((s) => s.id === nextId);
    if (found) {
      const nextInputs: Record<string, string> = {};
      for (const ing of found.recipe.ingredients) {
        nextInputs[ing.inventoryItemId] = (
          (ing.standardQtyBase * numericBatches) /
          ing.inventoryItem.displayFactor
        ).toString();
      }
      setIssueInputs(nextInputs);
      setActualGoodPackets(Math.round(found.expectedPacketsPerBatch * numericBatches).toString());
    }
  }

  function handleBatchCountChange(val: string) {
    setBatchCount(val);
    const factor = Number(val);
    if (activeSku && Number.isFinite(factor) && factor > 0) {
      const nextInputs: Record<string, string> = {};
      for (const ing of activeSku.recipe.ingredients) {
        nextInputs[ing.inventoryItemId] = (
          (ing.standardQtyBase * factor) /
          ing.inventoryItem.displayFactor
        ).toString();
      }
      setIssueInputs(nextInputs);
    }
  }

  const previewYieldVariance = useMemo(() => {
    const actual = Number(actualGoodPackets) || 0;
    if (expectedPackets <= 0) return { pct: 0, flagged: false };
    const pct = Number((((actual - expectedPackets) / expectedPackets) * 100).toFixed(2));
    return { pct, flagged: Math.abs(pct) > 3 };
  }, [actualGoodPackets, expectedPackets]);

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault();
    if (!activeSku) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const rawMaterialIssues = activeSku.recipe.ingredients.map((ing) => ({
        inventoryItemId: ing.inventoryItemId,
        actualQtyDisplay: issueInputs[ing.inventoryItemId] ?? '0',
      }));

      const res = await createProductionRun({
        productSkuId: activeSku.id,
        batchCount: Number(batchCount) || 1,
        rawMaterialIssues,
        actualGoodPackets: Number(actualGoodPackets),
        damagedPouches: Number(damagedPouches) || 0,
        cartonsUsed: Number(cartonsUsed) || 0,
        labourPaisa: rupeesInputToPaisa(labourRupees || '0'),
        gasPowerPaisa: rupeesInputToPaisa(gasRupees || '0'),
        tolerancePct: 3.0,
        notes: notes || undefined,
      });

      setSuccessMsg(
        `Recorded ${res.run.runNo}: +${res.run.actualGoodPackets} packets added to Finished Goods.`
      );
      setSelectedRunId(res.run.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create production run');
    } finally {
      setSubmitting(false);
    }
  }

  function openOverheadModal(run: ProductionRunRecord) {
    setEditingRun(run);
    setModalLabourRupees((run.labourCostPaisa / 100).toFixed(2));
    setModalGasRupees((run.gasPowerCostPaisa / 100).toFixed(2));
  }

  async function handleSaveOverheads(e: FormEvent) {
    e.preventDefault();
    if (!editingRun) return;
    setModalSaving(true);
    setError(null);

    try {
      const res = await updateProductionOverheads(editingRun.id, {
        labourPaisa: rupeesInputToPaisa(modalLabourRupees || '0'),
        gasPowerPaisa: rupeesInputToPaisa(modalGasRupees || '0'),
      });
      setSuccessMsg(
        `Updated overheads for ${res.run.runNo}. Cost per packet recalculated to ${formatINR(res.run.costPerPacketPaisa)} and logged to Audit Trail.`
      );
      setEditingRun(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update overheads');
    } finally {
      setModalSaving(false);
    }
  }

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId]
  );

  if (loading && runs.length === 0 && skus.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading production BOM & runs...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            BOM Production Runs & Costing
          </h1>
          <p className="text-sm text-stone-600">
            Two-layer recipe & packaging BOM with automatic StockLedger deduction, &gt;3%
            variance flags, and WAC vs FIFO packet costing.
          </p>
        </div>
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

      {/* New Production Run Form */}
      {canCreate && activeSku && (
        <form
          onSubmit={handleCreateRun}
          className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div className="flex items-center gap-2.5">
              <Factory className="h-5 w-5 text-amber-700" />
              <h2 className="text-base font-bold text-stone-900">Log New Production Run</h2>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              Recipe: {activeSku.recipe.name} ({activeSku.recipe.batchYieldG / 1000} kg dough /
              batch) · Expected: {expectedPackets} packets
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-600">
                Product SKU (Pack Size)
              </label>
              <select
                value={skuId}
                onChange={(e) => handleSkuChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.netWeightG} g · {s.expectedPacketsPerBatch} pkts/batch · FG
                    Stock: {s.availablePackets})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">Batch Count</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={batchCount}
                onChange={(e) => handleBatchCountChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Expected Output
              </label>
              <div className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-800">
                {expectedPackets} packets
              </div>
            </div>
          </div>

          {/* Raw Materials Table */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Raw Material Issues (Planned vs Actual)
            </h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">Material</th>
                    <th className="px-4 py-2.5">Available Stock</th>
                    <th className="px-4 py-2.5">BOM Planned</th>
                    <th className="px-4 py-2.5">Actual Issued</th>
                    <th className="px-4 py-2.5">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {activeSku.recipe.ingredients.map((ing) => {
                    const item = ing.inventoryItem;
                    const plannedDisplay =
                      (ing.standardQtyBase * numericBatches) / item.displayFactor;
                    const actualVal = Number(issueInputs[item.id] ?? plannedDisplay);
                    const varPct =
                      plannedDisplay > 0
                        ? ((actualVal - plannedDisplay) / plannedDisplay) * 100
                        : 0;
                    const flagged = Math.abs(varPct) > 3;
                    const bal = balanceMap.get(item.id);

                    return (
                      <tr key={ing.id}>
                        <td className="px-4 py-2.5 font-medium text-stone-900">
                          {item.name}
                          <span className="ml-2 text-xs text-stone-400">
                            @ ₹{bal?.wacRateDecimal ?? '0.00'}/{item.displayUnit}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-stone-600">
                          {bal?.closingDisplay ?? `0 ${item.displayUnit}`}
                        </td>
                        <td className="px-4 py-2.5 text-stone-700">
                          {plannedDisplay} {item.displayUnit}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={issueInputs[item.id] ?? ''}
                              onChange={(e) =>
                                setIssueInputs((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="w-28 rounded-lg border border-stone-300 px-2.5 py-1 text-sm"
                            />
                            <span className="text-xs text-stone-500">{item.displayUnit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              flagged
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {flagged && <AlertTriangle className="h-3 w-3" />}
                            {varPct >= 0 ? `+${varPct.toFixed(1)}%` : `${varPct.toFixed(1)}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Output, Packaging Scrap & Optional Overheads */}
          <div className="mt-5 grid gap-4 sm:grid-cols-5">
            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Actual Good Packets
              </label>
              <input
                type="number"
                min="0"
                required
                value={actualGoodPackets}
                onChange={(e) => setActualGoodPackets(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    previewYieldVariance.flagged
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {previewYieldVariance.flagged && <AlertTriangle className="h-3 w-3" />}
                  Yield:{' '}
                  {previewYieldVariance.pct >= 0
                    ? `+${previewYieldVariance.pct}%`
                    : `${previewYieldVariance.pct}%`}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Damaged Pouches (Scrap)
              </label>
              <input
                type="number"
                min="0"
                value={damagedPouches}
                onChange={(e) => setDamagedPouches(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">Cartons Used</label>
              <input
                type="number"
                min="0"
                value={cartonsUsed}
                onChange={(e) => setCartonsUsed(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Labour Overhead (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={labourRupees}
                onChange={(e) => setLabourRupees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600">
                Gas / Power (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={gasRupees}
                onChange={(e) => setGasRupees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Optional floor notes (e.g., Batch 1 oil absorption higher)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {submitting ? 'Posting Ledger...' : 'Save Production Run'}
            </button>
          </div>
        </form>
      )}

      {/* Run History + Selected Cost Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-7">
          <h2 className="text-base font-bold text-stone-900">Production Runs ({runs.length})</h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">
              No production runs logged yet. Start a run above to deduct raw materials and add
              finished packets automatically.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {runs.map((run) => {
                const isSelected = selectedRun?.id === run.id;
                return (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-stone-900">{run.runNo}</span>
                        <span className="mx-2 text-stone-300">·</span>
                        <span className="font-medium text-stone-800">{run.productSku.name}</span>
                        <span className="ml-2 font-mono text-xs text-stone-500">
                          ({run.batchNo})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {run.isYieldVarianceFlagged ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                            <AlertTriangle className="h-3 w-3" />
                            Yield {Number(run.yieldVariancePct ?? 0).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Yield OK
                          </span>
                        )}

                        {run.hasConsumptionVarianceFlag && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                            <AlertTriangle className="h-3 w-3" />
                            BOM Variance &gt;3%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                      <span>
                        Output: <strong>{run.actualGoodPackets}</strong> / {run.expectedPackets}{' '}
                        expected pkts · Scrap: {run.damagedPackets} pouches
                      </span>
                      <span className="font-semibold text-stone-900">
                        Cost/Pkt: {formatINR(run.costPerPacketPaisa)} (Total{' '}
                        {formatINR(run.totalCostPaisa)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Run Costing & Variance Detail */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-5">
          {selectedRun ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-amber-700" />
                  <h2 className="text-base font-bold text-stone-900">
                    Cost Breakdown · {selectedRun.runNo}
                  </h2>
                </div>
                {canEditOverheads && (
                  <button
                    type="button"
                    onClick={() => openOverheadModal(selectedRun)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Add / Edit Overheads
                  </button>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-600">Raw Materials (WAC)</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(selectedRun.costBreakdown.rawMaterialCostPaisa)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Packaging (incl. scrap absorbed)</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(selectedRun.costBreakdown.packagingCostPaisa)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Labour Overhead</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(selectedRun.costBreakdown.labourCostPaisa)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Gas / Power Overhead</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(selectedRun.costBreakdown.gasPowerCostPaisa)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 font-bold text-stone-900">
                  <span>Total Run Cost ({selectedRun.actualGoodPackets} pkts)</span>
                  <span>{formatINR(selectedRun.costBreakdown.totalCostPaisa)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-amber-50/70 p-3.5">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-amber-900">
                    WAC Cost / Packet
                  </div>
                  <div className="text-lg font-bold text-stone-900">
                    {formatINR(selectedRun.costBreakdown.costPerPacketPaisa)}
                  </div>
                  <div className="text-[11px] text-stone-600">
                    FIFO Ref: {formatINR(selectedRun.costBreakdown.fifoCostPerPacketPaisa)}/pkt
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase text-emerald-900">
                    Gross Margin vs {formatINR(selectedRun.costBreakdown.sellingPricePaisa)}
                  </div>
                  <div className="text-lg font-bold text-emerald-700">
                    {formatINR(selectedRun.costBreakdown.grossMarginPerPacketPaisa)}
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-700">
                    {selectedRun.costBreakdown.grossMarginPct.toFixed(2)}% margin
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600 space-y-1">
                <div>
                  <strong>Valuation:</strong> {selectedRun.costBreakdown.valuationMethod}
                </div>
                <div>
                  <strong>Overhead Rule:</strong> {selectedRun.costBreakdown.overheadRule}
                </div>
              </div>

              {/* Consumption Variance Lines */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  BOM Planned vs Actual
                </h3>
                <div className="mt-2 space-y-1.5 text-xs">
                  {selectedRun.consumptions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2"
                    >
                      <div>
                        <span className="font-semibold text-stone-900">
                          {c.inventoryItem.name}
                        </span>
                        <div className="text-stone-500">
                          Plan:{' '}
                          {formatBaseQty(
                            c.plannedQtyBase,
                            c.inventoryItem.displayFactor,
                            c.inventoryItem.displayUnit
                          )}{' '}
                          · Act:{' '}
                          {formatBaseQty(
                            c.actualQtyBase + c.damagedQtyBase,
                            c.inventoryItem.displayFactor,
                            c.inventoryItem.displayUnit
                          )}
                          {c.damagedQtyBase > 0 ? ` (${c.damagedQtyBase} scrap)` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            c.isVarianceFlagged
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {Number(c.variancePct) >= 0
                            ? `+${Number(c.variancePct).toFixed(1)}%`
                            : `${Number(c.variancePct).toFixed(1)}%`}
                        </span>
                        <div className="mt-0.5 text-stone-600">{formatINR(c.totalCostPaisa)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">Select a production run to view cost breakdown.</p>
          )}
        </div>
      </div>

      {/* Add/Edit Overheads Modal */}
      {editingRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900">
                Update Overheads · {editingRun.runNo}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRun(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Updates will recalculate Finished Goods valuation and write an AuditLog entry.
            </p>

            <form onSubmit={handleSaveOverheads} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600">
                  Labour Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={modalLabourRupees}
                  onChange={(e) => setModalLabourRupees(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600">
                  Gas & Power Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={modalGasRupees}
                  onChange={(e) => setModalGasRupees(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRun(null)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  {modalSaving ? 'Saving...' : 'Save Overheads'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
