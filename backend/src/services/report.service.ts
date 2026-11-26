import { prisma } from '../db/prisma.js';
import { formatINR, paisaToRupeesString } from '../utils/money.js';
import { fromBaseUnits } from '../utils/units.js';
import { getAllInventoryBalances } from './inventory.service.js';
import { buildCostBreakdown, computeRunFifoMaterialCost } from './production.service.js';

export interface DateRange {
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
}

/**
 * Resolves `fromDate` / `toDate` strings with defaults covering the start of the
 * current month through the end of today.
 */
export function resolveReportDateRange(fromDate?: string, toDate?: string): DateRange {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const from = fromDate ? new Date(`${fromDate}T00:00:00.000`) : defaultFrom;
  const to = toDate ? new Date(`${toDate}T23:59:59.999`) : defaultTo;

  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? defaultTo : to,
    fromIso: (Number.isNaN(from.getTime()) ? defaultFrom : from).toISOString().slice(0, 10),
    toIso: (Number.isNaN(to.getTime()) ? defaultTo : to).toISOString().slice(0, 10),
  };
}

/**
 * Pure helper to bucket an outstanding amount into 0-30, 31-60, 61-90, 90+ days.
 */
export function computeAgeingBuckets(
  invoices: Array<{ issuedAt: Date; outstandingPaisa: number }>,
  asOfDate: Date
): {
  bucket0to30Paisa: number;
  bucket31to60Paisa: number;
  bucket61to90Paisa: number;
  bucket90PlusPaisa: number;
} {
  let bucket0to30Paisa = 0;
  let bucket31to60Paisa = 0;
  let bucket61to90Paisa = 0;
  let bucket90PlusPaisa = 0;

  const msPerDay = 1000 * 60 * 60 * 24;
  for (const inv of invoices) {
    if (inv.outstandingPaisa <= 0) continue;
    const ageDays = Math.max(
      0,
      Math.floor((asOfDate.getTime() - new Date(inv.issuedAt).getTime()) / msPerDay)
    );
    if (ageDays <= 30) {
      bucket0to30Paisa += inv.outstandingPaisa;
    } else if (ageDays <= 60) {
      bucket31to60Paisa += inv.outstandingPaisa;
    } else if (ageDays <= 90) {
      bucket61to90Paisa += inv.outstandingPaisa;
    } else {
      bucket90PlusPaisa += inv.outstandingPaisa;
    }
  }

  return {
    bucket0to30Paisa,
    bucket31to60Paisa,
    bucket61to90Paisa,
    bucket90PlusPaisa,
  };
}

