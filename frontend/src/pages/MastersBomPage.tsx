import { Layers, Package, Plus, Scale, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createProductSku, fetchMastersOverview } from '../api/erp';
import { InventoryBalance, ProductSku, RecipeMaster } from '../types/erp';
import { formatBaseQty, formatINR, rupeesInputToPaisa } from '../utils/format';

export default function MastersBomPage() {
  const [recipes, setRecipes] = useState<RecipeMaster[]>([]);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [packagingItems, setPackagingItems] = useState<InventoryBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Pack Size Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('Murukku 500 g');
  const [nameTamil, setNameTamil] = useState('முறுக்கு 500 கி');
  const [recipeId, setRecipeId] = useState('');
  const [netWeightG, setNetWeightG] = useState('500');
  const [packetsPerCarton, setPacketsPerCarton] = useState('10');
  const [sellingPriceRupees, setSellingPriceRupees] = useState('120');
  const [gstPct, setGstPct] = useState('5');
  const [hsnCode, setHsnCode] = useState('19059090');
  const [pouchPackagingItemId, setPouchPackagingItemId] = useState('');
  const [cartonPackagingItemId, setCartonPackagingItemId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMasters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMastersOverview();
      setRecipes(res.recipes);
      setSkus(res.productSkus);
      const pkg = res.inventoryItems.filter((i) => i.category === 'PACKAGING');
      setPackagingItems(pkg);

      if (res.recipes.length > 0 && !recipeId) {
        setRecipeId(res.recipes[0].id);
      }
      if (!cartonPackagingItemId) {
        const carton = pkg.find((p) => p.skuCode.includes('CARTON'));
        if (carton) setCartonPackagingItemId(carton.inventoryItemId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load BOM masters');
    } finally {
      setLoading(false);
    }
  }, [recipeId, cartonPackagingItemId]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? recipes[0] ?? null,
    [recipes, recipeId]
  );

  const previewPacketsPerBatch = useMemo(() => {
    const wt = Number(netWeightG) || 0;
    if (!selectedRecipe || wt <= 0) return 0;
    return Math.floor(selectedRecipe.batchYieldG / wt);
  }, [selectedRecipe, netWeightG]);

  async function handleCreateSku(e: FormEvent) {
    e.preventDefault();
    if (!selectedRecipe) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await createProductSku({
        name: name.trim(),
        nameTamil: nameTamil.trim() || undefined,
        recipeId: selectedRecipe.id,
        netWeightG: Math.max(1, Math.trunc(Number(netWeightG))),
        packetsPerCarton: Math.max(1, Math.trunc(Number(packetsPerCarton))),
        sellingPricePaisa: rupeesInputToPaisa(sellingPriceRupees),
        gstRateBps: Math.round((Number(gstPct) || 0) * 100),
        hsnCode: hsnCode.trim(),
        pouchPackagingItemId: pouchPackagingItemId || undefined,
        cartonPackagingItemId: cartonPackagingItemId || undefined,
      });

      setSuccessMsg(
        `Added "${res.productSku.name}" sharing ${selectedRecipe.name} (${res.productSku.expectedPacketsPerBatch} packets/batch) with zero schema changes.`
      );
      setModalOpen(false);
      await loadMasters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add pack size SKU');
    } finally {
      setSaving(false);
    }
  }

  if (loading && recipes.length === 0) {
    return <div className="p-6 text-sm text-stone-500">Loading Products &amp; Two-Layer BOM...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Products, Recipes &amp; Two-Layer BOM Masters
          </h1>
          <p className="text-sm text-stone-600">
            Decoupled bulk dough recipes (Layer 1) and sellable pack-size SKUs + packaging BOM
            (Layer 2).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-800"
        >
          <Plus className="h-4 w-4" />
          Add Pack Size SKU
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

      {/* Layer 1: Bulk Recipes */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Scale className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">
            Layer 1 · Bulk Recipes ({recipes.length})
          </h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-stone-900">{recipe.name}</div>
                  <div className="font-mono text-xs text-stone-500">{recipe.code}</div>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                  Batch Yield: {(recipe.batchYieldG / 1000).toFixed(1)} kg ({recipe.batchYieldG} g)
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="font-semibold uppercase text-stone-500">Standard Ingredients</div>
                {recipe.ingredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-stone-200"
                  >
                    <span className="font-medium text-stone-900">{ing.inventoryItem.name}</span>
                    <span className="font-bold text-stone-800">
                      {formatBaseQty(
                        ing.standardQtyBase,
                        ing.inventoryItem.displayFactor,
                        ing.inventoryItem.displayUnit
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer 2: Sellable Product SKUs */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Package className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-stone-900">
            Layer 2 · Sellable Pack-Size SKUs ({skus.length})
          </h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {skus.map((sku) => (
            <div
              key={sku.id}
              className="rounded-xl border border-stone-200 p-4 space-y-3 hover:border-amber-300 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-stone-900">{sku.name}</div>
                  <div className="font-mono text-xs text-stone-500">
                    {sku.skuCode} · HSN {sku.hsnCode} · Recipe: {sku.recipe.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-stone-900">
                    {formatINR(sku.sellingPricePaisa)}
                  </div>
                  <div className="text-[11px] text-stone-500">+{sku.gstRateBps / 100}% GST</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-amber-50/70 p-2.5 text-xs">
                <div>
                  <div className="text-stone-500">Net Weight</div>
                  <div className="font-bold text-stone-900">{sku.netWeightG} g</div>
                </div>
                <div>
                  <div className="text-stone-500">Expected / Batch</div>
                  <div className="font-bold text-amber-900">
                    {sku.expectedPacketsPerBatch} packets
                  </div>
                </div>
                <div>
                  <div className="text-stone-500">FG Live Stock</div>
                  <div className="font-bold text-emerald-700">{sku.availablePackets} pkts</div>
                </div>
              </div>

              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1 font-semibold uppercase text-stone-500">
                  <Layers className="h-3.5 w-3.5" /> Packaging Rules ({sku.packetsPerCarton} pkts /
                  carton)
                </div>
                {sku.packagingBom.map((pb) => (
                  <div
                    key={pb.id}
                    className="flex justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-stone-700"
                  >
                    <span>{pb.packagingItem.name}</span>
                    <span className="font-semibold">
                      {pb.qtyBase} pc per {pb.perPackets} pkt{pb.perPackets > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* + Add Pack Size SKU Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Add Pack Size SKU (Layer 2 BOM)
                </h3>
                <p className="text-xs text-stone-500">
                  Share an existing bulk recipe to add a new pack size with zero schema changes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSku} className="mt-4 space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Pack Size Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Tamil Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={nameTamil}
                    onChange={(e) => setNameTamil(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600">
                  Shared Layer 1 Bulk Recipe
                </label>
                <select
                  value={recipeId}
                  onChange={(e) => setRecipeId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.batchYieldG} g dough / batch)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Net Weight (g)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={netWeightG}
                    onChange={(e) => setNetWeightG(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Packets / Carton
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={packetsPerCarton}
                    onChange={(e) => setPacketsPerCarton(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={sellingPriceRupees}
                    onChange={(e) => setSellingPriceRupees(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                Dynamic Yield Preview: {selectedRecipe?.batchYieldG ?? 0} g ÷ {netWeightG || 0} g
                = <span className="text-sm font-extrabold">{previewPacketsPerBatch}</span>{' '}
                expected packets per batch
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-600">HSN Code</label>
                  <input
                    type="text"
                    required
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">GST %</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={gstPct}
                    onChange={(e) => setGstPct(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Primary Pouch (1 per pkt)
                  </label>
                  <select
                    value={pouchPackagingItemId}
                    onChange={(e) => setPouchPackagingItemId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Auto-create {netWeightG || 'new'} g pouch</option>
                    {packagingItems.map((p) => (
                      <option key={p.inventoryItemId} value={p.inventoryItemId}>
                        {p.name} ({p.closingDisplay})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">
                    Carton (1 per {packetsPerCarton} pkts)
                  </label>
                  <select
                    value={cartonPackagingItemId}
                    onChange={(e) => setCartonPackagingItemId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {packagingItems.map((p) => (
                      <option key={p.inventoryItemId} value={p.inventoryItemId}>
                        {p.name} ({p.closingDisplay})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  {saving ? 'Creating SKU...' : 'Create Pack Size SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
