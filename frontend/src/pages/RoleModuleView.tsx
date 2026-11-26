import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getHomePathForRole, getNavItemsForRole, NavItem } from '../config/navigation';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types/auth';

export function RoleModuleView({ item }: { item: NavItem }) {
  const { user } = useAuth();
  if (!user) return null;

  const Icon = item.icon;
  const permittedModules = getNavItemsForRole(user.role);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900">{item.label}</h1>
            <p className="mt-1 text-sm text-stone-600">{item.description}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-700">
              <span>Signed in as</span>
              <strong>{user.name}</strong>
              <span>({ROLE_LABELS[user.role]})</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Your Permitted Modules ({permittedModules.length})
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {permittedModules.map((mod) => {
            const ModIcon = mod.icon;
            return (
              <Link
                key={mod.id}
                to={mod.path}
                className="flex items-start gap-3 rounded-xl border border-stone-200 p-4 transition hover:border-amber-300 hover:bg-amber-50/40"
              >
                <ModIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <div className="text-sm font-semibold text-stone-900">{mod.label}</div>
                  <div className="mt-0.5 text-xs text-stone-600">{mod.description}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ForbiddenView() {
  const { user } = useAuth();
  const homePath = user ? getHomePathForRole(user.role) : '/login';

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" />
      <h1 className="mt-3 text-lg font-bold text-stone-900">Access Restricted</h1>
      <p className="mt-1 text-sm text-stone-600">
        Your current role ({user ? ROLE_LABELS[user.role] : 'Guest'}) does not have permission to
        view this screen.
      </p>
      <Link
        to={homePath}
        className="mt-5 inline-flex rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
      >
        Go to My Dashboard
      </Link>
    </div>
  );
}
