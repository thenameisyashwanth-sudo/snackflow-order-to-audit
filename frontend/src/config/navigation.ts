import {
  BarChart3,
  ClipboardCheck,
  Factory,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  Layers,
  MapPin,
  Package,
  ShoppingBag,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { UserRole } from '../types/auth';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  roles: UserRole[];
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  // Owner Executive Overview
  {
    id: 'owner-dashboard',
    label: 'Owner Dashboard',
    path: '/owner',
    icon: BarChart3,
    roles: ['OWNER', 'ADMIN'],
    description: "Today's orders, stock levels, variance alerts, packet cost & dues",
  },

  // Field Salesman Views
  {
    id: 'field-order',
    label: 'New Order',
    path: '/sales/new-order',
    icon: ShoppingBag,
    roles: ['SALESMAN'],
    description: 'Fast mobile order entry with offline queue & stock hints',
  },
  {
    id: 'my-orders',
    label: 'My Orders',
    path: '/sales/orders',
    icon: ClipboardCheck,
    roles: ['SALESMAN'],
    description: 'Order status tracking and customer-wise sales summary',
  },
  {
    id: 'visit-log',
    label: 'Visit Log',
    path: '/sales/visits',
    icon: MapPin,
    roles: ['SALESMAN'],
    description: 'Daily retailer/distributor route check-ins with GPS coordinates',
  },

  // Factory Admin Views
  {
    id: 'order-verification',
    label: 'Orders & Approval',
    path: '/admin/orders',
    icon: ClipboardCheck,
    roles: ['ADMIN'],
    description: 'Verify incoming salesman orders, check FG stock & raise GST invoices',
  },
  {
    id: 'invoices-dispatch',
    label: 'GST Invoices & Dispatch',
    path: '/admin/invoices',
    icon: FileText,
    roles: ['ADMIN'],
    description: 'Tax invoices (CGST/SGST/IGST), PDF download, dispatch & credit notes',
  },
  {
    id: 'payments',
    label: 'Payments & Receivables',
    path: '/admin/payments',
    icon: IndianRupee,
    roles: ['ADMIN'],
    description: 'Record customer collections and monitor invoice-wise outstanding',
  },

  // Production Supervisor Views
  {
    id: 'production-runs',
    label: 'Production & BOM',
    path: '/production/runs',
    icon: Factory,
    roles: ['PRODUCTION', 'ADMIN', 'OWNER'],
    description: 'Batch execution, planned vs actual consumption, yield & variance flags',
  },
  {
    id: 'purchases',
    label: 'Raw Material Receipts',
    path: '/purchases',
    icon: Truck,
    roles: ['PRODUCTION', 'ADMIN'],
    description: 'Record supplier purchases and update weighted-average rates',
  },

  // Inventory & BOM Masters
  {
    id: 'inventory',
    label: 'Stock & Ledger',
    path: '/inventory',
    icon: Warehouse,
    roles: ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'],
    description: 'Ledger-reconciled raw, packaging & finished-goods balances + FEFO batches',
  },
  {
    id: 'bom-masters',
    label: 'Recipes & SKUs',
    path: '/masters/bom',
    icon: Layers,
    roles: ['ADMIN', 'PRODUCTION', 'OWNER'],
    description: 'Two-layer BOM: bulk recipes, pack-size SKUs, customers & suppliers',
  },

  // Auditor / Month-End Reports
  {
    id: 'reports',
    label: 'Audit Reports',
    path: '/reports',
    icon: FileSpreadsheet,
    roles: ['AUDITOR', 'ADMIN', 'OWNER'],
    description: 'GSTR-1/3B summary, sales/purchase registers, production & ageing exports',
  },
  {
    id: 'catalog',
    label: 'Price List',
    path: '/sales/catalog',
    icon: Package,
    roles: ['SALESMAN'],
    description: 'Active SKUs, HSN codes, GST rates & selling prices',
  },
];

export function getHomePathForRole(role: UserRole): string {
  switch (role) {
    case 'SALESMAN':
      return '/sales/new-order';
    case 'ADMIN':
      return '/admin/orders';
    case 'PRODUCTION':
      return '/production/runs';
    case 'AUDITOR':
      return '/reports';
    case 'OWNER':
      return '/owner';
  }
}

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
