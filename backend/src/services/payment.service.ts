import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface RecordPaymentInput {
  customerId: string;
  invoiceId?: string;
  amountPaisa: number;
  method: PaymentMethod;
  referenceNo?: string;
  notes?: string;
  receivedAt?: string;
  recordedById: string;
}

export async function recordCustomerPayment(input: RecordPaymentInput) {
  if (!Number.isInteger(input.amountPaisa) || input.amountPaisa <= 0) {
    throw new Error('Payment amount must be a positive integer in paisa.');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) {
      throw new Error('Customer not found.');
    }

    if (input.invoiceId) {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
      });
      if (!invoice) {
        throw new Error('Invoice not found.');
      }
      if (invoice.customerId !== customer.id) {
        throw new Error('Invoice does not belong to the selected customer.');
      }
      if (invoice.status !== 'POSTED') {
        throw new Error(`Cannot record payment against ${invoice.status} invoice.`);
      }
      const outstanding = invoice.totalPaisa - invoice.paidPaisa;
      if (input.amountPaisa > outstanding) {
        throw new Error(
          `Payment (${input.amountPaisa} paisa) exceeds invoice outstanding balance (${outstanding} paisa).`
        );
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidPaisa: invoice.paidPaisa + input.amountPaisa },
      });
    }

    const existingCount = await tx.payment.count();
    const paymentNo = `PAY-${(existingCount + 1).toString().padStart(4, '0')}`;
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

    const payment = await tx.payment.create({
      data: {
        paymentNo,
        customerId: customer.id,
        invoiceId: input.invoiceId ?? null,
        amountPaisa: input.amountPaisa,
        method: input.method,
        referenceNo: input.referenceNo?.trim() || null,
        notes: input.notes?.trim() || null,
        receivedAt,
        recordedById: input.recordedById,
      },
      include: {
        customer: true,
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            totalPaisa: true,
            paidPaisa: true,
            status: true,
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.recordedById,
        action: 'RECORD_PAYMENT',
        entityType: 'Payment',
        entityId: payment.id,
        afterJson: {
          paymentNo: payment.paymentNo,
          customerName: customer.name,
          invoiceNo: payment.invoice?.invoiceNo ?? null,
          amountPaisa: payment.amountPaisa,
          method: payment.method,
        },
      },
    });

    return payment;
  });
}

export async function getPaymentsAndReceivables() {
  const [payments, customers, postedInvoices, creditNotes] = await Promise.all([
    prisma.payment.findMany({
      include: {
        customer: true,
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            totalPaisa: true,
            paidPaisa: true,
            status: true,
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.invoice.findMany({
      where: { status: 'POSTED' },
      include: {
        customer: { select: { id: true, name: true, stateCode: true, stateName: true } },
      },
      orderBy: [{ issuedAt: 'desc' }],
    }),
    prisma.creditNote.findMany({
      select: { customerId: true, totalPaisa: true },
    }),
  ]);

  const receivables = customers.map((c) => {
    const custInvoices = postedInvoices.filter((inv) => inv.customerId === c.id);
    const totalInvoicedPaisa = custInvoices.reduce((s, inv) => s + inv.totalPaisa, 0);
    const totalPaidOnInvoices = custInvoices.reduce((s, inv) => s + inv.paidPaisa, 0);
    const unallocatedPayments = payments
      .filter((p) => p.customerId === c.id && !p.invoiceId)
      .reduce((s, p) => s + p.amountPaisa, 0);
    const totalPaidPaisa = totalPaidOnInvoices + unallocatedPayments;
    const creditNoteTotalPaisa = creditNotes
      .filter((cn) => cn.customerId === c.id)
      .reduce((s, cn) => s + cn.totalPaisa, 0);

    return {
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      customerType: c.type,
      stateCode: c.stateCode,
      stateName: c.stateName,
      totalInvoicedPaisa,
      totalPaidPaisa,
      creditNoteTotalPaisa,
      outstandingPaisa: Math.max(0, totalInvoicedPaisa - totalPaidPaisa),
    };
  });

  const openInvoices = postedInvoices
    .map((inv) => ({
      ...inv,
      outstandingPaisa: Math.max(0, inv.totalPaisa - inv.paidPaisa),
    }))
    .filter((inv) => inv.outstandingPaisa > 0);

  return {
    payments,
    receivables,
    openInvoices,
  };
}
