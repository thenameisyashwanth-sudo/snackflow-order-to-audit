import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';
import { formatINR } from '../utils/money.js';

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function integerToIndianWords(num: number): string {
  if (num === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;

  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(' ').trim();
}

export function amountInWordsINR(paisa: number): string {
  const abs = Math.abs(Math.trunc(paisa));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const rupeeWords = `Rupees ${integerToIndianWords(rupees)}`;
  return paise > 0
    ? `${rupeeWords} and ${twoDigitsToWords(paise)} Paise Only`
    : `${rupeeWords} Only`;
}

export interface InvoicePdfInput {
  invoiceNo: string;
  financialYear: string;
  status: string;
  issuedAt: Date;
  dispatchedAt: Date | null;
  factoryStateCode: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  taxablePaisa: number;
  cgstPaisa: number;
  sgstPaisa: number;
  igstPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  customer: {
    name: string;
    type: string;
    gstin: string | null;
    stateCode: string;
    stateName: string;
    address: string | null;
    phone: string | null;
  };
  salesOrder?: { orderNo: string } | null;
  items: Array<{
    hsnCode: string;
    qtyPackets: number;
    unitPricePaisa: number;
    gstRateBps: number;
    taxablePaisa: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalPaisa: number;
    productSku: {
      name: string;
      skuCode: string;
      packetsPerCarton: number;
    };
  }>;
}

/**
 * Generates an audit-ready GST Tax Invoice PDF buffer using PDFKit.
 */
export function generateGstInvoicePdfBuffer(invoice: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header Banner
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(env.factoryName, 40, 40)
      .fontSize(9)
      .font('Helvetica')
      .text(`GSTIN: ${env.factoryGstin}  |  State Code: ${invoice.factoryStateCode} (Tamil Nadu)`, 40, 62)
      .text('SIDCO Food Park, Tiruchirappalli, Tamil Nadu 620015', 40, 74);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TAX INVOICE', 400, 40, { align: 'right', width: 155 })
      .fontSize(9)
      .font('Helvetica')
      .text(`Invoice No: ${invoice.invoiceNo}`, 400, 60, { align: 'right', width: 155 })
      .text(`FY: ${invoice.financialYear}`, 400, 72, { align: 'right', width: 155 })
      .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}`, 400, 84, {
        align: 'right',
        width: 155,
      });

    if (invoice.status === 'CANCELLED') {
      doc
        .fontSize(11)
        .fillColor('#b91c1c')
        .font('Helvetica-Bold')
        .text('STATUS: CANCELLED (CREDIT NOTE ISSUED)', 400, 98, { align: 'right', width: 155 })
        .fillColor('#000000');
    }

    doc.moveTo(40, 112).lineTo(555, 112).stroke('#d6d3d1');

    // Bill To & Supply Metadata
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('BILL TO / CONSIGNEE:', 40, 124)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`${invoice.customer.name} (${invoice.customer.type})`, 40, 138)
      .font('Helvetica')
      .fontSize(9)
      .text(invoice.customer.address ?? `${invoice.customer.stateName}`, 40, 152, { width: 260 })
      .text(`GSTIN: ${invoice.customer.gstin ?? 'Unregistered'}`, 40, 178)
      .text(
        `Place of Supply: ${invoice.placeOfSupplyStateCode} - ${invoice.customer.stateName}`,
        40,
        190
      );

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('SUPPLY & DISPATCH DETAILS:', 330, 124)
      .font('Helvetica')
      .text(`Order Ref: ${invoice.salesOrder?.orderNo ?? 'Direct'}`, 330, 138)
      .text(
        `Tax Regime: ${invoice.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}`,
        330,
        152
      )
      .text(
        `Dispatch Status: ${
          invoice.dispatchedAt
            ? `Dispatched (${new Date(invoice.dispatchedAt).toLocaleDateString('en-IN')})`
            : 'Pending Dispatch'
        }`,
        330,
        166
      )
      .text(`Paid: ${formatINR(invoice.paidPaisa)}`, 330, 180)
      .text(
        `Outstanding: ${
          invoice.status === 'CANCELLED'
            ? formatINR(0)
            : formatINR(Math.max(0, invoice.totalPaisa - invoice.paidPaisa))
        }`,
        330,
        194
      );

    // Line Items Table Header
    let y = 224;
    doc.rect(40, y, 515, 22).fill('#f5f5f4');
    doc.fillColor('#1c1917').font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', 46, y + 7);
    doc.text('Item & HSN', 66, y + 7);
    doc.text('Qty (Pkts)', 210, y + 7, { width: 55, align: 'right' });
    doc.text('Rate', 270, y + 7, { width: 50, align: 'right' });
    doc.text('Taxable', 325, y + 7, { width: 60, align: 'right' });
    doc.text('Tax Split', 392, y + 7, { width: 92, align: 'right' });
    doc.text('Total', 490, y + 7, { width: 60, align: 'right' });

    y += 26;
    doc.font('Helvetica').fontSize(8.5);

    invoice.items.forEach((item, idx) => {
      const cartons = Math.floor(item.qtyPackets / item.productSku.packetsPerCarton);
      const loose = item.qtyPackets % item.productSku.packetsPerCarton;
      const taxLabel = invoice.isInterState
        ? `IGST ${item.gstRateBps / 100}%: ${formatINR(item.igstPaisa)}`
        : `CGST+SGST: ${formatINR(item.cgstPaisa)} + ${formatINR(item.sgstPaisa)}`;

      doc.text(String(idx + 1), 46, y);
      doc.text(`${item.productSku.name}\nHSN: ${item.hsnCode}`, 66, y, { width: 140 });
      doc.text(`${item.qtyPackets} pkts\n(${cartons} ctn + ${loose})`, 210, y, {
        width: 55,
        align: 'right',
      });
      doc.text(formatINR(item.unitPricePaisa), 270, y, { width: 50, align: 'right' });
      doc.text(formatINR(item.taxablePaisa), 325, y, { width: 60, align: 'right' });
      doc.text(taxLabel, 392, y, { width: 92, align: 'right' });
      doc.text(formatINR(item.totalPaisa), 490, y, { width: 60, align: 'right' });

      y += 30;
      doc.moveTo(40, y - 4).lineTo(555, y - 4).stroke('#e7e5e4');
    });

    // Summary Totals Box
    y += 12;
    doc.font('Helvetica').fontSize(9.5);
    doc.text('Taxable Value:', 350, y, { width: 110, align: 'right' });
    doc.text(formatINR(invoice.taxablePaisa), 465, y, { width: 85, align: 'right' });
    y += 16;

    if (invoice.isInterState) {
      doc.text('IGST:', 350, y, { width: 110, align: 'right' });
      doc.text(formatINR(invoice.igstPaisa), 465, y, { width: 85, align: 'right' });
      y += 16;
    } else {
      doc.text('CGST:', 350, y, { width: 110, align: 'right' });
      doc.text(formatINR(invoice.cgstPaisa), 465, y, { width: 85, align: 'right' });
      y += 16;
      doc.text('SGST:', 350, y, { width: 110, align: 'right' });
      doc.text(formatINR(invoice.sgstPaisa), 465, y, { width: 85, align: 'right' });
      y += 16;
    }

    doc.moveTo(350, y).lineTo(555, y).stroke('#a8a29e');
    y += 8;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Grand Total:', 350, y, { width: 110, align: 'right' });
    doc.text(formatINR(invoice.totalPaisa), 465, y, { width: 85, align: 'right' });

    y += 28;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Amount in Words:', 40, y)
      .font('Helvetica')
      .text(amountInWordsINR(invoice.totalPaisa), 130, y);

    y += 45;
    doc
      .fontSize(8.5)
      .fillColor('#57534e')
      .text(
        'Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
        40,
        y,
        { width: 320 }
      )
      .fillColor('#1c1917')
      .font('Helvetica-Bold')
      .text(`For ${env.factoryName}`, 390, y, { align: 'right', width: 165 })
      .font('Helvetica')
      .text('Authorised Signatory', 390, y + 28, { align: 'right', width: 165 });

    doc.end();
  });
}
