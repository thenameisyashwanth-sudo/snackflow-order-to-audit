import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { formatINR, paisaToRupeesString } from '../utils/money.js';
import {
  DateRange,
  getGstSummaryReport,
  getPaymentsAndAgeingReport,
  getProductionVarianceReport,
  getPurchaseRegisterReport,
  getSalesRegisterReport,
  getStockAndLedgerReport,
} from './report.service.js';

export type ReportType =
  | 'sales'
  | 'gst'
  | 'purchases'
  | 'stock'
  | 'production'
  | 'receivables';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'tally';

export interface TabularSection {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function escapeCsvCell(val: string | number): string {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sectionsToCsvBuffer(sections: TabularSection[]): Buffer {
  const lines: string[] = [];
  for (const sec of sections) {
    lines.push(escapeCsvCell(`=== ${sec.sheetName} ===`));
    lines.push(sec.headers.map(escapeCsvCell).join(','));
    for (const row of sec.rows) {
      lines.push(row.map(escapeCsvCell).join(','));
    }
    lines.push('');
  }
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

export function sectionsToXlsxBuffer(sections: TabularSection[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sec of sections) {
    const aoa = [sec.headers, ...sec.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const safeName = sec.sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return out;
}

export function sectionsToPdfBuffer(
  title: string,
  range: DateRange,
  sections: TabularSection[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(`${env.factoryName} — ${title}`, 32, 30)
      .fontSize(9)
      .font('Helvetica')
      .text(
        `GSTIN: ${env.factoryGstin} | Period: ${range.fromIso} to ${range.toIso} | Generated: ${new Date().toLocaleString('en-IN')}`,
        32,
        50
      );

    let y = 74;
    const pageWidth = 778;

    for (const sec of sections) {
      if (y > 510) {
        doc.addPage();
        y = 32;
      }

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#92400e').text(sec.sheetName, 32, y);
      y += 18;

      const colCount = Math.max(1, sec.headers.length);
      const colWidth = pageWidth / colCount;

      doc.rect(32, y, pageWidth, 18).fill('#f5f5f4');
      doc.fillColor('#1c1917').font('Helvetica-Bold').fontSize(7.5);
      sec.headers.forEach((h, idx) => {
        doc.text(h, 35 + idx * colWidth, y + 5, { width: colWidth - 6, ellipsis: true });
      });
      y += 20;

      doc.font('Helvetica').fontSize(7.5);
      if (sec.rows.length === 0) {
        doc.text('No records in selected period.', 35, y);
        y += 16;
      } else {
        for (const row of sec.rows) {
          if (y > 540) {
            doc.addPage();
            y = 32;
          }
          row.forEach((cell, idx) => {
            doc.text(String(cell), 35 + idx * colWidth, y, {
              width: colWidth - 6,
              ellipsis: true,
            });
          });
          y += 15;
          doc.moveTo(32, y - 2).lineTo(32 + pageWidth, y - 2).stroke('#e7e5e4');
        }
      }
      y += 14;
    }

    doc.end();
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildTallyXmlEnvelope(vouchers: Array<{
  voucherType: string;
  dateYyyymmdd: string;
  voucherNumber: string;
  partyLedgerName: string;
  narration: string;
  ledgerEntries: Array<{ ledgerName: string; isDeemedPositive: boolean; amountRupees: string }>;
}>): Buffer {
  const messages = vouchers
    .map((v) => {
      const entriesXml = v.ledgerEntries
        .map(
          (e) => `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(e.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${e.isDeemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${e.isDeemedPositive ? `-${e.amountRupees}` : e.amountRupees}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`
        )
        .join('');

      return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${escapeXml(v.voucherType)}" ACTION="Create">
          <DATE>${v.dateYyyymmdd}</DATE>
          <VOUCHERTYPENAME>${escapeXml(v.voucherType)}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(v.partyLedgerName)}</PARTYLEDGERNAME>
          <NARRATION>${escapeXml(v.narration)}</NARRATION>
          ${entriesXml}
        </VOUCHER>
      </TALLYMESSAGE>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(env.factoryName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  return Buffer.from(xml, 'utf8');
}

export async function exportReport(
  reportType: ReportType,
  format: ExportFormat,
  range: DateRange
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  let title = '';
  let sections: TabularSection[] = [];
  let tallyVouchers: Parameters<typeof buildTallyXmlEnvelope>[0] = [];

  if (reportType === 'sales') {
    const data = await getSalesRegisterReport(range);
    title = 'Sales Register Report';
    sections = [
      {
        sheetName: 'Sales Register',
        headers: [
          'Invoice No',
          'Date',
          'Status',
          'Customer',
          'GSTIN',
          'State',
          'Packets',
          'Taxable (INR)',
          'CGST (INR)',
          'SGST (INR)',
          'IGST (INR)',
          'Total (INR)',
          'Credit Notes',
        ],
        rows: data.invoices.map((inv) => [
          inv.invoiceNo,
          new Date(inv.issuedAt).toISOString().slice(0, 10),
          inv.status,
          inv.customerName,
          inv.customerGstin ?? 'UNREGISTERED',
          `${inv.placeOfSupplyStateCode}-${inv.stateName}`,
          inv.totalPackets,
          paisaToRupeesString(inv.taxablePaisa),
          paisaToRupeesString(inv.cgstPaisa),
          paisaToRupeesString(inv.sgstPaisa),
          paisaToRupeesString(inv.igstPaisa),
          paisaToRupeesString(inv.totalPaisa),
          inv.creditNoteNos.join('; ') || '-',
        ]),
      },
      {
        sheetName: 'Customer Summary',
        headers: ['Customer', 'GSTIN', 'Invoices', 'Packets', 'Taxable (INR)', 'Total (INR)'],
        rows: data.customerWiseSummary.map((c) => [
          c.customerName,
          c.gstin ?? 'UNREGISTERED',
          c.invoiceCount,
          c.totalPackets,
          paisaToRupeesString(c.taxablePaisa),
          paisaToRupeesString(c.totalPaisa),
        ]),
      },
      {
        sheetName: 'Product Summary',
        headers: ['SKU', 'Product', 'HSN', 'Packets', 'Taxable (INR)', 'Total (INR)'],
        rows: data.productWiseSummary.map((p) => [
          p.skuCode,
          p.productName,
          p.hsnCode,
          p.totalPackets,
          paisaToRupeesString(p.taxablePaisa),
          paisaToRupeesString(p.totalPaisa),
        ]),
      },
    ];

    tallyVouchers = data.invoices
      .filter((i) => i.status === 'POSTED')
      .map((inv) => ({
        voucherType: 'Sales',
        dateYyyymmdd: new Date(inv.issuedAt).toISOString().slice(0, 10).replace(/-/g, ''),
        voucherNumber: inv.invoiceNo,
        partyLedgerName: inv.customerName,
        narration: `GST Tax Invoice ${inv.invoiceNo} (${inv.totalPackets} pkts)`,
        ledgerEntries: [
          {
            ledgerName: inv.customerName,
            isDeemedPositive: true,
            amountRupees: paisaToRupeesString(inv.totalPaisa),
          },
          {
            ledgerName: 'GST Sales Account',
            isDeemedPositive: false,
            amountRupees: paisaToRupeesString(inv.taxablePaisa),
          },
          ...(inv.cgstPaisa > 0
            ? [
                {
                  ledgerName: 'Output CGST',
                  isDeemedPositive: false,
                  amountRupees: paisaToRupeesString(inv.cgstPaisa),
                },
                {
                  ledgerName: 'Output SGST',
                  isDeemedPositive: false,
                  amountRupees: paisaToRupeesString(inv.sgstPaisa),
                },
              ]
            : []),
          ...(inv.igstPaisa > 0
            ? [
                {
                  ledgerName: 'Output IGST',
                  isDeemedPositive: false,
                  amountRupees: paisaToRupeesString(inv.igstPaisa),
                },
              ]
            : []),
        ],
      }));
  } else if (reportType === 'gst') {
    const data = await getGstSummaryReport(range);
    title = 'GST Outward Supplies (GSTR-1 & GSTR-3B)';
    sections = [
      {
        sheetName: 'GSTR-1 B2B Invoices',
        headers: [
          'GSTIN/UIN',
          'Receiver Name',
          'Invoice No',
          'Date',
          'Place of Supply',
          'Supply Type',
          'Rate %',
          'Taxable (INR)',
          'CGST (INR)',
          'SGST (INR)',
          'IGST (INR)',
          'Invoice Value (INR)',
        ],
        rows: data.gstr1B2B.map((r) => [
          r.customerGstin,
          r.customerName,
          r.invoiceNo,
          new Date(r.issuedAt).toISOString().slice(0, 10),
          `${r.placeOfSupplyStateCode}-${r.placeOfSupplyStateName}`,
          r.supplyType,
          `${r.gstRatePct}%`,
          paisaToRupeesString(r.taxablePaisa),
          paisaToRupeesString(r.cgstPaisa),
          paisaToRupeesString(r.sgstPaisa),
          paisaToRupeesString(r.igstPaisa),
          paisaToRupeesString(r.invoiceValuePaisa),
        ]),
      },
      {
        sheetName: 'GSTR-3B Table 3.1',
        headers: ['Nature of Supplies', 'Invoices', 'Taxable (INR)', 'CGST', 'SGST', 'IGST'],
        rows: [
          [
            'Intra-State Taxable Supplies',
            data.gstr3bTable31.intraState.invoiceCount,
            paisaToRupeesString(data.gstr3bTable31.intraState.taxablePaisa),
            paisaToRupeesString(data.gstr3bTable31.intraState.cgstPaisa),
            paisaToRupeesString(data.gstr3bTable31.intraState.sgstPaisa),
            '0.00',
          ],
          [
            'Inter-State Taxable Supplies',
            data.gstr3bTable31.interState.invoiceCount,
            paisaToRupeesString(data.gstr3bTable31.interState.taxablePaisa),
            '0.00',
            '0.00',
            paisaToRupeesString(data.gstr3bTable31.interState.igstPaisa),
          ],
          [
            'Total Outward Supplies',
            data.gstr3bTable31.netOutwardTotal.invoiceCount,
            paisaToRupeesString(data.gstr3bTable31.netOutwardTotal.taxablePaisa),
            paisaToRupeesString(data.gstr3bTable31.netOutwardTotal.cgstPaisa),
            paisaToRupeesString(data.gstr3bTable31.netOutwardTotal.sgstPaisa),
            paisaToRupeesString(data.gstr3bTable31.netOutwardTotal.igstPaisa),
          ],
        ],
      },
    ];
  } else if (reportType === 'purchases') {
    const data = await getPurchaseRegisterReport(range);
    title = 'Purchase Register Report';
    sections = [
      {
        sheetName: 'Purchase Register',
        headers: [
          'Purchase No',
          'Date',
          'Supplier',
          'Supplier GSTIN',
          'Bill No',
          'Item',
          'Qty',
          'Rate (INR)',
          'Taxable (INR)',
          'GST (INR)',
          'Total (INR)',
        ],
        rows: data.rows.map((r) => [
          r.purchaseNo,
          new Date(r.purchaseDate).toISOString().slice(0, 10),
          r.supplierName,
          r.supplierGstin ?? '-',
          r.supplierInvoiceNo ?? '-',
          r.itemName,
          r.qtyDisplay,
          `${r.ratePerDisplayDecimal}/${r.displayUnit}`,
          paisaToRupeesString(r.taxablePaisa),
          paisaToRupeesString(r.gstPaisa),
          paisaToRupeesString(r.totalPaisa),
        ]),
      },
    ];

    tallyVouchers = data.rows.map((r) => ({
      voucherType: 'Purchase',
      dateYyyymmdd: new Date(r.purchaseDate).toISOString().slice(0, 10).replace(/-/g, ''),
      voucherNumber: r.purchaseNo,
      partyLedgerName: r.supplierName,
      narration: `Purchase ${r.purchaseNo} - ${r.itemName} (${r.qtyDisplay})`,
      ledgerEntries: [
        {
          ledgerName: 'Raw Material Purchases',
          isDeemedPositive: true,
          amountRupees: paisaToRupeesString(r.taxablePaisa),
        },
        {
          ledgerName: 'Input GST',
          isDeemedPositive: true,
          amountRupees: paisaToRupeesString(r.gstPaisa),
        },
        {
          ledgerName: r.supplierName,
          isDeemedPositive: false,
          amountRupees: paisaToRupeesString(r.totalPaisa),
        },
      ],
    }));
  } else if (reportType === 'stock') {
    const data = await getStockAndLedgerReport(range);
    title = 'Stock Summary & Ledger';
    const allItems = [
      ...data.rawMaterials,
      ...data.packagingMaterials,
      ...data.finishedGoods,
    ];
    sections = [
      {
        sheetName: 'Stock Summary',
        headers: [
          'Category',
          'SKU',
          'Item',
          'Closing Qty',
          'WAC Rate (INR)',
          'Closing Value (INR)',
        ],
        rows: allItems.map((b) => [
          b.category,
          b.skuCode,
          b.name,
          b.closingDisplay,
          `${b.wacRateDecimal}/${b.displayUnit}`,
          paisaToRupeesString(b.closingValuePaisa),
        ]),
      },
      {
        sheetName: 'Stock Ledger',
        headers: ['Timestamp', 'Item', 'Movement', 'Delta', 'Rate', 'Value (INR)', 'Source', 'By'],
        rows: data.ledger.map((l) => [
          new Date(l.createdAt).toISOString(),
          l.itemName,
          l.movementType,
          l.qtyDeltaDisplay,
          `${l.unitCostDecimal}/${l.displayUnit}`,
          paisaToRupeesString(l.totalValuePaisa),
          `${l.sourceType} (${l.sourceId})`,
          l.createdByName,
        ]),
      },
    ];
  } else if (reportType === 'production') {
    const data = await getProductionVarianceReport(range);
    title = 'Production & Variance Report';
    sections = [
      {
        sheetName: 'Production Runs',
        headers: [
          'Run No',
          'Date',
          'SKU',
          'Expected Pkts',
          'Actual Pkts',
          'Scrap Pouches',
          'Yield Var %',
          'Raw+Pkg (INR)',
          'Overheads (INR)',
          'Total Cost (INR)',
          'Cost/Pkt (INR)',
          'Margin %',
        ],
        rows: data.runs.map((r) => [
          r.runNo,
          new Date(r.startedAt).toISOString().slice(0, 10),
          r.productName,
          r.expectedPackets,
          r.actualGoodPackets,
          r.damagedPackets,
          `${r.yieldVariancePct}%`,
          paisaToRupeesString(
            r.costBreakdown.rawMaterialCostPaisa + r.costBreakdown.packagingCostPaisa
          ),
          paisaToRupeesString(
            r.costBreakdown.labourCostPaisa + r.costBreakdown.gasPowerCostPaisa
          ),
          paisaToRupeesString(r.costBreakdown.totalCostPaisa),
          paisaToRupeesString(r.costBreakdown.costPerPacketPaisa),
          `${r.costBreakdown.grossMarginPct}%`,
        ]),
      },
    ];
  } else {
    const data = await getPaymentsAndAgeingReport(range);
    title = 'Payments & Customer Outstanding Ageing';
    sections = [
      {
        sheetName: 'Customer Ageing',
        headers: [
          'Customer',
          'State',
          'Invoiced (INR)',
          'Collected (INR)',
          'Outstanding (INR)',
          '0-30 Days',
          '31-60 Days',
          '61-90 Days',
          '90+ Days',
        ],
        rows: data.customerAgeing.map((c) => [
          c.customerName,
          c.stateName,
          paisaToRupeesString(c.totalInvoicedPaisa),
          paisaToRupeesString(c.totalCollectedPaisa),
          paisaToRupeesString(c.netOutstandingPaisa),
          paisaToRupeesString(c.bucket0to30Paisa),
          paisaToRupeesString(c.bucket31to60Paisa),
          paisaToRupeesString(c.bucket61to90Paisa),
          paisaToRupeesString(c.bucket90PlusPaisa),
        ]),
      },
      {
        sheetName: 'Collections',
        headers: ['Payment No', 'Date', 'Customer', 'Invoice', 'Method', 'Ref', 'Amount (INR)'],
        rows: data.payments.map((p) => [
          p.paymentNo,
          new Date(p.receivedAt).toISOString().slice(0, 10),
          p.customerName,
          p.invoiceNo,
          p.method,
          p.referenceNo ?? '-',
          paisaToRupeesString(p.amountPaisa),
        ]),
      },
    ];

    tallyVouchers = data.payments.map((p) => ({
      voucherType: 'Receipt',
      dateYyyymmdd: new Date(p.receivedAt).toISOString().slice(0, 10).replace(/-/g, ''),
      voucherNumber: p.paymentNo,
      partyLedgerName: p.customerName,
      narration: `Receipt ${p.paymentNo} against ${p.invoiceNo} (${p.method})`,
      ledgerEntries: [
        {
          ledgerName: p.method === 'CASH' ? 'Cash' : 'Bank Account',
          isDeemedPositive: true,
          amountRupees: paisaToRupeesString(p.amountPaisa),
        },
        {
          ledgerName: p.customerName,
          isDeemedPositive: false,
          amountRupees: paisaToRupeesString(p.amountPaisa),
        },
      ],
    }));
  }

  const baseName = `snackflow-${reportType}-${range.fromIso}-to-${range.toIso}`;

  if (format === 'xlsx') {
    return {
      buffer: sectionsToXlsxBuffer(sections),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${baseName}.xlsx`,
    };
  }
  if (format === 'csv') {
    return {
      buffer: sectionsToCsvBuffer(sections),
      contentType: 'text/csv; charset=utf-8',
      filename: `${baseName}.csv`,
    };
  }
  if (format === 'tally') {
    if (tallyVouchers.length === 0) {
      // Provide a valid summary journal voucher if non-voucher report requested
      tallyVouchers = [
        {
          voucherType: 'Journal',
          dateYyyymmdd: range.toIso.replace(/-/g, ''),
          voucherNumber: `AUD-${reportType.toUpperCase()}`,
          partyLedgerName: env.factoryName,
          narration: `${title} (${range.fromIso} to ${range.toIso}) - ${formatINR(0)}`,
          ledgerEntries: [
            { ledgerName: 'Inventory Summary', isDeemedPositive: true, amountRupees: '0.00' },
            { ledgerName: 'Inventory Summary', isDeemedPositive: false, amountRupees: '0.00' },
          ],
        },
      ];
    }
    return {
      buffer: buildTallyXmlEnvelope(tallyVouchers),
      contentType: 'application/xml; charset=utf-8',
      filename: `${baseName}-tally.xml`,
    };
  }

  return {
    buffer: await sectionsToPdfBuffer(title, range, sections),
    contentType: 'application/pdf',
    filename: `${baseName}.pdf`,
  };
}
