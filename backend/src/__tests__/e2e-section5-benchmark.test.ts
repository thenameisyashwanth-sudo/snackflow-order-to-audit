import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-Memory Relational Prisma Test Store for Full 9-Step Section 5 E2E Run
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

const { inMemoryPrisma } = vi.hoisted(() => {
  function createInMemoryPrisma() {
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  const db = {
    users: [] as Row[],
    customers: [] as Row[],
    suppliers: [] as Row[],
    inventoryItems: [] as Row[],
    recipes: [] as Row[],
    recipeIngredients: [] as Row[],
    productSkus: [] as Row[],
    skuPackagingBoms: [] as Row[],
    customerPrices: [] as Row[],
    stockLedgers: [] as Row[],
    purchases: [] as Row[],
    purchaseItems: [] as Row[],
    productionRuns: [] as Row[],
    productionConsumptions: [] as Row[],
    salesOrders: [] as Row[],
    salesOrderItems: [] as Row[],
    invoices: [] as Row[],
    invoiceItems: [] as Row[],
    creditNotes: [] as Row[],
    payments: [] as Row[],
    auditLogs: [] as Row[],
  };

  function matchesWhere(row: Row, where: Row = {}): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === 'NOT') {
        if (matchesWhere(row, v as Row)) return false;
        continue;
      }
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('gte' in v || 'lte' in v) {
          const val = row[k] instanceof Date ? row[k].getTime() : new Date(row[k]).getTime();
          if (v.gte && val < new Date(v.gte).getTime()) return false;
          if (v.lte && val > new Date(v.lte).getTime()) return false;
          continue;
        }
        if ('startsWith' in v) {
          if (!String(row[k] ?? '').startsWith(v.startsWith)) return false;
          continue;
        }
      }
      if (row[k] !== v) return false;
    }
    return true;
  }

  function hydrateOrder(o: Row): Row {
    return {
      ...o,
      customer: db.customers.find((c) => c.id === o.customerId) ?? null,
      salesman: db.users.find((u) => u.id === o.salesmanId) ?? null,
      approvedBy: db.users.find((u) => u.id === o.approvedById) ?? null,
      invoice: db.invoices.find((inv) => inv.salesOrderId === o.id) ?? null,
      items: db.salesOrderItems
        .filter((it) => it.salesOrderId === o.id)
        .map((it) => ({
          ...it,
          productSku: hydrateSku(db.productSkus.find((s) => s.id === it.productSkuId)!),
        })),
    };
  }

  function hydrateSku(s: Row): Row {
    const recipe = db.recipes.find((r) => r.id === s.recipeId)!;
    return {
      ...s,
      inventoryItem: db.inventoryItems.find((i) => i.id === s.inventoryItemId)!,
      recipe: {
        ...recipe,
        ingredients: db.recipeIngredients
          .filter((ri) => ri.recipeId === recipe.id)
          .sort((a, b) => a.sequence - b.sequence)
          .map((ri) => ({
            ...ri,
            inventoryItem: db.inventoryItems.find((i) => i.id === ri.inventoryItemId)!,
          })),
      },
      packagingBom: db.skuPackagingBoms
        .filter((pb) => pb.productSkuId === s.id)
        .map((pb) => ({
          ...pb,
          packagingItem: db.inventoryItems.find((i) => i.id === pb.packagingItemId)!,
        })),
    };
  }

  function hydrateRun(r: Row): Row {
    return {
      ...r,
      productSku: hydrateSku(db.productSkus.find((s) => s.id === r.productSkuId)!),
      createdBy: db.users.find((u) => u.id === r.createdById) ?? null,
      consumptions: db.productionConsumptions
        .filter((c) => c.productionRunId === r.id)
        .map((c) => ({
          ...c,
          inventoryItem: db.inventoryItems.find((i) => i.id === c.inventoryItemId)!,
        })),
    };
  }

  function hydrateInvoice(inv: Row): Row {
    return {
      ...inv,
      customer: db.customers.find((c) => c.id === inv.customerId)!,
      salesOrder: db.salesOrders.find((o) => o.id === inv.salesOrderId) ?? null,
      creditNotes: db.creditNotes.filter((cn) => cn.invoiceId === inv.id),
      items: db.invoiceItems
        .filter((it) => it.invoiceId === inv.id)
        .map((it) => ({
          ...it,
          productSku: hydrateSku(db.productSkus.find((s) => s.id === it.productSkuId)!),
        })),
    };
  }

  const client: any = {
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(client),
    user: {
      count: async () => db.users.length,
      findUnique: async ({ where }: any) =>
        db.users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const existing = db.users.find((u) => u.email === where.email);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('usr'), ...create };
        db.users.push(row);
        return row;
      },
    },
    customer: {
      findUnique: async ({ where }: any) =>
        db.customers.find((c) => (where.code ? c.code === where.code : c.id === where.id)) ?? null,
      findMany: async ({ where }: any = {}) =>
        db.customers.filter((c) => matchesWhere(c, where)),
      upsert: async ({ where, update, create }: any) => {
        const existing = db.customers.find((c) => c.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('cust'), isActive: true, ...create };
        db.customers.push(row);
        return row;
      },
    },
    supplier: {
      findUnique: async ({ where }: any) =>
        db.suppliers.find((s) => (where.code ? s.code === where.code : s.id === where.id)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const existing = db.suppliers.find((s) => s.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('sup'), isActive: true, ...create };
        db.suppliers.push(row);
        return row;
      },
    },
    inventoryItem: {
      findUniqueOrThrow: async ({ where }: any) => {
        const found = db.inventoryItems.find((i) => i.id === where.id);
        if (!found) throw new Error(`InventoryItem not found: ${where.id}`);
        return found;
      },
      findMany: async ({ where }: any = {}) =>
        db.inventoryItems.filter((i) => matchesWhere(i, where)),
      upsert: async ({ where, update, create }: any) => {
        const existing = db.inventoryItems.find((i) => i.skuCode === where.skuCode);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('item'), isActive: true, ...create };
        db.inventoryItems.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.inventoryItems.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    recipe: {
      upsert: async ({ where, update, create }: any) => {
        const existing = db.recipes.find((r) => r.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('rcp'), isActive: true, ...create };
        db.recipes.push(row);
        return row;
      },
    },
    recipeIngredient: {
      upsert: async ({ where, update, create }: any) => {
        const k = where.recipeId_inventoryItemId;
        const existing = db.recipeIngredients.find(
          (ri) => ri.recipeId === k.recipeId && ri.inventoryItemId === k.inventoryItemId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('ri'), ...create };
        db.recipeIngredients.push(row);
        return row;
      },
    },
    productSku: {
      findUnique: async ({ where }: any) => {
        const found = db.productSkus.find((s) =>
          where.skuCode ? s.skuCode === where.skuCode : s.id === where.id
        );
        return found ? hydrateSku(found) : null;
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = db.productSkus.find((s) => s.skuCode === where.skuCode);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('sku'), isActive: true, ...create };
        db.productSkus.push(row);
        return row;
      },
    },
    skuPackagingBom: {
      upsert: async ({ where, update, create }: any) => {
        const k = where.productSkuId_packagingItemId;
        const existing = db.skuPackagingBoms.find(
          (pb) => pb.productSkuId === k.productSkuId && pb.packagingItemId === k.packagingItemId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('pkgb'), ...create };
        db.skuPackagingBoms.push(row);
        return row;
      },
    },
    customerPrice: {
      findFirst: async () => null,
    },
    stockLedger: {
      findFirst: async ({ where }: any) =>
        db.stockLedgers.find((l) => matchesWhere(l, where)) ?? null,
      findMany: async ({ where }: any = {}) =>
        db.stockLedgers
          .filter((l) => matchesWhere(l, where))
          .map((l) => ({
            ...l,
            inventoryItem: db.inventoryItems.find((i) => i.id === l.inventoryItemId)!,
            createdBy: db.users.find((u) => u.id === l.createdById)!,
          })),
      create: async ({ data }: any) => {
        const row = { id: nextId('sl'), createdAt: new Date(), ...data };
        db.stockLedgers.push(row);
        return row;
      },
      aggregate: async ({ where }: any) => {
        const matching = db.stockLedgers.filter((l) => matchesWhere(l, where));
        return {
          _sum: {
            qtyBaseDelta: matching.reduce((s, r) => s + r.qtyBaseDelta, 0),
            totalValuePaisa: matching.reduce((s, r) => s + r.totalValuePaisa, 0),
          },
        };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const l of db.stockLedgers) {
          if (matchesWhere(l, where)) {
            Object.assign(l, data);
            count++;
          }
        }
        return { count };
      },
    },
    purchase: {
      count: async () => db.purchases.length,
      create: async ({ data }: any) => {
        const { items, ...rest } = data;
        const purchase = { id: nextId('pur'), createdAt: new Date(), ...rest };
        db.purchases.push(purchase);
        const createdItems = (items?.create ?? []).map((it: Row) => {
          const itemRow = { id: nextId('puri'), purchaseId: purchase.id, ...it };
          db.purchaseItems.push(itemRow);
          return {
            ...itemRow,
            inventoryItem: db.inventoryItems.find((i) => i.id === it.inventoryItemId)!,
          };
        });
        return {
          ...purchase,
          supplier: db.suppliers.find((s) => s.id === purchase.supplierId)!,
          items: createdItems,
        };
      },
      findMany: async ({ where }: any = {}) =>
        db.purchases
          .filter((p) => matchesWhere(p, where))
          .map((p) => ({
            ...p,
            supplier: db.suppliers.find((s) => s.id === p.supplierId)!,
            items: db.purchaseItems
              .filter((it) => it.purchaseId === p.id)
              .map((it) => ({
                ...it,
                inventoryItem: db.inventoryItems.find((i) => i.id === it.inventoryItemId)!,
              })),
          })),
    },
    productionRun: {
      count: async () => db.productionRuns.length,
      create: async ({ data }: any) => {
        const { consumptions, ...rest } = data;
        const run = {
          id: nextId('prd'),
          startedAt: new Date(),
          createdAt: new Date(),
          ...rest,
        };
        db.productionRuns.push(run);
        for (const c of consumptions?.create ?? []) {
          db.productionConsumptions.push({
            id: nextId('prdc'),
            productionRunId: run.id,
            ...c,
          });
        }
        return hydrateRun(run);
      },
      findUnique: async ({ where }: any) => {
        const found = db.productionRuns.find((r) => r.id === where.id);
        return found ? hydrateRun(found) : null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const found = db.productionRuns.find((r) => r.id === where.id);
        if (!found) throw new Error(`Run not found: ${where.id}`);
        return hydrateRun(found);
      },
      findMany: async ({ where }: any = {}) =>
        db.productionRuns.filter((r) => matchesWhere(r, where)).map(hydrateRun),
      update: async ({ where, data }: any) => {
        const row = db.productionRuns.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return hydrateRun(row);
      },
    },
    salesOrder: {
      count: async ({ where }: any = {}) =>
        db.salesOrders.filter((o) => matchesWhere(o, where)).length,
      findUnique: async ({ where }: any) => {
        const found = db.salesOrders.find((o) =>
          where.clientOrderId ? o.clientOrderId === where.clientOrderId : o.id === where.id
        );
        return found ? hydrateOrder(found) : null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const found = db.salesOrders.find((o) => o.id === where.id);
        if (!found) throw new Error(`Order not found: ${where.id}`);
        return hydrateOrder(found);
      },
      findMany: async ({ where }: any = {}) =>
        db.salesOrders.filter((o) => matchesWhere(o, where)).map(hydrateOrder),
      create: async ({ data }: any) => {
        const { items, ...rest } = data;
        const ord = { id: nextId('ord'), createdAt: new Date(), ...rest };
        db.salesOrders.push(ord);
        for (const it of items?.create ?? []) {
          db.salesOrderItems.push({ id: nextId('ordi'), salesOrderId: ord.id, ...it });
        }
        return hydrateOrder(ord);
      },
      update: async ({ where, data }: any) => {
        const row = db.salesOrders.find((o) => o.id === where.id)!;
        Object.assign(row, data);
        return hydrateOrder(row);
      },
    },
    salesOrderItem: {
      deleteMany: async ({ where }: any) => {
        db.salesOrderItems = db.salesOrderItems.filter(
          (it) => it.salesOrderId !== where.salesOrderId
        );
      },
      createMany: async ({ data }: any) => {
        for (const it of data) {
          db.salesOrderItems.push({ id: nextId('ordi'), ...it });
        }
      },
    },
    invoice: {
      aggregate: async ({ where }: any) => {
        const matching = db.invoices.filter((i) => matchesWhere(i, where));
        const maxSeq = matching.reduce((m, i) => Math.max(m, i.sequenceNo ?? 0), 0);
        return { _max: { sequenceNo: maxSeq || null } };
      },
      create: async ({ data }: any) => {
        const { items, ...rest } = data;
        const inv = { id: nextId('inv'), paidPaisa: 0, dispatchedAt: null, ...rest };
        db.invoices.push(inv);
        for (const it of items?.create ?? []) {
          db.invoiceItems.push({
            id: nextId('invi'),
            invoiceId: inv.id,
            dispatchedQtyPackets: 0,
            ...it,
          });
        }
        return hydrateInvoice(inv);
      },
      findUnique: async ({ where }: any) => {
        const found = db.invoices.find((i) => i.id === where.id);
        return found ? hydrateInvoice(found) : null;
      },
      findMany: async ({ where }: any = {}) =>
        db.invoices.filter((i) => matchesWhere(i, where)).map(hydrateInvoice),
      update: async ({ where, data }: any) => {
        const row = db.invoices.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return hydrateInvoice(row);
      },
    },
    invoiceItem: {
      update: async ({ where, data }: any) => {
        const row = db.invoiceItems.find((it) => it.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    creditNote: {
      count: async () => db.creditNotes.length,
      findMany: async ({ where }: any = {}) =>
        db.creditNotes.filter((cn) => matchesWhere(cn, where)),
    },
    payment: {
      count: async () => db.payments.length,
      findMany: async ({ where }: any = {}) =>
        db.payments
          .filter((p) => matchesWhere(p, where))
          .map((p) => ({
            ...p,
            customer: db.customers.find((c) => c.id === p.customerId)!,
            invoice: db.invoices.find((i) => i.id === p.invoiceId) ?? null,
            recordedBy: db.users.find((u) => u.id === p.recordedById)!,
          })),
      create: async ({ data }: any) => {
        const row = { id: nextId('pay'), createdAt: new Date(), ...data };
        db.payments.push(row);
        return {
          ...row,
          customer: db.customers.find((c) => c.id === row.customerId)!,
          invoice: db.invoices.find((i) => i.id === row.invoiceId) ?? null,
          recordedBy: db.users.find((u) => u.id === row.recordedById)!,
        };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const row = { id: nextId('aud'), createdAt: new Date(), ...data };
        db.auditLogs.push(row);
        return row;
      },
    },
    _db: db,
  };

  return client;
  }

  return { inMemoryPrisma: createInMemoryPrisma() };
});

