export type UserRole = 'SALESMAN' | 'ADMIN' | 'PRODUCTION' | 'AUDITOR' | 'OWNER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  preferredLang: string;
  phone?: string | null;
}

export interface DemoUserOption {
  email: string;
  name: string;
  role: UserRole;
  deviceHint: string;
  summary: string;
}

export const DEMO_USERS: DemoUserOption[] = [
  {
    email: 'salesman_a@factory.in',
    name: 'Salesman A',
    role: 'SALESMAN',
    deviceHint: 'Mobile / Offline PWA',
    summary: 'Field orders, Retailer A (TN), customer sales',
  },
  {
    email: 'salesman_b@factory.in',
    name: 'Salesman B',
    role: 'SALESMAN',
    deviceHint: 'Mobile / Offline PWA',
    summary: 'Field orders, Distributor B (KA), route log',
  },
  {
    email: 'admin@factory.in',
    name: 'Factory Admin',
    role: 'ADMIN',
    deviceHint: 'Desktop Billing Desk',
    summary: 'Approve orders, GST invoices, dispatch, payments',
  },
  {
    email: 'production@factory.in',
    name: 'Production Supervisor',
    role: 'PRODUCTION',
    deviceHint: 'Floor Tablet / Desktop',
    summary: 'BOM runs, material issues, output & variance',
  },
  {
    email: 'auditor@factory.in',
    name: 'External Auditor',
    role: 'AUDITOR',
    deviceHint: 'Desktop (Read-Only)',
    summary: 'GSTR-1/3B summary, stock ledger, Excel/PDF exports',
  },
  {
    email: 'owner@factory.in',
    name: 'Factory Owner',
    role: 'OWNER',
    deviceHint: 'Any Device',
    summary: 'Live KPIs, variance alerts, packet cost & dues',
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SALESMAN: 'Field Salesman',
  ADMIN: 'Factory Admin',
  PRODUCTION: 'Production Supervisor',
  AUDITOR: 'Accountant / Auditor',
  OWNER: 'Owner',
};

export const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  SALESMAN: 'bg-sky-100 text-sky-800 border-sky-200',
  ADMIN: 'bg-amber-100 text-amber-900 border-amber-200',
  PRODUCTION: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  AUDITOR: 'bg-purple-100 text-purple-800 border-purple-200',
  OWNER: 'bg-rose-100 text-rose-800 border-rose-200',
};
