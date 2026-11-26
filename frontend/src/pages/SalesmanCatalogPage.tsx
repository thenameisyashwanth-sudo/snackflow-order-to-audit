import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchMastersOverview } from '../api/erp';
import { ProductSku } from '../types/erp';
import { formatINR } from '../utils/format';

export default function SalesmanCatalogPage() {
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMastersOverview()
      .then((res) => setSkus(res.productSkus))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-stone-500">Loading product price list...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Product Price List</h1>
        <p className="text-sm text-stone-600">
          Standard pre-tax factory rates, HSN codes, GST %, and carton pack sizes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {skus.map((sku) => (
          <div
            key={sku.id}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-stone-900">{sku.name}</h2>
                <p className="font-mono text-xs text-stone-500">
                  {sku.skuCode} · HSN {sku.hsnCode}
                </p>
              </div>
              <Package className="h-5 w-5 text-amber-700" />
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-stone-200 pt-3">
              <div>
                <div className="text-lg font-bold text-stone-900">
                  {formatINR(sku.sellingPricePaisa)}
                </div>
                <div className="text-xs text-stone-500">
                  per packet (+{sku.gstRateBps / 100}% GST)
                </div>
              </div>
              <div className="text-right text-xs text-stone-600">
                <div>{sku.netWeightG} g / packet</div>
                <div>{sku.packetsPerCarton} packets / carton</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
