import { LedgerSourceType, MovementType, Prisma, SalesOrderStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import {
  computeGstLineItem,
  formatCreditNoteNumber,
  formatInvoiceNumber,
  getIndianFinancialYear,
} from '../utils/gst.js';
import { computeValuePaisaFromQtyAndRate } from '../utils/money.js';
import { getAllInventoryBalances, getItemLedgerState } from './inventory.service.js';

export interface VerifyOrderInput {
  orderId: string;
  action: 'APPROVE' | 'REJECT' | 'UPDATE_ONLY';
  rejectionReason?: string;
  items?: Array<{
    productSkuId: string;
    qtyPackets: number;
    unitPricePaisa: number;
  }>;
  userId: string;
}

/**
 * Verifies an incoming SUBMITTED order: allows Admin to edit quantities/prices
 * (logging before/after JSON to AuditLog), checks live Finished Goods stock,
 * and approves or rejects the order.
 */
export async function verifySalesOrder(input: VerifyOrderInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: input.orderId },
      include: {
        customer: true,
        items: { include: { productSku: true } },
      },
    });

    if (!order) {
      throw new Error('Sales order not found.');
    }
    if (order.status !== SalesOrderStatus.SUBMITTED && order.status !== SalesOrderStatus.APPROVED) {
      throw new Error(`Order ${order.orderNo} cannot be verified in status ${order.status}.`);
    }

    const beforeJson = {
      status: order.status,
      subtotalPaisa: order.subtotalPaisa,
      gstPaisa: order.gstPaisa,
      totalPaisa: order.totalPaisa,
      items: order.items.map((it) => ({
        productSkuId: it.productSkuId,
        qtyPackets: it.qtyPackets,
        unitPricePaisa: it.unitPricePaisa,
      })),
    };

    // Optional line edits before approval
    if (input.items && input.items.length > 0) {
      let subtotalPaisa = 0;
      let gstPaisa = 0;
      let totalPaisa = 0;

      const rebuiltLines: Array<{
        productSkuId: string;
        qtyPackets: number;
        unitPricePaisa: number;
        gstRateBps: number;
        taxablePaisa: number;
        gstPaisa: number;
        totalPaisa: number;
      }> = [];

      for (const line of input.items) {
        if (!Number.isInteger(line.qtyPackets) || line.qtyPackets <= 0) {
          throw new Error('Line quantity must be a positive integer.');
        }
        if (!Number.isInteger(line.unitPricePaisa) || line.unitPricePaisa < 0) {
          throw new Error('Unit price must be non-negative integer paisa.');
        }

        const sku = await tx.productSku.findUniqueOrThrow({
          where: { id: line.productSkuId },
        });
        const gst = computeGstLineItem({
          qtyPackets: line.qtyPackets,
          unitPricePaisa: line.unitPricePaisa,
          gstRateBps: sku.gstRateBps,
          factoryStateCode: env.factoryStateCode,
          placeOfSupplyStateCode: order.customer.stateCode,
        });

        subtotalPaisa += gst.taxablePaisa;
        gstPaisa += gst.totalGstPaisa;
        totalPaisa += gst.totalPaisa;

        rebuiltLines.push({
          productSkuId: sku.id,
          qtyPackets: line.qtyPackets,
          unitPricePaisa: line.unitPricePaisa,
          gstRateBps: sku.gstRateBps,
          taxablePaisa: gst.taxablePaisa,
          gstPaisa: gst.totalGstPaisa,
          totalPaisa: gst.totalPaisa,
        });
      }

      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });
      await tx.salesOrderItem.createMany({
        data: rebuiltLines.map((l) => ({ ...l, salesOrderId: order.id })),
      });
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { subtotalPaisa, gstPaisa, totalPaisa },
      });
    }

    const refreshed = await tx.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        customer: true,
        items: { include: { productSku: true } },
      },
    });

    if (input.action === 'REJECT') {
      const rejected = await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          status: SalesOrderStatus.REJECTED,
          rejectionReason: input.rejectionReason?.trim() || 'Rejected by Factory Admin',
          approvedById: input.userId,
          approvedAt: new Date(),
        },
        include: {
          customer: true,
          items: { include: { productSku: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'REJECT_ORDER',
          entityType: 'SalesOrder',
          entityId: order.id,
          beforeJson,
          afterJson: { status: rejected.status, rejectionReason: rejected.rejectionReason },
        },
      });

      return rejected;
    }

    if (input.action === 'APPROVE') {
      // Live Finished Goods stock check
      const fgBalances = await getAllInventoryBalances(tx, { category: 'FINISHED_GOOD' });
      const fgMap = new Map(fgBalances.map((b) => [b.inventoryItemId, b.closingQtyBase]));

      for (const item of refreshed.items) {
        const available = fgMap.get(item.productSku.inventoryItemId) ?? 0;
        if (available < item.qtyPackets) {
          const shortage = item.qtyPackets - available;
          throw new Error(
            `Insufficient Stock: Shortage of ${shortage} packets for ${item.productSku.name} (Available: ${available}, Ordered: ${item.qtyPackets}).`
          );
        }
      }

      const approved = await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          status: SalesOrderStatus.APPROVED,
          approvedById: input.userId,
          approvedAt: new Date(),
        },
        include: {
          customer: true,
          items: { include: { productSku: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'APPROVE_ORDER',
          entityType: 'SalesOrder',
          entityId: order.id,
          beforeJson,
          afterJson: {
            status: approved.status,
            subtotalPaisa: approved.subtotalPaisa,
            gstPaisa: approved.gstPaisa,
            totalPaisa: approved.totalPaisa,
            items: approved.items.map((it) => ({
              productSkuId: it.productSkuId,
              qtyPackets: it.qtyPackets,
              unitPricePaisa: it.unitPricePaisa,
            })),
          },
        },
      });

      return approved;
    }

    // UPDATE_ONLY
    await tx.auditLog.create({
      data: {
        userId: input.userId,
        action: 'EDIT_ORDER',
        entityType: 'SalesOrder',
        entityId: order.id,
        beforeJson,
        afterJson: {
          status: refreshed.status,
          subtotalPaisa: refreshed.subtotalPaisa,
          gstPaisa: refreshed.gstPaisa,
          totalPaisa: refreshed.totalPaisa,
          items: refreshed.items.map((it) => ({
            productSkuId: it.productSkuId,
            qtyPackets: it.qtyPackets,
            unitPricePaisa: it.unitPricePaisa,
          })),
        },
      },
    });

    return refreshed;
  });
}

