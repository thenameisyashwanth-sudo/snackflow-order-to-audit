import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  getGstSummaryReport,
  getOwnerExecutiveSummary,
  getPaymentsAndAgeingReport,
  getProductionVarianceReport,
  getPurchaseRegisterReport,
  getSalesRegisterReport,
  getStockAndLedgerReport,
  resolveReportDateRange,
} from '../services/report.service.js';
import { ExportFormat, exportReport, ReportType } from '../services/reportExport.service.js';

const router = Router();

const ALLOWED_REPORT_ROLES = ['AUDITOR', 'OWNER', 'ADMIN'] as const;

function parseRange(query: Record<string, unknown>) {
  const fromDate = typeof query.fromDate === 'string' ? query.fromDate : undefined;
  const toDate = typeof query.toDate === 'string' ? query.toDate : undefined;
  return resolveReportDateRange(fromDate, toDate);
}

router.get(
  '/owner-summary',
  authenticate,
  requireRole('OWNER', 'ADMIN'),
  async (_req, res) => {
    const summary = await getOwnerExecutiveSummary();
    res.json(summary);
  }
);

router.get('/sales', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getSalesRegisterReport(parseRange(req.query));
  res.json(report);
});

router.get('/gst', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getGstSummaryReport(parseRange(req.query));
  res.json(report);
});

router.get('/purchases', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getPurchaseRegisterReport(parseRange(req.query));
  res.json(report);
});

router.get('/stock', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getStockAndLedgerReport(parseRange(req.query));
  res.json(report);
});

router.get('/production', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getProductionVarianceReport(parseRange(req.query));
  res.json(report);
});

router.get('/receivables', authenticate, requireRole(...ALLOWED_REPORT_ROLES), async (req, res) => {
  const report = await getPaymentsAndAgeingReport(parseRange(req.query));
  res.json(report);
});

const VALID_REPORT_TYPES: ReportType[] = [
  'sales',
  'gst',
  'purchases',
  'stock',
  'production',
  'receivables',
];
const VALID_FORMATS: ExportFormat[] = ['xlsx', 'csv', 'pdf', 'tally'];

router.get(
  '/:reportType/export',
  authenticate,
  requireRole(...ALLOWED_REPORT_ROLES),
  async (req, res) => {
    const reportType = String(req.params.reportType) as ReportType;
    const format = (String(req.query.format ?? 'xlsx').toLowerCase()) as ExportFormat;

    if (!VALID_REPORT_TYPES.includes(reportType)) {
      res.status(400).json({ error: `Unsupported reportType: ${reportType}` });
      return;
    }
    if (!VALID_FORMATS.includes(format)) {
      res.status(400).json({ error: `Unsupported format: ${format}` });
      return;
    }

    const { buffer, contentType, filename } = await exportReport(
      reportType,
      format,
      parseRange(req.query)
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
);

export default router;
