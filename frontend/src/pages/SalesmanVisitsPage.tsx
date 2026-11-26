import { MapPin, Navigation } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { fetchMastersOverview } from '../api/erp';
import { createSalesmanVisit, fetchSalesmanVisits } from '../api/orders';
import { Customer } from '../types/erp';
import { SalesmanVisitRecord } from '../types/orders';

export default function SalesmanVisitsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<SalesmanVisitRecord[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [outcome, setOutcome] = useState('ORDER_PLACED');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [masters, visitRes] = await Promise.all([
      fetchMastersOverview(),
      fetchSalesmanVisits(),
    ]);
    setCustomers(masters.customers);
    setVisits(visitRes.visits);
    if (masters.customers.length > 0 && !customerId) {
      setCustomerId(masters.customers[0].id);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  function captureGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        // Fallback demo coordinates for Tiruchirappalli if browser blocks geolocation
        setCoords({ lat: 10.7905, lng: 78.7047 });
      }
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setSaving(true);
    try {
      await createSalesmanVisit({
        customerId,
        outcome,
        notes: notes || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      setNotes('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Route Visit Log & GPS Check-In</h1>
        <p className="text-sm text-stone-600">
          Log retailer and distributor field visits with optional GPS coordinates.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-stone-600">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.routeName ?? c.stateName})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600">Visit Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ORDER_PLACED">Order Placed</option>
              <option value="PAYMENT_FOLLOWUP">Payment Follow-up</option>
              <option value="STOCK_CHECK">Shelf Stock Check</option>
              <option value="NO_ORDER">No Order Today</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={captureGps}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            <Navigation className="h-3.5 w-3.5 text-amber-700" />
            {coords ? `GPS: ${coords.lat}, ${coords.lng}` : 'Capture GPS Check-In'}
          </button>
          <input
            type="text"
            placeholder="Visit notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {saving ? 'Logging...' : 'Log Visit'}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3">
          <MapPin className="h-4 w-4 text-amber-700" />
          <h2 className="text-sm font-bold text-stone-900">Recent Visits ({visits.length})</h2>
        </div>
        {visits.length === 0 ? (
          <p className="text-xs text-stone-500">No route check-ins logged yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-xs"
              >
                <div>
                  <div className="font-bold text-stone-900">{v.customer.name}</div>
                  <div className="text-stone-500">
                    {v.outcome} {v.notes ? `· ${v.notes}` : ''}
                  </div>
                </div>
                <div className="text-right text-stone-500">
                  <div>{new Date(v.visitedAt).toLocaleString('en-IN')}</div>
                  {v.latitude && v.longitude && (
                    <div className="font-mono text-[10px]">
                      {v.latitude}, {v.longitude}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