/**
 * Converts an APPROVED (or SUBMITTED if stock covers and autoApprove=true) SalesOrder
 * into a POSTED GST Tax Invoice with sequential FY numbering (FY26-27/001).
 */
export async function createInvoiceFromOrder(params: {
  orderId: string;
  userId: string;
  autoApprove?: boolean;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: params.orderId },
      include: {
        customer: true,
        invoice: true,
        items: { include: { productSku: true } },
      },
    });

    if (!order) {
      throw new Error('Sales order not found.');
    }
    if (order.invoice) {
      throw new Error(`Order ${order.orderNo} already has invoice ${order.invoice.invoiceNo}.`);
    }
    if (order.status === SalesOrderStatus.SUBMITTED && !params.autoApprove) {
      throw new Error('Order must be approved before raising an invoice.');
    }
    if (
      order.status !== SalesOrderStatus.APPROVED &&
      !(order.status === SalesOrderStatus.SUBMITTED && params.autoApprove)
    ) {
      throw new Error(`Cannot invoice order in status ${order.status}.`);
    }

    // Stock sufficiency check
    const fgBalances = await getAllInventoryBalances(tx, { category: 'FINISHED_GOOD' });
    const fgMap = new Map(fgBalances.map((b) => [b.inventoryItemId, b.closingQtyBase]));

    for (const item of order.items) {
      const available = fgMap.get(item.productSku.inventoryItemId) ?? 0;
      if (available < item.qtyPackets) {
        const shortage = item.qtyPackets - available;
        throw new Error(
          `Insufficient Stock: Shortage of ${shortage} packets for ${item.productSku.name}. Cannot invoice until production covers the order.`
        );
      }
    }

    const now = new Date();
    const financialYear = getIndianFinancialYear(now);
    const maxSeq = await tx.invoice.aggregate({
      where: { financialYear },
      _max: { sequenceNo: true },
    });
    const sequenceNo = (maxSeq._max.sequenceNo ?? 0) + 1;
    const invoiceNo = formatInvoiceNumber(financialYear, sequenceNo);

    let taxablePaisa = 0;
    let cgstPaisa = 0;
    let sgstPaisa = 0;
    let igstPaisa = 0;
    let totalPaisa = 0;
    let isInterState = false;

    const invoiceItems: Array<{
      productSkuId: string;
      hsnCode: string;
      qtyPackets: number;
      unitPricePaisa: number;
      gstRateBps: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalPaisa: number;
    }> = [];

    for (const item of order.items) {
      const calc = computeGstLineItem({
        qtyPackets: item.qtyPackets,
        unitPricePaisa: item.unitPricePaisa,
        gstRateBps: item.gstRateBps,
        factoryStateCode: env.factoryStateCode,
        placeOfSupplyStateCode: order.customer.stateCode,
      });

      taxablePaisa += calc.taxablePaisa;
      cgstPaisa += calc.cgstPaisa;
      sgstPaisa += calc.sgstPaisa;
      igstPaisa += calc.igstPaisa;
      totalPaisa += calc.totalPaisa;
      isInterState = calc.isInterState;

      invoiceItems.push({
        productSkuId: item.productSkuId,
        hsnCode: item.productSku.hsnCode,
        qtyPackets: item.qtyPackets,
        unitPricePaisa: item.unitPricePaisa,
        gstRateBps: item.gstRateBps,
        taxablePaisa: calc.taxablePaisa,
        cgstPaisa: calc.cgstPaisa,
        sgstPaisa: calc.sgstPaisa,
        igstPaisa: calc.igstPaisa,
        totalPaisa: calc.totalPaisa,
      });
    }

    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        financialYear,
        sequenceNo,
        salesOrderId: order.id,
        customerId: order.customerId,
        factoryStateCode: env.factoryStateCode,
        placeOfSupplyStateCode: order.customer.stateCode,
        isInterState,
        status: 'POSTED',
        taxablePaisa,
        cgstPaisa,
        sgstPaisa,
        igstPaisa,
        totalPaisa,
        issuedAt: now,
        createdById: params.userId,
        items: {
          create: invoiceItems,
        },
      },
      include: {
        customer: true,
        items: { include: { productSku: true } },
      },
    });

    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: SalesOrderStatus.INVOICED,
        ...(order.approvedById ? {} : { approvedById: params.userId, approvedAt: now }),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action: 'CREATE_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        afterJson: {
          invoiceNo: invoice.invoiceNo,
          orderNo: order.orderNo,
          customerName: order.customer.name,
          isInterState,
          taxablePaisa,
          cgstPaisa,
          sgstPaisa,
          igstPaisa,
          totalPaisa,
        },
      },
    });

    return invoice;
  });
}

