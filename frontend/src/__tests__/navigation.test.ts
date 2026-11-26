import { describe, expect, it } from 'vitest';
import { getHomePathForRole, getNavItemsForRole } from '../config/navigation';

describe('Role-scoped navigation', () => {
  it('scopes salesman, production, and auditor menus strictly by role', () => {
    const salesmanNav = getNavItemsForRole('SALESMAN').map((n) => n.id);
    expect(salesmanNav).toContain('field-order');
    expect(salesmanNav).not.toContain('order-verification');
    expect(salesmanNav).not.toContain('production-runs');

    const auditorNav = getNavItemsForRole('AUDITOR').map((n) => n.id);
    expect(auditorNav).toContain('reports');
    expect(auditorNav).toContain('inventory');
    expect(auditorNav).not.toContain('field-order');
    expect(auditorNav).not.toContain('order-verification');

    expect(getHomePathForRole('SALESMAN')).toBe('/sales/new-order');
    expect(getHomePathForRole('ADMIN')).toBe('/admin/orders');
    expect(getHomePathForRole('PRODUCTION')).toBe('/production/runs');
    expect(getHomePathForRole('AUDITOR')).toBe('/reports');
    expect(getHomePathForRole('OWNER')).toBe('/owner');
  });
});