export async function getSalesRegisterReport(range: DateRange) {
  const invoices = await prisma.invoice.findMany({
    where: {
      issuedAt: { gte: range.from, lte: range.to },
    },
    include: {
      customer: true,
      salesOrder: { select: { orderNo: true } },
      creditNotes: { select: { creditNoteNo: true, reason: true, totalPaisa: true } },
      items: {
        include: {
          productSku: { select: { id: true, skuCode: true, name: true, hsnCode: true } },
        },
      },
    },
    orderBy: [{ issuedAt: 'asc' }, { sequenceNo: 'asc' }],
  });

  const postedInvoices = invoices.filter((i) => i.status === 'POSTED');
  const cancelledInvoices = invoices.filter((i) => i.status === 'CANCELLED');

  const customerMap = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      gstin: string | null;
      stateName: string;
      invoiceCount: number;
      totalPackets: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalPaisa: number;
    }
  >();

  const productMap = new Map<
    string,
    {
      productSkuId: string;
      skuCode: string;
      productName: string;
      hsnCode: string;
      totalPackets: number;
      taxablePaisa: number;
      cgstPaisa: number;
      sgstPaisa: number;
      igstPaisa: number;
      totalPaisa: number;
    }
  >();

  for (const inv of postedInvoices) {
    const pkts = inv.items.reduce((s, it) => s + it.qtyPackets, 0);
    const existingCust = customerMap.get(inv.customerId);
    if (existingCust) {
      existingCust.invoiceCount += 1;
      existingCust.totalPackets += pkts;
      existingCust.taxablePaisa += inv.taxablePaisa;
      existingCust.cgstPaisa += inv.cgstPaisa;
      existingCust.sgstPaisa += inv.sgstPaisa;
      existingCust.igstPaisa += inv.igstPaisa;
      existingCust.totalPaisa += inv.totalPaisa;
    } else {
      customerMap.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: inv.customer.name,
        gstin: inv.customer.gstin,
        stateName: inv.customer.stateName,
        invoiceCount: 1,
        totalPackets: pkts,
        taxablePaisa: inv.taxablePaisa,
        cgstPaisa: inv.cgstPaisa,
        sgstPaisa: inv.sgstPaisa,
        igstPaisa: inv.igstPaisa,
        totalPaisa: inv.totalPaisa,
      });
    }

    for (const item of inv.items) {
      const existingProd = productMap.get(item.productSkuId);
      if (existingProd) {
        existingProd.totalPackets += item.qtyPackets;
        existingProd.taxablePaisa += item.taxablePaisa;
        existingProd.cgstPaisa += item.cgstPaisa;
        existingProd.sgstPaisa += item.sgstPaisa;
        existingProd.igstPaisa += item.igstPaisa;
        existingProd.totalPaisa += item.totalPaisa;
      } else {
        productMap.set(item.productSkuId, {
          productSkuId: item.productSkuId,
          skuCode: item.productSku.skuCode,
          productName: item.productSku.name,
          hsnCode: item.hsnCode,
          totalPackets: item.qtyPackets,
          taxablePaisa: item.taxablePaisa,
          cgstPaisa: item.cgstPaisa,
          sgstPaisa: item.sgstPaisa,
          igstPaisa: item.igstPaisa,
          totalPaisa: item.totalPaisa,
        });
      }
    }
  }

  const totals = postedInvoices.reduce(
    (acc, inv) => ({
      invoiceCount: acc.invoiceCount + 1,
      taxablePaisa: acc.taxablePaisa + inv.taxablePaisa,
      cgstPaisa: acc.cgstPaisa + inv.cgstPaisa,
      sgstPaisa: acc.sgstPaisa + inv.sgstPaisa,
      igstPaisa: acc.igstPaisa + inv.igstPaisa,
      totalPaisa: acc.totalPaisa + inv.totalPaisa,
    }),
    {
      invoiceCount: 0,
      taxablePaisa: 0,
      cgstPaisa: 0,
      sgstPaisa: 0,
      igstPaisa: 0,
      totalPaisa: 0,
    }
  );

  return {
    range,
    totals,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      issuedAt: inv.issuedAt,
      status: inv.status,
      orderNo: inv.salesOrder?.orderNo ?? null,
      customerName: inv.customer.name,
      customerGstin: inv.customer.gstin,
      placeOfSupplyStateCode: inv.placeOfSupplyStateCode,
      stateName: inv.customer.stateName,
      isInterState: inv.isInterState,
      totalPackets: inv.items.reduce((s, it) => s + it.qtyPackets, 0),
      taxablePaisa: inv.taxablePaisa,
      cgstPaisa: inv.cgstPaisa,
      sgstPaisa: inv.sgstPaisa,
      igstPaisa: inv.igstPaisa,
      totalPaisa: inv.totalPaisa,
      paidPaisa: inv.paidPaisa,
      creditNoteNos: inv.creditNotes.map((c) => c.creditNoteNo),
    })),
    cancelledCount: cancelledInvoices.length,
    customerWiseSummary: Array.from(customerMap.values()),
    productWiseSummary: Array.from(productMap.values()),
  };
}