vi.mock('../db/prisma.js', () => ({
  prisma: inMemoryPrisma,
}));

import { prisma } from '../db/prisma.js';
import { seedBenchmarkData } from '../seed/benchmark.js';
import { buildMockEInvoiceJson } from '../services/einvoice.service.js';
import { getAllInventoryBalances } from '../services/inventory.service.js';
import {
  createInvoiceFromOrder,
  dispatchInvoice,
  verifySalesOrder,
} from '../services/invoice.service.js';
import { createSalesOrder, listSalesOrders } from '../services/order.service.js';
import { recordCustomerPayment } from '../services/payment.service.js';
import {
  createProductionRun,
  updateProductionRunOverheads,
} from '../services/production.service.js';
import { createPurchase } from '../services/purchase.service.js';
import {
  getGstSummaryReport,
  getPaymentsAndAgeingReport,
  getProductionVarianceReport,
  getPurchaseRegisterReport,
  getSalesRegisterReport,
  getStockAndLedgerReport,
  resolveReportDateRange,
} from '../services/report.service.js';

describe('End-to-End Section 5 Benchmark Scenario (All 9 Steps & 11 Checkpoints)', () => {
  it('executes Steps 1–9 sequentially and reconciles all stock, tax, variance, costing, and audit reports', async () => {
    // Seed Section 5 Master Data
    const seedSummary = await seedBenchmarkData(prisma as any);
    expect(seedSummary.usersSeeded).toBe(6);

    const db = (prisma as any)._db;
    const salesmanA = db.users.find((u: Row) => u.email === 'salesman_a@factory.in');
    const salesmanB = db.users.find((u: Row) => u.email === 'salesman_b@factory.in');
    const admin = db.users.find((u: Row) => u.email === 'admin@factory.in');
    const prodUser = db.users.find((u: Row) => u.email === 'production@factory.in');

    const supplier = db.suppliers.find((s: Row) => s.code === 'SUP-KAVERI-AGRO');
    const retailerA = db.customers.find((c: Row) => c.code === 'CUST-RETAILER-A');
    const distributorB = db.customers.find((c: Row) => c.code === 'CUST-DISTRIBUTOR-B');

    const flour = db.inventoryItems.find((i: Row) => i.skuCode === 'RM-FLOUR');
    const oil = db.inventoryItems.find((i: Row) => i.skuCode === 'RM-OIL');
    const spice = db.inventoryItems.find((i: Row) => i.skuCode === 'RM-SPICE');
    const murukkuSku = db.productSkus.find((s: Row) => s.skuCode === 'FG-MURUKKU-200G');

    // STEP 1: Record purchase of 60 kg Flour at ₹45/kg
    const purchase = await createPurchase({
      supplierId: supplier.id,
      supplierInvoiceNo: 'KAM-001',
      createdById: prodUser.id,
      items: [
        {
          inventoryItemId: flour.id,
          qtyDisplay: 60,
          ratePerDisplay: '45.00',
          gstRateBps: 500,
        },
      ],
    });
    expect(purchase.taxablePaisa).toBe(270000); // ₹2,700.00
    expect(flour.currentWeightedRateDecimal).toBe('43.1250'); // ₹43.125/kg WAC

    // STEPS 2 & 3: Start production run of Murukku 200 g (1 batch)
    // Issue 40 kg flour, 10.5 L oil (+5% over 10 L), 1.2 kg spice mix
    // Record 188 good packets (-6% vs 200), 6 pouches damaged, 9 cartons used
    const { run } = await createProductionRun({
      productSkuId: murukkuSku.id,
      batchCount: 1,
      rawMaterialIssues: [
        { inventoryItemId: flour.id, actualQtyDisplay: 40 },
        { inventoryItemId: oil.id, actualQtyDisplay: 10.5 },
        { inventoryItemId: spice.id, actualQtyDisplay: 1.2 },
      ],
      actualGoodPackets: 188,
      damagedPouches: 6,
      cartonsUsed: 9,
      createdById: prodUser.id,
    });

    // Checkpoints after Production Run:
    expect(run.expectedPackets).toBe(200);
    expect(run.actualGoodPackets).toBe(188);
    expect(Number(run.yieldVariancePct)).toBe(-6);
    expect(run.isYieldVarianceFlagged).toBe(true);
    expect(run.hasConsumptionVarianceFlag).toBe(true);

    const oilConsumption = run.consumptions.find((c: Row) => c.inventoryItemId === oil.id)!;
    expect(Number(oilConsumption.variancePct)).toBe(5);
    expect(oilConsumption.isVarianceFlagged).toBe(true);

    const postRunBalances = await getAllInventoryBalances(prisma as any);
    const balByCode = new Map(postRunBalances.map((b) => [b.skuCode, b]));
    expect(balByCode.get('RM-FLOUR')!.closingQtyBase).toBe(120000); // 120 kg
    expect(balByCode.get('RM-OIL')!.closingQtyBase).toBe(19500); // 19.5 L
    expect(balByCode.get('RM-SPICE')!.closingQtyBase).toBe(3800); // 3.8 kg
    expect(balByCode.get('PKG-POUCH-200G')!.closingQtyBase).toBe(306); // 306 pcs
    expect(balByCode.get('PKG-CARTON-20')!.closingQtyBase).toBe(21); // 21 pcs
    expect(balByCode.get('FG-MURUKKU-200G')!.closingQtyBase).toBe(238); // 50 + 188 = 238 pkts

    // STEP 4: Salesman A places order for Retailer A (TN 33): 150 packets
    const { order: orderA } = await createSalesOrder({
      customerId: retailerA.id,
      salesmanId: salesmanA.id,
      items: [{ productSkuId: murukkuSku.id, quantityPackets: 150 }],
    });

    // STEP 5: Admin approves, raises GST invoice (CGST + SGST), and records dispatch
    await verifySalesOrder({ orderId: orderA.id, action: 'APPROVE', userId: admin.id });
    const invoiceA = await createInvoiceFromOrder({
      orderId: orderA.id,
      userId: admin.id,
      autoApprove: false,
    });

    expect(invoiceA.taxablePaisa).toBe(750000); // ₹7,500.00
    expect(invoiceA.cgstPaisa).toBe(18750); // ₹187.50
    expect(invoiceA.sgstPaisa).toBe(18750); // ₹187.50
    expect(invoiceA.igstPaisa).toBe(0);
    expect(invoiceA.totalPaisa).toBe(787500); // ₹7,875.00

    await dispatchInvoice({ invoiceId: invoiceA.id, userId: admin.id });

    // Checkpoint: Finished goods after Retailer A dispatch = 88 packets
    const postDispatchBalances = await getAllInventoryBalances(prisma as any);
    const fgAfterDispatch = postDispatchBalances.find((b) => b.skuCode === 'FG-MURUKKU-200G')!;
    expect(fgAfterDispatch.closingQtyBase).toBe(88);

    // Mock e-Invoice IRN JSON check
    const einv = buildMockEInvoiceJson(invoiceA as any);
    expect(einv.Irn).toHaveLength(64);
    expect(einv.ValDtls.TotInvVal).toBe(7875);

    // STEP 6: Salesman B places order for Distributor B (KA 29): 120 packets
    const { order: orderB } = await createSalesOrder({
      customerId: distributorB.id,
      salesmanId: salesmanB.id,
      items: [{ productSkuId: murukkuSku.id, quantityPackets: 120 }],
    });

    // Admin order list flags shortage of 32 packets + 5% IGST preview; approval is blocked
    const adminOrdersView = await listSalesOrders({ role: 'ADMIN', userId: admin.id });
    const orderBView = adminOrdersView.orders.find((o) => o.id === orderB.id)!;
    expect(orderBView.allItemsInStock).toBe(false);
    expect(orderBView.totalShortagePackets).toBe(32);
    expect(orderBView.gstPreview.isInterState).toBe(true);
    expect(orderBView.gstPreview.igstPaisa).toBe(30000); // ₹300.00 (5% IGST on ₹6,000)

    await expect(
      verifySalesOrder({ orderId: orderB.id, action: 'APPROVE', userId: admin.id })
    ).rejects.toThrow(/Shortage of 32 packets/i);

    // STEP 7: Record payment of ₹4,000 from Retailer A -> ₹3,875 outstanding
    await recordCustomerPayment({
      customerId: retailerA.id,
      invoiceId: invoiceA.id,
      amountPaisa: 400000, // ₹4,000.00
      method: 'UPI',
      referenceNo: 'UPI-RET-A-4000',
      recordedById: admin.id,
    });

    // STEP 8: Add labour ₹1,200 + gas/power ₹600 overheads -> ₹31.14/packet WAC (37.71% margin)
    const { run: updatedRun, costBreakdown } = await updateProductionRunOverheads({
      runId: run.id,
      labourPaisa: 120000,
      gasPowerPaisa: 60000,
      userId: prodUser.id,
    });
    expect(updatedRun.totalCostPaisa).toBe(585500); // ₹5,855.00
    expect(updatedRun.costPerPacketPaisa).toBe(3114); // ₹31.14/packet
    expect(costBreakdown.grossMarginPct).toBe(37.71);
    expect(costBreakdown.fifoCostPerPacketPaisa).toBe(3090); // ₹30.90/packet FIFO

    // STEP 9: Generate all 6 monthly reports & verify reconciled totals
    const range = resolveReportDateRange();
    const [salesRep, gstRep, purRep, stockRep, prodRep, recRep] = await Promise.all([
      getSalesRegisterReport(range),
      getGstSummaryReport(range),
      getPurchaseRegisterReport(range),
      getStockAndLedgerReport(range),
      getProductionVarianceReport(range),
      getPaymentsAndAgeingReport(range),
    ]);

    expect(salesRep.totals.totalPaisa).toBe(787500);
    expect(gstRep.gstr3bTable31.intraState.cgstPaisa).toBe(18750);
    expect(gstRep.gstr3bTable31.intraState.sgstPaisa).toBe(18750);
    expect(purRep.totals.taxablePaisa).toBe(270000);
    expect(stockRep.finishedGoods[0].closingQtyBase).toBe(88);
    expect(prodRep.flaggedRunCount).toBe(1);
    expect(prodRep.runs[0].costBreakdown.costPerPacketPaisa).toBe(3114);

    const retailerAgeing = recRep.customerAgeing.find(
      (c) => c.customerId === retailerA.id
    )!;
    expect(retailerAgeing.totalInvoicedPaisa).toBe(787500);
    expect(retailerAgeing.totalCollectedPaisa).toBe(400000);
    expect(retailerAgeing.netOutstandingPaisa).toBe(387500); // ₹3,875.00
  });
});