/**
 * Dispatches a POSTED invoice, deducting Finished Goods from StockLedger (SALES_DISPATCH).
 */
export async function dispatchInvoice(params: { invoiceId: string; userId: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: params.invoiceId },
      include: {
        customer: true,
        items: { include: { productSku: { include: { inventoryItem: true } } } },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found.');
    }
    if (invoice.status !== 'POSTED') {
      throw new Error(`Cannot dispatch invoice ${invoice.invoiceNo} in status ${invoice.status}.`);
    }
    if (invoice.dispatchedAt) {
      throw new Error(`Invoice ${invoice.invoiceNo} has already been dispatched.`);
    }

    const now = new Date();

    for (const item of invoice.items) {
      const ledgerState = await getItemLedgerState(tx, item.productSku.inventoryItemId);
      if (ledgerState.qtyBase < item.qtyPackets) {
        const shortage = item.qtyPackets - ledgerState.qtyBase;
        throw new Error(
          `Insufficient Stock: Shortage of ${shortage} packets for ${item.productSku.name}. Dispatch blocked.`
        );
      }

      const costValuePaisa = computeValuePaisaFromQtyAndRate(
        item.qtyPackets,
        item.productSku.inventoryItem.displayFactor,
        ledgerState.wacRateDecimal
      );

      await tx.stockLedger.create({
        data: {
          inventoryItemId: item.productSku.inventoryItemId,
          movementType: MovementType.SALES_DISPATCH,
          qtyBaseDelta: -item.qtyPackets,
          unitCostDecimal: ledgerState.wacRateDecimal,
          totalValuePaisa: -costValuePaisa,
          sourceType: LedgerSourceType.INVOICE,
          sourceId: invoice.id,
          notes: `Dispatched against ${invoice.invoiceNo} to ${invoice.customer.name}`,
          createdById: params.userId,
        },
      });

      await tx.invoiceItem.update({
        where: { id: item.id },
        data: { dispatchedQtyPackets: item.qtyPackets },
      });
    }

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { dispatchedAt: now },
      include: {
        customer: true,
        items: { include: { productSku: true } },
      },
    });

    if (invoice.salesOrderId) {
      await tx.salesOrder.update({
        where: { id: invoice.salesOrderId },
        data: { status: SalesOrderStatus.DISPATCHED },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action: 'DISPATCH_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        beforeJson: { dispatchedAt: null },
        afterJson: {
          invoiceNo: invoice.invoiceNo,
          dispatchedAt: now.toISOString(),
          packetsDispatched: invoice.items.reduce((s, i) => s + i.qtyPackets, 0),
        },
      },
    });

    return updatedInvoice;
  });
}

