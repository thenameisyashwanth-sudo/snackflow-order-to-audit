import { describe, expect, it } from 'vitest';
import { computeAgeingBuckets, resolveReportDateRange } from '../services/report.service.js';
import {
  buildTallyXmlEnvelope,
  sectionsToCsvBuffer,
  sectionsToPdfBuffer,
  sectionsToXlsxBuffer,
  TabularSection,
} from '../services/reportExport.service.js';

describe('Auditor Reports, Ageing Buckets & Multi-Format Exports', () => {
  it('computes 0-30, 31-60, 61-90, and 90+ ageing buckets accurately', () => {
    const asOf = new Date('2026-11-26T23:59:59Z');
    const buckets = computeAgeingBuckets(
      [
        { issuedAt: new Date('2026-11-20T10:00:00Z'), outstandingPaisa: 387500 }, // 6 days -> 0-30
        { issuedAt: new Date('2026-10-15T10:00:00Z'), outstandingPaisa: 100000 }, // 42 days -> 31-60
        { issuedAt: new Date('2026-09-10T10:00:00Z'), outstandingPaisa: 50000 }, // 77 days -> 61-90
        { issuedAt: new Date('2026-07-01T10:00:00Z'), outstandingPaisa: 25000 }, // 148 days -> 90+
      ],
      asOf
    );

    expect(buckets).toEqual({
      bucket0to30Paisa: 387500,
      bucket31to60Paisa: 100000,
      bucket61to90Paisa: 50000,
      bucket90PlusPaisa: 25000,
    });
  });

  it('generates valid non-empty XLSX, CSV, PDF, and Tally XML export buffers', async () => {
    const range = resolveReportDateRange('2026-11-01', '2026-11-30');
    const sections: TabularSection[] = [
      {
        sheetName: 'Sales Register',
        headers: ['Invoice No', 'Customer', 'Taxable', 'CGST', 'SGST', 'Total'],
        rows: [['FY26-27/001', 'Retailer A', '7500.00', '187.50', '187.50', '7875.00']],
      },
    ];

    const xlsx = sectionsToXlsxBuffer(sections);
    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK'); // ZIP / XLSX header
    expect(xlsx.length).toBeGreaterThan(500);

    const csv = sectionsToCsvBuffer(sections);
    const csvText = csv.toString('utf8');
    expect(csvText).toContain('FY26-27/001');
    expect(csvText).toContain('7875.00');

    const pdf = await sectionsToPdfBuffer('Sales Register Report', range, sections);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(800);

    const tally = buildTallyXmlEnvelope([
      {
        voucherType: 'Sales',
        dateYyyymmdd: '20261126',
        voucherNumber: 'FY26-27/001',
        partyLedgerName: 'Retailer A',
        narration: 'GST Tax Invoice FY26-27/001',
        ledgerEntries: [
          { ledgerName: 'Retailer A', isDeemedPositive: true, amountRupees: '7875.00' },
          { ledgerName: 'GST Sales Account', isDeemedPositive: false, amountRupees: '7500.00' },
          { ledgerName: 'Output CGST', isDeemedPositive: false, amountRupees: '187.50' },
          { ledgerName: 'Output SGST', isDeemedPositive: false, amountRupees: '187.50' },
        ],
      },
    ]);
    const xmlText = tally.toString('utf8');
    expect(xmlText).toContain('<ENVELOPE>');
    expect(xmlText).toContain('FY26-27/001');
    expect(xmlText).toContain('Output CGST');
  });
});