export async function getGstSummaryReport(range: DateRange) {
  const [invoices, creditNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: range.from, lte: range.to },
        status: 'POSTED',
      },
      include: {
        customer: true,
        items: true,
      },
      orderBy: [{ issuedAt: 'asc' }, { sequenceNo: 'asc' }],
    }),
    prisma.creditNote.findMany({
      where: { issuedAt: { gte: range.from, lte: range.to } },
      include: { customer: true },
      orderBy: { issuedAt: 'asc' },
    }),
  ]);

  const gstr1B2B = invoices.map((inv) => {
    const rateSet = Array.from(new Set(inv.items.map((it) => it.gstRateBps / 100)));
    return {
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      issuedAt: inv.issuedAt,
      customerGstin: inv.customer.gstin ?? 'UNREGISTERED',
      customerName: inv.customer.name,
      placeOfSupplyStateCode: inv.placeOfSupplyStateCode,
      placeOfSupplyStateName: inv.customer.stateName,
      supplyType: inv.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)',
      gstRatePct: rateSet.length === 1 ? rateSet[0] : 5,
      taxablePaisa: inv.taxablePaisa,
      cgstPaisa: inv.cgstPaisa,
      sgstPaisa: inv.sgstPaisa,
      igstPaisa: inv.igstPaisa,
      invoiceValuePaisa: inv.totalPaisa,
    };
  });

  const intra = {
    invoiceCount: 0,
    taxablePaisa: 0,
    cgstPaisa: 0,
    sgstPaisa: 0,
    igstPaisa: 0,
    totalTaxPaisa: 0,
    totalValuePaisa: 0,
  };
  const inter = {
    invoiceCount: 0,
    taxablePaisa: 0,
    cgstPaisa: 0,
    sgstPaisa: 0,
    igstPaisa: 0,
    totalTaxPaisa: 0,
    totalValuePaisa: 0,
  };

  for (const inv of invoices) {
    const target = inv.isInterState ? inter : intra;
    target.invoiceCount += 1;
    target.taxablePaisa += inv.taxablePaisa;
    target.cgstPaisa += inv.cgstPaisa;
    target.sgstPaisa += inv.sgstPaisa;
    target.igstPaisa += inv.igstPaisa;
    target.totalTaxPaisa += inv.cgstPaisa + inv.sgstPaisa + inv.igstPaisa;
    target.totalValuePaisa += inv.totalPaisa;
  }

  return {
    range,
    gstr1B2B,
    gstr3bTable31: {
      intraState: intra,
      interState: inter,
      netOutwardTotal: {
        invoiceCount: intra.invoiceCount + inter.invoiceCount,
        taxablePaisa: intra.taxablePaisa + inter.taxablePaisa,
        cgstPaisa: intra.cgstPaisa + inter.cgstPaisa,
        sgstPaisa: intra.sgstPaisa + inter.sgstPaisa,
        igstPaisa: intra.igstPaisa + inter.igstPaisa,
        totalTaxPaisa: intra.totalTaxPaisa + inter.totalTaxPaisa,
        totalValuePaisa: intra.totalValuePaisa + inter.totalValuePaisa,
      },
    },
    creditNotes: creditNotes.map((cn) => ({
      creditNoteNo: cn.creditNoteNo,
      issuedAt: cn.issuedAt,
      customerName: cn.customer.name,
      reason: cn.reason,
      taxablePaisa: cn.taxablePaisa,
      cgstPaisa: cn.cgstPaisa,
      sgstPaisa: cn.sgstPaisa,
      igstPaisa: cn.igstPaisa,
      totalPaisa: cn.totalPaisa,
    })),
  };
}

export async function getPurchaseRegisterReport(range: DateRange) {
  const purchases = await prisma.purchase.findMany({
    where: {
      purchaseDate: { gte: range.from, lte: range.to },
    },
    include: {
      supplier: true,
      items: {
        include: { inventoryItem: true },
      },
    },
    orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }],
  });

  const rows: Array<{
    purchaseId: string;
    purchaseNo: string;
    purchaseDate: Date;
    supplierName: string;
    supplierGstin: string | null;
    supplierInvoiceNo: string | null;
    itemName: string;
    skuCode: string;
    qtyDisplay: string;
    ratePerDisplayDecimal: string;
    displayUnit: string;
    gstRatePct: number;
    taxablePaisa: number;
    gstPaisa: number;
    totalPaisa: number;
    batchNo: string | null;
  }> = [];

  for (const p of purchases) {
    for (const it of p.items) {
      rows.push({
        purchaseId: p.id,
        purchaseNo: p.purchaseNo,
        purchaseDate: p.purchaseDate,
        supplierName: p.supplier.name,
        supplierGstin: p.supplier.gstin,
        supplierInvoiceNo: p.supplierInvoiceNo,
        itemName: it.inventoryItem.name,
        skuCode: it.inventoryItem.skuCode,
        qtyDisplay: `${fromBaseUnits(it.qtyBase, it.inventoryItem.displayFactor)} ${it.inventoryItem.displayUnit}`,
        ratePerDisplayDecimal: it.ratePerDisplayDecimal.toString(),
        displayUnit: it.inventoryItem.displayUnit,
        gstRatePct: it.gstRateBps / 100,
        taxablePaisa: it.taxablePaisa,
        gstPaisa: it.gstPaisa,
        totalPaisa: it.totalPaisa,
        batchNo: it.batchNo,
      });
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({
      lineCount: acc.lineCount + 1,
      taxablePaisa: acc.taxablePaisa + r.taxablePaisa,
      gstPaisa: acc.gstPaisa + r.gstPaisa,
      totalPaisa: acc.totalPaisa + r.totalPaisa,
    }),
    { lineCount: 0, taxablePaisa: 0, gstPaisa: 0, totalPaisa: 0 }
  );

  return { range, totals, rows };
}