/**
 * Cancels a POSTED invoice via a sequential Credit Note (never deletes posted invoices).
 * Restocks Finished Goods via CREDIT_NOTE_RETURN if the invoice had been dispatched.
 */
export async function cancelInvoiceWithCreditNote(params: {
  invoiceId: string;
  reason: string;
  restockGoods?: boolean;
  userId: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: params.invoiceId },
      include: {
        customer: true,
        items: { include: { productSku: { include: { inventoryItem: true } } } },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found.');
    }
    if (invoice.status === 'CANCELLED') {
      throw new Error(`Invoice ${invoice.invoiceNo} is already cancelled.`);
    }

    const beforeJson = {
      status: invoice.status,
      totalPaisa: invoice.totalPaisa,
      paidPaisa: invoice.paidPaisa,
      dispatchedAt: invoice.dispatchedAt,
    };

    const now = new Date();
    const fy = getIndianFinancialYear(now);
    const existingCnCount = await tx.creditNote.count({
      where: { creditNoteNo: { startsWith: `CN/${fy}/` } },
    });
    const creditNoteNo = formatCreditNoteNumber(fy, existingCnCount + 1);
    const shouldRestock = Boolean(invoice.dispatchedAt) && (params.restockGoods ?? true);

    const creditNote = await tx.creditNote.create({
      data: {
        creditNoteNo,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        reason: params.reason.trim() || 'Invoice cancelled via Credit Note',
        restockGoods: shouldRestock,
        taxablePaisa: invoice.taxablePaisa,
        cgstPaisa: invoice.cgstPaisa,
        sgstPaisa: invoice.sgstPaisa,
        igstPaisa: invoice.igstPaisa,
        totalPaisa: invoice.totalPaisa,
        issuedAt: now,
        createdById: params.userId,
        items: {
          create: invoice.items.map((it) => ({
            productSkuId: it.productSkuId,
            qtyPackets: it.qtyPackets,
            unitPricePaisa: it.unitPricePaisa,
            taxablePaisa: it.taxablePaisa,
            cgstPaisa: it.cgstPaisa,
            sgstPaisa: it.sgstPaisa,
            igstPaisa: it.igstPaisa,
            totalPaisa: it.totalPaisa,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    if (shouldRestock) {
      for (const item of invoice.items) {
        if (item.dispatchedQtyPackets <= 0) continue;
        const ledgerState = await getItemLedgerState(tx, item.productSku.inventoryItemId);
        const returnValuePaisa = computeValuePaisaFromQtyAndRate(
          item.dispatchedQtyPackets,
          item.productSku.inventoryItem.displayFactor,
          ledgerState.wacRateDecimal
        );

        await tx.stockLedger.create({
          data: {
            inventoryItemId: item.productSku.inventoryItemId,
            movementType: MovementType.CREDIT_NOTE_RETURN,
            qtyBaseDelta: item.dispatchedQtyPackets,
            unitCostDecimal: ledgerState.wacRateDecimal,
            totalValuePaisa: returnValuePaisa,
            sourceType: LedgerSourceType.CREDIT_NOTE,
            sourceId: creditNote.id,
            notes: `Stock returned via ${creditNoteNo} cancelling ${invoice.invoiceNo}`,
            createdById: params.userId,
          },
        });
      }
    }

    const cancelledInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' },
      include: {
        customer: true,
        creditNotes: true,
        items: { include: { productSku: true } },
      },
    });

    if (invoice.salesOrderId) {
      await tx.salesOrder.update({
        where: { id: invoice.salesOrderId },
        data: { status: SalesOrderStatus.CANCELLED },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action: 'CANCEL_INVOICE_CREDIT_NOTE',
        entityType: 'Invoice',
        entityId: invoice.id,
        beforeJson,
        afterJson: {
          status: 'CANCELLED',
          creditNoteNo,
          restockGoods: shouldRestock,
          reason: params.reason,
        },
      },
    });

    return { invoice: cancelledInvoice, creditNote };
  });
}
