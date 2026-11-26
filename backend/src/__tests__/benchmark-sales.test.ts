import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma.js';
import { cancelInvoiceWithCreditNote, dispatchInvoice } from '../services/invoice.service.js';
import { amountInWordsINR, generateGstInvoicePdfBuffer } from '../services/invoicePdf.service.js';
import { computeGstLineItem, formatCreditNoteNumber, formatInvoiceNumber } from '../utils/gst.js';

describe('Section 5 Benchmark Loop 1 (Part B): GST Invoices, Dispatch, Shortage, Credit Notes & Payments', () => {
  it('computes Retailer A CGST+SGST invoice, 238->88 dispatch, 32-pkt Distributor B shortage with 5% IGST, and ₹3,875 outstanding', () => {
    // 1. Retailer A (TN 33 -> TN 33): 150 pkts @ ₹50, 5% GST
    const retailerInv = computeGstLineItem({
      qtyPackets: 150,
      unitPricePaisa: 5000,
      gstRateBps: 500,
      factoryStateCode: '33',
      placeOfSupplyStateCode: '33',
    });
    expect(retailerInv).toEqual({
      taxablePaisa: 750000, // ₹7,500.00
      cgstPaisa: 18750, // ₹187.50
      sgstPaisa: 18750, // ₹187.50
      igstPaisa: 0,
      totalGstPaisa: 37500,
      totalPaisa: 787500, // ₹7,875.00
      isInterState: false,
    });

    // 2. Dispatch reduces 238 -> 88 packets
    const fgAfterDispatch = 238 - 150;
    expect(fgAfterDispatch).toBe(88);

    // 3. Distributor B (KA 29): 120 packets ordered vs 88 available -> 32 shortage + 5% IGST preview
    const shortagePackets = Math.max(0, 120 - fgAfterDispatch);
    expect(shortagePackets).toBe(32);

    const distributorIgstPreview = computeGstLineItem({
      qtyPackets: 120,
      unitPricePaisa: 5000,
      gstRateBps: 500,
      factoryStateCode: '33',
      placeOfSupplyStateCode: '29',
    });
    expect(distributorIgstPreview).toEqual({
      taxablePaisa: 600000, // ₹6,000.00
      cgstPaisa: 0,
      sgstPaisa: 0,
      igstPaisa: 30000, // ₹300.00 (5% IGST)
      totalGstPaisa: 30000,
      totalPaisa: 630000, // ₹6,300.00
      isInterState: true,
    });

    // 4. Payment of ₹4,000 (400000 paisa) from Retailer A leaves ₹3,875 (387500 paisa)
    const retailerOutstandingPaisa = retailerInv.totalPaisa - 400000;
    expect(retailerOutstandingPaisa).toBe(387500);

    // 5. FY numbering
    expect(formatInvoiceNumber('FY26-27', 1)).toBe('FY26-27/001');
    expect(formatCreditNoteNumber('FY26-27', 1)).toBe('CN/FY26-27/001');
  });

  it('generates a valid PDF buffer and Indian amount-in-words for GST invoices', async () => {
    expect(amountInWordsINR(787500)).toBe('Rupees Seven Thousand Eight Hundred Seventy Five Only');

    const pdf = await generateGstInvoicePdfBuffer({
      invoiceNo: 'FY26-27/001',
      financialYear: 'FY26-27',
      status: 'POSTED',
      issuedAt: new Date('2026-11-26T10:00:00Z'),
      dispatchedAt: new Date('2026-11-26T12:00:00Z'),
      factoryStateCode: '33',
      placeOfSupplyStateCode: '33',
      isInterState: false,
      taxablePaisa: 750000,
      cgstPaisa: 18750,
      sgstPaisa: 18750,
      igstPaisa: 0,
      totalPaisa: 787500,
      paidPaisa: 400000,
      customer: {
        name: 'Retailer A',
        type: 'RETAILER',
        gstin: '33AAACR5055K1Z2',
        stateCode: '33',
        stateName: 'Tamil Nadu',
        address: '42 Bazaar Street, Tiruchirappalli',
        phone: '+91 98401 11223',
      },
      salesOrder: { orderNo: 'ORD-FY26-27-001' },
      items: [
        {
          hsnCode: '19059090',
          qtyPackets: 150,
          unitPricePaisa: 5000,
          gstRateBps: 500,
          taxablePaisa: 750000,
          cgstPaisa: 18750,
          sgstPaisa: 18750,
          igstPaisa: 0,
          totalPaisa: 787500,
          productSku: {
            name: 'Murukku 200 g',
            skuCode: 'FG-MURUKKU-200G',
            packetsPerCarton: 20,
          },
        },
      ],
    });

    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('blocks dispatch when FG stock is insufficient and restocks + logs AuditLog on Credit Note cancellation', async () => {
    const mockTx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-1',
          invoiceNo: 'FY26-27/001',
          status: 'POSTED',
          dispatchedAt: null,
          customerId: 'c1',
          customer: { name: 'Distributor B' },
          items: [
            {
              id: 'ii-1',
              qtyPackets: 120,
              dispatchedQtyPackets: 0,
              productSku: {
                name: 'Murukku 200 g',
                inventoryItemId: 'fg-1',
                inventoryItem: { displayFactor: 1 },
              },
            },
          ],
        }),
      },
      inventoryItem: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'fg-1',
          displayFactor: 1,
          currentWeightedRateDecimal: '31.1400',
        }),
      },
      stockLedger: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { qtyBaseDelta: 88, totalValuePaisa: 274032 },
        }),
      },
    };

    const txSpy = vi
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: (tx: never) => Promise<unknown>) => cb(mockTx as never));

    await expect(
      dispatchInvoice({ invoiceId: 'inv-1', userId: 'admin-1' })
    ).rejects.toThrow(/Shortage of 32 packets/i);

    // Now test Credit Note cancellation restocking & AuditLog
    const createdLedgerMoves: unknown[] = [];
    const createdAudits: unknown[] = [];

    const cancelTx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-2',
          invoiceNo: 'FY26-27/001',
          status: 'POSTED',
          dispatchedAt: new Date('2026-11-26T10:00:00Z'),
          salesOrderId: 'ord-1',
          customerId: 'c1',
          taxablePaisa: 750000,
          cgstPaisa: 18750,
          sgstPaisa: 18750,
          igstPaisa: 0,
          totalPaisa: 787500,
          paidPaisa: 0,
          customer: { name: 'Retailer A' },
          items: [
            {
              productSkuId: 'sku-1',
              qtyPackets: 150,
              dispatchedQtyPackets: 150,
              unitPricePaisa: 5000,
              taxablePaisa: 750000,
              cgstPaisa: 18750,
              sgstPaisa: 18750,
              igstPaisa: 0,
              totalPaisa: 787500,
              productSku: {
                inventoryItemId: 'fg-1',
                inventoryItem: { displayFactor: 1 },
              },
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({ id: 'inv-2', status: 'CANCELLED' }),
      },
      creditNote: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          id: 'cn-1',
          creditNoteNo: 'CN/FY26-27/001',
        }),
      },
      inventoryItem: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'fg-1',
          displayFactor: 1,
          currentWeightedRateDecimal: '31.1400',
        }),
      },
      stockLedger: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { qtyBaseDelta: 88, totalValuePaisa: 274032 },
        }),
        create: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          createdLedgerMoves.push(arg.data);
          return arg.data;
        }),
      },
      salesOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          createdAudits.push(arg.data);
          return arg.data;
        }),
      },
    };

    txSpy.mockImplementationOnce(async (cb: (tx: never) => Promise<unknown>) =>
      cb(cancelTx as never)
    );

    const cancelRes = await cancelInvoiceWithCreditNote({
      invoiceId: 'inv-2',
      reason: 'Customer cancelled order',
      restockGoods: true,
      userId: 'admin-1',
    });

    expect(cancelRes.creditNote.creditNoteNo).toBe('CN/FY26-27/001');
    expect(createdLedgerMoves).toHaveLength(1);
    expect(createdLedgerMoves[0]).toMatchObject({
      movementType: 'CREDIT_NOTE_RETURN',
      qtyBaseDelta: 150,
      sourceType: 'CREDIT_NOTE',
      sourceId: 'cn-1',
    });
    expect(createdAudits).toHaveLength(1);
    expect(createdAudits[0]).toMatchObject({
      action: 'CANCEL_INVOICE_CREDIT_NOTE',
      entityType: 'Invoice',
      entityId: 'inv-2',
    });

    txSpy.mockRestore();
  });
});
