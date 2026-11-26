import { Prisma, SalesOrderStatus, UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { computeGstLineItem, getIndianFinancialYear } from '../utils/gst.js';
import { getAllInventoryBalances } from './inventory.service.js';

export interface CreateOrderInput {
  customerId: string;
  salesmanId: string;
  clientOrderId?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  items: Array<{
    productSkuId: string;
    quantityPackets: number;
    unitPricePaisa?: number;
  }>;
}

export interface CustomerSalesSummaryRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  customerType: string;
  stateCode: string;
  stateName: string;
  orderCount: number;
  totalPackets: number;
  totalTaxablePaisa: number;
  totalGstPaisa: number;
  totalWithGstPaisa: number;
}

export function formatOrderNumber(financialYear: string, sequenceNo: number): string {
  return `ORD-${financialYear}-${sequenceNo.toString().padStart(3, '0')}`;
}

/**
 * Computes query filter scope based on RBAC role:
 * SALESMAN only sees orders created by themselves; ADMIN/OWNER/AUDITOR see all.
 */
export function buildOrderWhereScope(
  role: UserRole,
  userId: string,
  statusFilter?: SalesOrderStatus
): Prisma.SalesOrderWhereInput {
  return {
    ...(role === 'SALESMAN' ? { salesmanId: userId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };
}

/**
 * Pure aggregation helper for customer-wise sales from a list of orders.
 */
export function summarizeCustomerSales(
  orders: Array<{
    customer: {
      id: string;
      code: string;
      name: string;
      type: string;
      stateCode: string;
      stateName: string;
    };
    subtotalPaisa: number;
    gstPaisa: number;
    totalPaisa: number;
    items: Array<{ qtyPackets: number }>;
  }>
): CustomerSalesSummaryRow[] {
  const map = new Map<string, CustomerSalesSummaryRow>();

  for (const order of orders) {
    const packets = order.items.reduce((sum, it) => sum + it.qtyPackets, 0);
    const existing = map.get(order.customer.id);
    if (existing) {
      existing.orderCount += 1;
      existing.totalPackets += packets;
      existing.totalTaxablePaisa += order.subtotalPaisa;
      existing.totalGstPaisa += order.gstPaisa;
      existing.totalWithGstPaisa += order.totalPaisa;
    } else {
      map.set(order.customer.id, {
        customerId: order.customer.id,
        customerCode: order.customer.code,
        customerName: order.customer.name,
        customerType: order.customer.type,
        stateCode: order.customer.stateCode,
        stateName: order.customer.stateName,
        orderCount: 1,
        totalPackets: packets,
        totalTaxablePaisa: order.subtotalPaisa,
        totalGstPaisa: order.gstPaisa,
        totalWithGstPaisa: order.totalPaisa,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalWithGstPaisa - a.totalWithGstPaisa
  );
}

/**
 * Creates a sales order with idempotent `clientOrderId` deduplication for offline sync.
 */
export async function createSalesOrder(input: CreateOrderInput): Promise<{
  order: Prisma.SalesOrderGetPayload<{
    include: {
      customer: true;
      salesman: { select: { id: true; name: true; email: true } };
      items: { include: { productSku: true } };
    };
  }>;
  deduplicated: boolean;
}> {
  if (!input.items.length) {
    throw new Error('Order must contain at least one product line.');
  }

  // Idempotency check before entering heavy work
  if (input.clientOrderId) {
    const existing = await prisma.salesOrder.findUnique({
      where: { clientOrderId: input.clientOrderId },
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        items: { include: { productSku: true } },
      },
    });
    if (existing) {
      return { order: existing, deduplicated: true };
    }
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.clientOrderId) {
      const existingInTx = await tx.salesOrder.findUnique({
        where: { clientOrderId: input.clientOrderId },
        include: {
          customer: true,
          salesman: { select: { id: true, name: true, email: true } },
          items: { include: { productSku: true } },
        },
      });
      if (existingInTx) {
        return { order: existingInTx, deduplicated: true };
      }
    }

    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) {
      throw new Error('Customer not found.');
    }

    const now = new Date();
    const fy = getIndianFinancialYear(now);
    const existingCount = await tx.salesOrder.count({
      where: { orderNo: { startsWith: `ORD-${fy}-` } },
    });
    const orderNo = formatOrderNumber(fy, existingCount + 1);

    let subtotalPaisa = 0;
    let gstPaisa = 0;
    let totalPaisa = 0;

    const preparedItems: Array<{
      productSkuId: string;
      qtyPackets: number;
      unitPricePaisa: number;
      gstRateBps: number;
      taxablePaisa: number;
      gstPaisa: number;
      totalPaisa: number;
    }> = [];

    for (const line of input.items) {
      if (!Number.isInteger(line.quantityPackets) || line.quantityPackets <= 0) {
        throw new Error('Quantity in packets must be a positive integer.');
      }

      const sku = await tx.productSku.findUnique({
        where: { id: line.productSkuId },
      });
      if (!sku) {
        throw new Error(`Product SKU not found: ${line.productSkuId}`);
      }

      let unitPricePaisa = line.unitPricePaisa;
      if (unitPricePaisa === undefined) {
        const customerPrice = await tx.customerPrice.findFirst({
          where: {
            customerId: customer.id,
            productSkuId: sku.id,
            minQtyPackets: { lte: line.quantityPackets },
          },
          orderBy: { minQtyPackets: 'desc' },
        });
        unitPricePaisa = customerPrice?.pricePaisa ?? sku.sellingPricePaisa;
      }

      const gstCalc = computeGstLineItem({
        qtyPackets: line.quantityPackets,
        unitPricePaisa,
        gstRateBps: sku.gstRateBps,
        factoryStateCode: env.factoryStateCode,
        placeOfSupplyStateCode: customer.stateCode,
      });

      subtotalPaisa += gstCalc.taxablePaisa;
      gstPaisa += gstCalc.totalGstPaisa;
      totalPaisa += gstCalc.totalPaisa;

      preparedItems.push({
        productSkuId: sku.id,
        qtyPackets: line.quantityPackets,
        unitPricePaisa,
        gstRateBps: sku.gstRateBps,
        taxablePaisa: gstCalc.taxablePaisa,
        gstPaisa: gstCalc.totalGstPaisa,
        totalPaisa: gstCalc.totalPaisa,
      });
    }

    const order = await tx.salesOrder.create({
      data: {
        orderNo,
        clientOrderId: input.clientOrderId ?? null,
        customerId: customer.id,
        salesmanId: input.salesmanId,
        status: SalesOrderStatus.SUBMITTED,
        orderDate: now,
        subtotalPaisa,
        gstPaisa,
        totalPaisa,
        notes: input.notes?.trim() || null,
        latitude: input.latitude !== undefined ? input.latitude.toFixed(7) : null,
        longitude: input.longitude !== undefined ? input.longitude.toFixed(7) : null,
        items: {
          create: preparedItems,
        },
      },
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        items: { include: { productSku: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.salesmanId,
        action: 'CREATE_ORDER',
        entityType: 'SalesOrder',
        entityId: order.id,
        afterJson: {
          orderNo: order.orderNo,
          clientOrderId: order.clientOrderId,
          customerName: customer.name,
          totalPaisa: order.totalPaisa,
          items: preparedItems.map((i) => ({
            productSkuId: i.productSkuId,
            qtyPackets: i.qtyPackets,
          })),
        },
      },
    });

    return { order, deduplicated: false };
  });
}

export async function listSalesOrders(params: {
  role: UserRole;
  userId: string;
  status?: SalesOrderStatus;
}) {
  const where = buildOrderWhereScope(params.role, params.userId, params.status);

  const [orders, fgBalances] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            dispatchedAt: true,
            totalPaisa: true,
            paidPaisa: true,
          },
        },
        items: {
          include: {
            productSku: {
              select: {
                id: true,
                skuCode: true,
                name: true,
                inventoryItemId: true,
                netWeightG: true,
                packetsPerCarton: true,
                hsnCode: true,
              },
            },
          },
        },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    }),
    getAllInventoryBalances(prisma, { category: 'FINISHED_GOOD' }),
  ]);

  const fgStockMap = new Map(
    fgBalances.map((b) => [b.inventoryItemId, b.closingQtyBase])
  );

  const enrichedOrders = orders.map((order) => {
    const itemsWithStock = order.items.map((it) => {
      const availablePackets = fgStockMap.get(it.productSku.inventoryItemId) ?? 0;
      const shortagePackets = Math.max(0, it.qtyPackets - availablePackets);
      return {
        ...it,
        availablePackets,
        shortagePackets,
        isStockSufficient: availablePackets >= it.qtyPackets,
      };
    });

    return {
      ...order,
      items: itemsWithStock,
      allItemsInStock: itemsWithStock.every((i) => i.isStockSufficient),
      totalShortagePackets: itemsWithStock.reduce((s, i) => s + i.shortagePackets, 0),
    };
  });

  const customerSalesSummary = summarizeCustomerSales(orders);

  return {
    orders: enrichedOrders,
    customerSalesSummary,
  };
}
