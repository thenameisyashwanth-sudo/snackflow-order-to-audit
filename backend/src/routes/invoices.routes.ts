import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  cancelInvoiceWithCreditNote,
  dispatchInvoice,
} from '../services/invoice.service.js';
import { generateGstInvoicePdfBuffer } from '../services/invoicePdf.service.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requireRole('ADMIN', 'OWNER', 'AUDITOR'),
  async (_req, res) => {
    const invoices = await prisma.invoice.findMany({
      include: {
        customer: true,
        salesOrder: { select: { id: true, orderNo: true, salesman: { select: { name: true } } } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            productSku: {
              select: {
                id: true,
                skuCode: true,
                name: true,
                packetsPerCarton: true,
              },
            },
          },
        },
        creditNotes: true,
        payments: true,
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const enriched = invoices.map((inv) => ({
      ...inv,
      outstandingPaisa:
        inv.status === 'CANCELLED' ? 0 : Math.max(0, inv.totalPaisa - inv.paidPaisa),
    }));

    res.json({ invoices: enriched });
  }
);

router.get(
  '/:id/pdf',
  authenticate,
  requireRole('ADMIN', 'OWNER', 'AUDITOR', 'SALESMAN'),
  async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: String(req.params.id) },
      include: {
        customer: true,
        salesOrder: { select: { orderNo: true, salesmanId: true } },
        items: {
          include: {
            productSku: {
              select: {
                name: true,
                skuCode: true,
                packetsPerCarton: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (
      req.user!.role === 'SALESMAN' &&
      invoice.salesOrder?.salesmanId !== req.user!.id
    ) {
      res.status(403).json({ error: 'Salesmen can only download PDFs for their own orders.' });
      return;
    }

    const buffer = await generateGstInvoicePdfBuffer(invoice);
    const safeFileName = invoice.invoiceNo.replace(/[/\\]/g, '-');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${safeFileName}.pdf"`);
    res.send(buffer);
  }
);

router.post(
  '/:id/dispatch',
  authenticate,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const invoice = await dispatchInvoice({
        invoiceId: String(req.params.id),
        userId: req.user!.id,
      });
      res.json({ invoice });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to dispatch invoice',
      });
    }
  }
);

const cancelSchema = z.object({
  reason: z.string().min(3, 'Cancellation reason is required'),
  restockGoods: z.boolean().optional(),
});

router.post(
  '/:id/cancel',
  authenticate,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Cancellation reason required' });
      return;
    }

    try {
      const result = await cancelInvoiceWithCreditNote({
        invoiceId: String(req.params.id),
        reason: parsed.data.reason,
        restockGoods: parsed.data.restockGoods,
        userId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to cancel invoice',
      });
    }
  }
);

export default router;
