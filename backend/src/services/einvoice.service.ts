import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { paisaToRupeesString } from '../utils/money.js';

export interface EInvoiceSource {
  id: string;
  invoiceNo: string;
  financialYear: string;
  issuedAt: Date;
  factoryStateCode: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  taxablePaisa: number;
  cgstPaisa: number;
  sgstPaisa: number;
  igstPaisa: number;
  totalPaisa: number;
  customer: {
    name: string;
    gstin: string | null;
    stateCode: string;
    stateName: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
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
    };
  }>;
}

/**
 * Builds an NIC-compliant Indian GST e-Invoice (IRN) & e-Way Bill JSON payload
 * for mock government portal integration / B2B schema validation.
 */
export function buildMockEInvoiceJson(invoice: EInvoiceSource) {
  const irn = crypto
    .createHash('sha256')
    .update(`${env.factoryGstin}|${invoice.financialYear}|${invoice.invoiceNo}`)
    .digest('hex');

  const ackNo = Number(
    BigInt('0x' + irn.slice(0, 12)) % 900000000000000n + 100000000000000n
  );

  const buyerAddr = invoice.customer.address ?? `${invoice.customer.stateName}`;

  return {
    Version: '1.1',
    Irn: irn,
    AckNo: ackNo,
    AckDt: new Date(invoice.issuedAt).toISOString(),
    Status: 'ACT (MOCK NIC SANDBOX)',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: 'INV',
      No: invoice.invoiceNo,
      Dt: new Date(invoice.issuedAt).toLocaleDateString('en-GB'),
    },
    SellerDtls: {
      Gstin: env.factoryGstin,
      LglNm: env.factoryName,
      Addr1: 'SIDCO Food Park',
      Loc: 'Tiruchirappalli',
      Pin: 620015,
      Stcd: invoice.factoryStateCode,
    },
    BuyerDtls: {
      Gstin: invoice.customer.gstin ?? 'URP',
      LglNm: invoice.customer.name,
      Pos: invoice.placeOfSupplyStateCode,
      Addr1: buyerAddr,
      Loc: invoice.customer.stateName,
      Pin: invoice.placeOfSupplyStateCode === '33' ? 620001 : 560022,
      Stcd: invoice.customer.stateCode,
      Ph: invoice.customer.phone ?? undefined,
      Em: invoice.customer.email ?? undefined,
    },
    ItemList: invoice.items.map((item, idx) => ({
      SlNo: String(idx + 1),
      PrdDesc: item.productSku.name,
      IsServc: 'N',
      HsnCd: item.hsnCode,
      Qty: item.qtyPackets,
      Unit: 'PAC',
      UnitPrice: Number(paisaToRupeesString(item.unitPricePaisa)),
      TotAmt: Number(paisaToRupeesString(item.taxablePaisa)),
      AssAmt: Number(paisaToRupeesString(item.taxablePaisa)),
      GstRt: item.gstRateBps / 100,
      CgstAmt: Number(paisaToRupeesString(item.cgstPaisa)),
      SgstAmt: Number(paisaToRupeesString(item.sgstPaisa)),
      IgstAmt: Number(paisaToRupeesString(item.igstPaisa)),
      TotItemVal: Number(paisaToRupeesString(item.totalPaisa)),
    })),
    ValDtls: {
      AssVal: Number(paisaToRupeesString(invoice.taxablePaisa)),
      CgstVal: Number(paisaToRupeesString(invoice.cgstPaisa)),
      SgstVal: Number(paisaToRupeesString(invoice.sgstPaisa)),
      IgstVal: Number(paisaToRupeesString(invoice.igstPaisa)),
      TotInvVal: Number(paisaToRupeesString(invoice.totalPaisa)),
    },
    EwbDtls: {
      EwbNo: Number(BigInt('0x' + irn.slice(12, 22)) % 900000000000n + 100000000000n),
      TransMode: '1',
      TransName: 'Kaveri Factory Logistics',
      Distance: invoice.isInterState ? 340 : 45,
      VehType: 'R',
      Note:
        invoice.totalPaisa < 5000000
          ? 'Below ₹50,000 mandatory e-Way Bill threshold (optional mock preview)'
          : 'e-Way Bill required (> ₹50,000)',
    },
  };
}
