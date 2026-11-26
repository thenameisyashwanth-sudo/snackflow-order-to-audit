import { ArrowRight, Factory, Lock, Mail, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHomePathForRole } from '../config/navigation';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS, ROLE_BADGE_COLORS, ROLE_LABELS } from '../types/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@factory.in');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [submittingEmail, setSubmittingEmail] = useState<string | null>(null);

  async function performLogin(targetEmail: string, targetPassword: string) {
    setError(null);
    setSubmittingEmail(targetEmail);
    try {
      const user = await login(targetEmail, targetPassword);
      navigate(getHomePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmittingEmail(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void performLogin(email, password);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-orange-50 px-4 py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left: Brand & Standard Email/Password Form */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-700 text-white shadow-sm">
              <Factory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900">
                SnackFlow ERP
              </h1>
              <p className="text-xs text-stone-500">
                Order-to-Audit · Kaveri Traditional Snacks (TN 33)
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-stone-600">
            Sign in with your factory credentials or pick a role on the right for instant demo
            access.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                  placeholder="role@factory.in"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingEmail !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingEmail === email ? 'Signing in...' : 'Sign In'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-5 rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
            Default password for all benchmark test accounts:{' '}
            <code className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-stone-800">
              password123
            </code>
          </div>
        </div>

        {/* Right: 1-Click Quick Demo Login Buttons */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-700" />
              <h2 className="text-base font-bold text-stone-900">Quick Demo Login</h2>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Section 3 RBAC Roles
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Click any role below to log in immediately and inspect its scoped screens and
            permissions.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {DEMO_USERS.map((demo) => {
              const isPending = submittingEmail === demo.email;
              return (
                <button
                  key={demo.email}
                  type="button"
                  disabled={submittingEmail !== null}
                  onClick={() => void performLogin(demo.email, 'password123')}
                  className="group flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/70 p-4 text-left transition hover:border-amber-400 hover:bg-amber-50/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900 group-hover:text-amber-900">
                        {demo.name}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_COLORS[demo.role]}`}
                      >
                        {ROLE_LABELS[demo.role]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-600">{demo.summary}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-stone-200/80 pt-2 text-[11px] text-stone-500">
                    <span className="font-mono">{demo.email}</span>
                    <span className="font-medium text-amber-700">
                      {isPending ? 'Logging in...' : demo.deviceHint}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
