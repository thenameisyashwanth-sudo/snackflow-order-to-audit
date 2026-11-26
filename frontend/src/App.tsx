import { Factory, PackageCheck, ShieldCheck } from 'lucide-react';
import { formatINR, formatBaseQty } from './utils/format';

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-amber-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-700 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-stone-900">
                SnackFlow Order-to-Audit
              </h1>
              <p className="text-xs text-stone-500">
                Kaveri Traditional Snacks Pvt Ltd · Tamil Nadu (33)
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            PWA Ready
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">
            Milestone 1 Initialized
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Ledger-based inventory, integer-paisa GST accounting, and Two-Layer BOM schema are
            configured and ready.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <ShieldCheck className="h-4 w-4 text-amber-700" />
                Money Arithmetic
              </div>
              <p className="mt-2 text-lg font-semibold text-stone-900">{formatINR(787500)}</p>
              <p className="text-xs text-stone-500">Stored as 787500 integer paisa</p>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <PackageCheck className="h-4 w-4 text-amber-700" />
                Base Unit Conversion
              </div>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {formatBaseQty(19500, 1000, 'L')}
              </p>
              <p className="text-xs text-stone-500">Stored as 19500 integer ml</p>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Factory className="h-4 w-4 text-amber-700" />
                Two-Layer BOM
              </div>
              <p className="mt-2 text-lg font-semibold text-stone-900">200 / 80 pkts</p>
              <p className="text-xs text-stone-500">Dynamic 200 g & 500 g from 40 kg dough</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