export async function getStockAndLedgerReport(range: DateRange) {
  const [balances, ledger] = await Promise.all([
    getAllInventoryBalances(prisma, { from: range.from, to: range.to }),
    prisma.stockLedger.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: {
        inventoryItem: {
          select: {
            skuCode: true,
            name: true,
            category: true,
            displayUnit: true,
            displayFactor: true,
          },
        },
        createdBy: { select: { name: true, role: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return {
    range,
    rawMaterials: balances.filter((b) => b.category === 'RAW_MATERIAL'),
    packagingMaterials: balances.filter((b) => b.category === 'PACKAGING'),
    finishedGoods: balances.filter((b) => b.category === 'FINISHED_GOOD'),
    totalClosingValuePaisa: balances.reduce((s, b) => s + b.closingValuePaisa, 0),
    ledger: ledger.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      skuCode: l.inventoryItem.skuCode,
      itemName: l.inventoryItem.name,
      category: l.inventoryItem.category,
      movementType: l.movementType,
      qtyDeltaDisplay: `${l.qtyBaseDelta >= 0 ? '+' : ''}${fromBaseUnits(l.qtyBaseDelta, l.inventoryItem.displayFactor)} ${l.inventoryItem.displayUnit}`,
      qtyBaseDelta: l.qtyBaseDelta,
      unitCostDecimal: l.unitCostDecimal.toString(),
      displayUnit: l.inventoryItem.displayUnit,
      totalValuePaisa: l.totalValuePaisa,
      batchNo: l.batchNo,
      expiryDate: l.expiryDate,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      notes: l.notes,
      createdByName: l.createdBy.name,
    })),
  };
}

export async function getProductionVarianceReport(range: DateRange) {
  const runs = await prisma.productionRun.findMany({
    where: {
      startedAt: { gte: range.from, lte: range.to },
    },
    include: {
      productSku: { include: { recipe: true } },
      createdBy: { select: { name: true } },
      consumptions: { include: { inventoryItem: true } },
    },
    orderBy: [{ startedAt: 'desc' }],
  });

  const enrichedRuns = await Promise.all(
    runs.map(async (run) => {
      const fifoMat = await computeRunFifoMaterialCost(prisma, run.id);
      const costBreakdown = buildCostBreakdown({
        rawMaterialCostPaisa: run.rawMaterialCostPaisa,
        packagingCostPaisa: run.packagingCostPaisa,
        labourCostPaisa: run.labourCostPaisa,
        gasPowerCostPaisa: run.gasPowerCostPaisa,
        otherOverheadPaisa: run.otherOverheadPaisa,
        actualGoodPackets: run.actualGoodPackets ?? 0,
        sellingPricePaisa: run.productSku.sellingPricePaisa,
        fifoMaterialAndPkgCostPaisa: fifoMat,
      });

      return {
        id: run.id,
        runNo: run.runNo,
        startedAt: run.startedAt,
        productName: run.productSku.name,
        batchNo: run.batchNo,
        batchCount: run.batchCount.toString(),
        expectedPackets: run.expectedPackets,
        actualGoodPackets: run.actualGoodPackets ?? 0,
        damagedPackets: run.damagedPackets,
        yieldVariancePct: Number(run.yieldVariancePct ?? 0),
        isYieldVarianceFlagged: run.isYieldVarianceFlagged,
        hasConsumptionVarianceFlag: run.hasConsumptionVarianceFlag,
        consumptions: run.consumptions.map((c) => ({
          itemName: c.inventoryItem.name,
          isPackaging: c.isPackaging,
          plannedDisplay: `${fromBaseUnits(c.plannedQtyBase, c.inventoryItem.displayFactor)} ${c.inventoryItem.displayUnit}`,
          actualDisplay: `${fromBaseUnits(c.actualQtyBase + c.damagedQtyBase, c.inventoryItem.displayFactor)} ${c.inventoryItem.displayUnit}`,
          damagedQtyBase: c.damagedQtyBase,
          variancePct: Number(c.variancePct),
          isVarianceFlagged: c.isVarianceFlagged,
          totalCostPaisa: c.totalCostPaisa,
        })),
        costBreakdown,
      };
    })
  );

  const flaggedRunCount = enrichedRuns.filter(
    (r) => r.isYieldVarianceFlagged || r.hasConsumptionVarianceFlag
  ).length;

  return {
    range,
    runCount: enrichedRuns.length,
    flaggedRunCount,
    runs: enrichedRuns,
  };
}

export async function getPaymentsAndAgeingReport(range: DateRange) {
  const [payments, customers, openPostedInvoices] = await Promise.all([
    prisma.payment.findMany({
      where: { receivedAt: { gte: range.from, lte: range.to } },
      include: {
        customer: true,
        invoice: { select: { invoiceNo: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: [{ receivedAt: 'desc' }],
    }),
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.invoice.findMany({
      where: { status: 'POSTED' },
      orderBy: { issuedAt: 'asc' },
    }),
  ]);

  const allPayments = await prisma.payment.findMany({
    select: { customerId: true, invoiceId: true, amountPaisa: true },
  });

  const asOf = range.to;
  const customerAgeing = customers.map((c) => {
    const custInvoices = openPostedInvoices.filter((inv) => inv.customerId === c.id);
    const totalInvoicedPaisa = custInvoices.reduce((s, i) => s + i.totalPaisa, 0);
    const totalCollectedPaisa = allPayments
      .filter((p) => p.customerId === c.id)
      .reduce((s, p) => s + p.amountPaisa, 0);

    const openList = custInvoices.map((i) => ({
      issuedAt: i.issuedAt,
      outstandingPaisa: Math.max(0, i.totalPaisa - i.paidPaisa),
    }));
    const buckets = computeAgeingBuckets(openList, asOf);
    const netOutstandingPaisa = Math.max(0, totalInvoicedPaisa - totalCollectedPaisa);

    return {
      customerId: c.id,
      customerName: c.name,
      customerType: c.type,
      stateName: c.stateName,
      totalInvoicedPaisa,
      totalCollectedPaisa,
      netOutstandingPaisa,
      ...buckets,
    };
  });

  const totalCollectedInPeriodPaisa = payments.reduce((s, p) => s + p.amountPaisa, 0);
  const totalOutstandingPaisa = customerAgeing.reduce(
    (s, c) => s + c.netOutstandingPaisa,
    0
  );

  return {
    range,
    totalCollectedInPeriodPaisa,
    totalOutstandingPaisa,
    payments: payments.map((p) => ({
      id: p.id,
      paymentNo: p.paymentNo,
      receivedAt: p.receivedAt,
      customerName: p.customer.name,
      invoiceNo: p.invoice?.invoiceNo ?? 'On-Account',
      method: p.method,
      referenceNo: p.referenceNo,
      amountPaisa: p.amountPaisa,
      recordedByName: p.recordedBy.name,
    })),
    customerAgeing,
  };
}

export async function getOwnerExecutiveSummary() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const monthRange = resolveReportDateRange();
  const [todaysOrders, stockReport, prodReport, receivablesReport] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { orderDate: { gte: startOfToday, lte: endOfToday } },
      select: { id: true, orderNo: true, totalPaisa: true, status: true },
    }),
    getStockAndLedgerReport(monthRange),
    getProductionVarianceReport(monthRange),
    getPaymentsAndAgeingReport(monthRange),
  ]);

  const allBalances = [
    ...stockReport.rawMaterials,
    ...stockReport.packagingMaterials,
    ...stockReport.finishedGoods,
  ];
  const lowStockAlerts = allBalances.filter((b) => b.isLowStock);
  const varianceAlerts = prodReport.runs.filter(
    (r) => r.isYieldVarianceFlagged || r.hasConsumptionVarianceFlag
  );
  const latestRun = prodReport.runs[0] ?? null;

  return {
    generatedAt: now.toISOString(),
    todaysOrders: {
      count: todaysOrders.length,
      totalPaisa: todaysOrders.reduce((s, o) => s + o.totalPaisa, 0),
    },
    stockLevels: {
      rawMaterials: stockReport.rawMaterials,
      packagingMaterials: stockReport.packagingMaterials,
      finishedGoods: stockReport.finishedGoods,
      lowStockAlerts,
      totalInventoryValuePaisa: stockReport.totalClosingValuePaisa,
    },
    varianceAlerts,
    latestCosting: latestRun
      ? {
          runNo: latestRun.runNo,
          productName: latestRun.productName,
          actualGoodPackets: latestRun.actualGoodPackets,
          costPerPacketPaisa: latestRun.costBreakdown.costPerPacketPaisa,
          sellingPricePaisa: latestRun.costBreakdown.sellingPricePaisa,
          grossMarginPerPacketPaisa: latestRun.costBreakdown.grossMarginPerPacketPaisa,
          grossMarginPct: latestRun.costBreakdown.grossMarginPct,
          fifoCostPerPacketPaisa: latestRun.costBreakdown.fifoCostPerPacketPaisa,
        }
      : null,
    receivables: {
      totalOutstandingPaisa: receivablesReport.totalOutstandingPaisa,
      customerDues: receivablesReport.customerAgeing.filter(
        (c) => c.totalInvoicedPaisa > 0 || c.netOutstandingPaisa > 0
      ),
    },
  };
}

export function formatPaisaForExport(paisa: number): string {
  return paisaToRupeesString(paisa);
}

export function formatInrForPdf(paisa: number): string {
  return formatINR(paisa);
}
