import {
  Factory,
  LogOut,
  Menu,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { resetBenchmarkRequest } from '../api/client';
import { getNavItemsForRole } from '../config/navigation';
import { useAuth } from '../context/AuthContext';
import { ROLE_BADGE_COLORS, ROLE_LABELS } from '../types/auth';

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!user) return null;

  const navItems = getNavItemsForRole(user.role);
  const canResetBenchmark = user.role === 'ADMIN' || user.role === 'OWNER';

  async function handleResetBenchmark() {
    if (
      !window.confirm(
        'Reset all transactions and restore Section 5 Benchmark opening balances? This clears orders, invoices, purchases, production runs, and payments.'
      )
    ) {
      return;
    }

    setResetting(true);
    setBannerMsg(null);
    try {
      const res = await resetBenchmarkRequest();
      setBannerMsg({ type: 'success', text: res.message });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reset benchmark data',
      });
    } finally {
      setResetting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900 lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700 text-white">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900">SnackFlow ERP</div>
            <div className="text-[11px] text-stone-500">TN GSTIN: 33AABCS1429B1Z5</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 p-4">
          <div className="rounded-xl bg-stone-50 p-3">
            <div className="text-xs font-semibold text-stone-900">{user.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-stone-500">{user.email}</div>
            <span
              className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_COLORS[user.role]}`}
            >
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-100 lg:hidden"
                aria-label="Toggle Menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="flex items-center gap-2 lg:hidden">
                <Factory className="h-5 w-5 text-amber-700" />
                <span className="text-sm font-bold text-stone-900">SnackFlow</span>
              </div>

              <div className="hidden items-center gap-2 text-xs text-stone-500 sm:flex">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>
                  Role-Scoped View:{' '}
                  <strong className="text-stone-800">{ROLE_LABELS[user.role]}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {canResetBenchmark && (
                <button
                  type="button"
                  onClick={() => void handleResetBenchmark()}
                  disabled={resetting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} />
                  <span>{resetting ? 'Resetting...' : 'Reset Benchmark Data'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Switch Role / Logout</span>
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="border-t border-stone-200 bg-white px-4 py-3 lg:hidden">
              <div className="mb-3 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
                <div>
                  <div className="text-xs font-semibold text-stone-900">{user.name}</div>
                  <div className="text-[11px] text-stone-500">{user.email}</div>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_COLORS[user.role]}`}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
              <nav className="grid gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                          isActive
                            ? 'bg-amber-50 text-amber-900'
                            : 'text-stone-700 hover:bg-stone-100'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          )}
        </header>

        {/* Status Banner */}
        {bannerMsg && (
          <div
            className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-sm sm:mx-6 ${
              bannerMsg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {bannerMsg.text}
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 pb-20 sm:p-6 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Bottom Navigation (for quick thumb navigation on Salesman / Floor devices) */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-stone-200 bg-white lg:hidden">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
                  isActive ? 'text-amber-700' : 'text-stone-500'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
