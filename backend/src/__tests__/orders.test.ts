import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  buildOrderWhereScope,
  createSalesOrder,
  formatOrderNumber,
  summarizeCustomerSales,
} from '../services/order.service.js';

describe('Sales Orders, RBAC Isolation & Offline Idempotency', () => {
  it('formats sequential FY order numbers cleanly', () => {
    expect(formatOrderNumber('FY26-27', 1)).toBe('ORD-FY26-27-001');
    expect(formatOrderNumber('FY26-27', 14)).toBe('ORD-FY26-27-014');
  });

  it('scopes order queries by SALESMAN userId while allowing ADMIN/OWNER/AUDITOR full visibility', () => {
    expect(buildOrderWhereScope('SALESMAN', 'salesman-a-id')).toEqual({
      salesmanId: 'salesman-a-id',
    });
    expect(buildOrderWhereScope('SALESMAN', 'salesman-b-id', 'SUBMITTED')).toEqual({
      salesmanId: 'salesman-b-id',
      status: 'SUBMITTED',
    });
    expect(buildOrderWhereScope('ADMIN', 'admin-id')).toEqual({});
    expect(buildOrderWhereScope('OWNER', 'owner-id')).toEqual({});
    expect(buildOrderWhereScope('AUDITOR', 'auditor-id')).toEqual({});
  });

  it('aggregates customer-wise sales totals accurately in integer paisa', () => {
    const summary = summarizeCustomerSales([
      {
        customer: {
          id: 'c1',
          code: 'CUST-RETAILER-A',
          name: 'Retailer A',
          type: 'RETAILER',
          stateCode: '33',
          stateName: 'Tamil Nadu',
        },
        subtotalPaisa: 750000,
        gstPaisa: 37500,
        totalPaisa: 787500,
        items: [{ qtyPackets: 150 }],
      },
      {
        customer: {
          id: 'c1',
          code: 'CUST-RETAILER-A',
          name: 'Retailer A',
          type: 'RETAILER',
          stateCode: '33',
          stateName: 'Tamil Nadu',
        },
        subtotalPaisa: 250000,
        gstPaisa: 12500,
        totalPaisa: 262500,
        items: [{ qtyPackets: 50 }],
      },
    ]);

    expect(summary).toEqual([
      {
        customerId: 'c1',
        customerCode: 'CUST-RETAILER-A',
        customerName: 'Retailer A',
        customerType: 'RETAILER',
        stateCode: '33',
        stateName: 'Tamil Nadu',
        orderCount: 2,
        totalPackets: 200,
        totalTaxablePaisa: 1000000,
        totalGstPaisa: 50000,
        totalWithGstPaisa: 1050000,
      },
    ]);
  });

  it('returns existing order (deduplicated: true) when clientOrderId matches an already synced order', async () => {
    const fakeExistingOrder = {
      id: 'ord-existing-1',
      orderNo: 'ORD-FY26-27-001',
      clientOrderId: 'uuid-offline-123',
      customerId: 'c1',
      salesmanId: 'u1',
      status: 'SUBMITTED',
      subtotalPaisa: 750000,
      gstPaisa: 37500,
      totalPaisa: 787500,
    };

    const spy = vi
      .spyOn(prisma.salesOrder, 'findUnique')
      .mockResolvedValueOnce(fakeExistingOrder as never);

    const result = await createSalesOrder({
      customerId: 'c1',
      salesmanId: 'u1',
      clientOrderId: 'uuid-offline-123',
      items: [{ productSkuId: 'sku-1', quantityPackets: 150 }],
    });

    expect(result.deduplicated).toBe(true);
    expect(result.order.id).toBe('ord-existing-1');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientOrderId: 'uuid-offline-123' } })
    );

    spy.mockRestore();
  });
});
