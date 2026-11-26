import { LedgerSourceType, MovementType, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  computeValuePaisaFromQtyAndRate,
  computeWeightedAverageRateDecimal,
  divideRoundHalfUp,
  normalizeRateDecimal,
} from '../utils/money.js';
import { displayQtyToBaseUnits, getItemLedgerState } from './inventory.service.js';

export interface CreatePurchaseInput {
  supplierId: string;
  supplierInvoiceNo?: string;
  purchaseDate?: string;
  notes?: string;
  createdById: string;
  items: Array<{
    inventoryItemId: string;
    qtyDisplay?: number | string;
    qtyBase?: number;
    ratePerDisplay: string | number;
    gstRateBps?: number;
    batchNo?: string;
    expiryDate?: string | null;
  }>;
}

export async function createPurchase(input: CreatePurchaseInput) {
  if (!input.items.length) {
    throw new Error('Purchase must contain at least one item.');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found.');
    }

    const existingCount = await tx.purchase.count();
    const purchaseNo = `PUR-${(existingCount + 1).toString().padStart(4, '0')}`;
    const purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : new Date();

    let totalTaxablePaisa = 0;
    let totalGstPaisa = 0;

    const preparedLines: Array<{
      inventoryItemId: string;
      qtyBase: number;
      ratePerDisplayDecimal: string;
      gstRateBps: number;
      taxablePaisa: number;
      gstPaisa: number;
      totalPaisa: number;
      batchNo: string;
      expiryDate: Date | null;
      newWacRateDecimal: string;
    }> = [];

    for (const line of input.items) {
      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: line.inventoryItemId },
      });

      const qtyBase =
        line.qtyBase !== undefined
          ? line.qtyBase
          : displayQtyToBaseUnits(line.qtyDisplay ?? 0, item.displayFactor);

      if (!Number.isInteger(qtyBase) || qtyBase <= 0) {
        throw new Error(`Invalid purchase quantity for ${item.name}`);
      }

      const rateDecimal = normalizeRateDecimal(line.ratePerDisplay);
      const gstRateBps = line.gstRateBps ?? item.gstRateBps;
      const taxablePaisa = computeValuePaisaFromQtyAndRate(
        qtyBase,
        item.displayFactor,
        rateDecimal
      );
      const gstPaisa = Number(
        divideRoundHalfUp(BigInt(taxablePaisa) * BigInt(gstRateBps), 10000n)
      );
      const totalPaisa = taxablePaisa + gstPaisa;

      const ledgerState = await getItemLedgerState(tx, item.id);
      const newWacRateDecimal = computeWeightedAverageRateDecimal(
        ledgerState.qtyBase,
        ledgerState.wacRateDecimal,
        qtyBase,
        rateDecimal,
        item.displayFactor
      );

      totalTaxablePaisa += taxablePaisa;
      totalGstPaisa += gstPaisa;

      preparedLines.push({
        inventoryItemId: item.id,
        qtyBase,
        ratePerDisplayDecimal: rateDecimal,
        gstRateBps,
        taxablePaisa,
        gstPaisa,
        totalPaisa,
        batchNo:
          line.batchNo?.trim() ||
          `PUR-${item.skuCode}-${purchaseDate.toISOString().slice(0, 10).replace(/-/g, '')}`,
        expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
        newWacRateDecimal,
      });
    }

    const purchase = await tx.purchase.create({
      data: {
        purchaseNo,
        supplierId: supplier.id,
        supplierInvoiceNo: input.supplierInvoiceNo?.trim() || null,
        purchaseDate,
        taxablePaisa: totalTaxablePaisa,
        gstPaisa: totalGstPaisa,
        totalPaisa: totalTaxablePaisa + totalGstPaisa,
        notes: input.notes?.trim() || null,
        createdById: input.createdById,
        items: {
          create: preparedLines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            qtyBase: l.qtyBase,
            ratePerDisplayDecimal: l.ratePerDisplayDecimal,
            gstRateBps: l.gstRateBps,
            taxablePaisa: l.taxablePaisa,
            gstPaisa: l.gstPaisa,
            totalPaisa: l.totalPaisa,
            batchNo: l.batchNo,
            expiryDate: l.expiryDate,
          })),
        },
      },
      include: {
        supplier: true,
        items: {
          include: { inventoryItem: true },
        },
      },
    });

    for (const line of preparedLines) {
      // Stock valuation uses pre-tax purchase cost (taxablePaisa)
      await tx.stockLedger.create({
        data: {
          inventoryItemId: line.inventoryItemId,
          movementType: MovementType.PURCHASE_RECEIPT,
          qtyBaseDelta: line.qtyBase,
          unitCostDecimal: line.ratePerDisplayDecimal,
          totalValuePaisa: line.taxablePaisa,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          sourceType: LedgerSourceType.PURCHASE,
          sourceId: purchase.id,
          notes: `Purchase ${purchaseNo} from ${supplier.name}`,
          createdById: input.createdById,
        },
      });

      await tx.inventoryItem.update({
        where: { id: line.inventoryItemId },
        data: { currentWeightedRateDecimal: line.newWacRateDecimal },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: input.createdById,
        action: 'CREATE_PURCHASE',
        entityType: 'Purchase',
        entityId: purchase.id,
        afterJson: {
          purchaseNo: purchase.purchaseNo,
          supplierName: supplier.name,
          totalPaisa: purchase.totalPaisa,
          lines: preparedLines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            qtyBase: l.qtyBase,
            rate: l.ratePerDisplayDecimal,
            newWac: l.newWacRateDecimal,
          })),
        },
      },
    });

    return purchase;
  });
}
