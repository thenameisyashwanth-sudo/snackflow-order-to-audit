# SnackFlow — Order-to-Audit ERP for Food Manufacturing

End-to-end Order-to-Audit ERP designed for regional Indian packaged snack manufacturers. SnackFlow unifies mobile field sales, recipe-based batch production, double-entry ledger inventory, weighted-average costing, GST billing, and month-end statutory audit reporting into a single transactional system.

---

## 1. Quick Start

### Option A: Single-Command Docker Compose (Recommended)

```bash
docker compose up --build
```

- **Frontend PWA:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000/api/health`
- **PostgreSQL:** `localhost:5432` (`snackflow` / `snackflow_dev_pwd`)
- On first startup, the backend automatically runs `prisma migrate deploy` and seeds initial factory master data, opening `StockLedger` balances, and 6 role accounts.

### Option B: Local Development (Node.js 22 + PostgreSQL 16+)

```bash
cp .env.example .env
cp backend/.env.example backend/.env
npm install
npm run prisma:generate
npm run db:migrate
npm run seed
npm run dev
```

To run the full test suite and type/build checks:

```bash
npm run typecheck
npm run build
npm test
```

---

## 2. Demo Credentials & One-Click Data Reset

The login screen provides **1-click Quick Demo Login** buttons for all 6 seeded roles (default password for all accounts: `password123`):

| Role | Email | Password | Device / Scope |
| --- | --- | --- | --- |
| Field Salesman A | `salesman_a@factory.in` | `password123` | Mobile PWA · Orders, offline sync, own customer sales |
| Field Salesman B | `salesman_b@factory.in` | `password123` | Mobile PWA · Orders, Distributor B (Karnataka), route log |
| Factory Admin | `admin@factory.in` | `password123` | Desktop · Order verification, GST PDF invoices, dispatch, credit notes, payments |
| Production Supervisor | `production@factory.in` | `password123` | Floor Tablet / Desktop · Purchases, BOM production runs, variances |
| External Auditor | `auditor@factory.in` | `password123` | Desktop (Read-Only) · All 6 monthly reports + Excel/CSV/PDF/Tally exports |
| Factory Owner | `owner@factory.in` | `password123` | Any Device · Executive KPIs, variance alerts, packet cost, receivables |

**Reset Demo Data:** Logged-in `ADMIN` or `OWNER` users have a **"Reset Benchmark Data"** button in the top bar (`POST /api/admin/reset-benchmark`) that atomically clears transactional tables and restores the clean factory opening state in one click.

---

## 3. Tech Stack & Justification

We chose **Node.js + Express + TypeScript + Prisma ORM + PostgreSQL** paired with a **React + Vite + Tailwind CSS Progressive Web App (PWA)**. PostgreSQL + Prisma `$transaction` guarantees ACID consistency across double-entry `StockLedger` rows, financial-year invoice sequences, and immutable audit logs using integer-paisa and `Decimal(14,4)` arithmetic instead of floating-point numbers. A responsive Vite PWA delivers a single installable codebase that works offline on salesmen's mobile phones while serving full desktop tables, PDFs, and exports to admin, production, and audit teams.

---

## 4. Implemented Capabilities

### Core Operations
- [x] Role-based authentication (`SALESMAN`, `ADMIN`, `PRODUCTION`, `AUDITOR`, `OWNER`) with strict API & UI guards
- [x] Product, Customer, Supplier, Raw/Packaging Item, and Two-Layer BOM masters
- [x] Mobile-friendly field order entry (`+10/+25/+50/+100` taps) & Admin inline verification/approval
- [x] GST Tax Invoice PDF (`pdfkit`) with HSN, Place of Supply (`CGST+SGST` vs `IGST`), FY numbering, and WhatsApp/Email sharing
- [x] Production runs that automatically deduct raw/packaging stock and credit finished goods via `StockLedger`
- [x] Planned vs. actual BOM consumption and yield comparison with `>3%` variance alerts
- [x] Reconciled Stock Summary (`Opening + Receipts - Issues/Scrap - Sales + Returns ± Adjustments = Closing`) and itemized Stock Ledger
- [x] Sales Register & Stock Reports exportable to Excel (`.xlsx`), CSV (`.csv`), and PDF (`.pdf`)

### Financial Controls & Executive Visibility
- [x] Supplier purchases (`PURCHASE_RECEIPT`) updating Weighted Average Cost (WAC)
- [x] Customer payments, live invoice-wise outstanding, and `0–30 / 31–60 / 61–90 / 90+` day ageing report
- [x] Cost per packet with post-run editable overheads (`labour` + `gas/power`), margin %, and FIFO comparison
- [x] GST Outward Supplies report mapped to **GSTR-1** (B2B) and **GSTR-3B** (Table 3.1)
- [x] Owner Executive Dashboard (`OwnerDashboardPage`) with interactive **Live Two-Loop Factory Flow Visualizer** (`TwoLoopFactoryFlow`) showing Production & Sales loops converging at Finished Goods Stock
- [x] **Self-Service Products & BOM Pack-Size Builder** (`MastersBomPage` + `POST /api/masters/skus`) allowing Admins/Owners to launch new pack sizes (e.g., `Murukku 500 g` yielding `80 packets/batch`) sharing a bulk recipe with zero code or schema edits

### Field Resilience, Compliance & Floor Ergonomics
- [x] **Offline Order Capture & Auto-Sync:** `localStorage` queue with UUID `clientOrderId` idempotency, `"Simulate Offline"` demo toggle, and automatic flush upon reconnect
- [x] **Batch & Expiry Tracking (FEFO):** Batch numbers, expiry dates, and `"Earliest Expiry — Dispatch First"` priority indicators
- [x] **Reorder Levels & Low-Stock Alerts:** Reorder thresholds on raw, packaging, and finished items with warning badges
- [x] **1-Click Production Shortage Planner:** Insufficient-stock order banner links directly to `/production/runs?skuId=...&batches=1`
- [x] **Salesman Route Visit Log with GPS Check-In:** Coordinates + visit outcome logging
- [x] **Tally-Compatible XML Export:** Standard `<ENVELOPE>` Tally Prime voucher import XML across reports
- [x] **Mock NIC e-Invoice (IRN) & e-Way Bill JSON:** Deterministic SHA-256 IRN + `EwbDtls` JSON preview modal
- [x] **Tamil (`தமிழ்`) Floor & Salesman UI Toggle:** Bilingual `"English / தமிழ்"` header switch

---

## 5. Project Structure & Automated Verification

```text
snackflow-order-to-audit/
├── docker-compose.yml                  # Single-command Postgres + Backend + Frontend PWA
├── backend/
│   ├── prisma/                         # Schema, PostgreSQL migrations & factory reference seed
│   └── src/
│       ├── routes/                     # auth, admin, masters (+ POST /skus), inventory, purchases, production, orders, invoices, payments, reports
│       ├── services/                   # ledger/WAC/FIFO, BOM production, GST invoicing & PDF, e-Invoice JSON, reports & xlsx/csv/pdf/tally exports
│       ├── utils/                      # integer-paisa BigInt math, base-unit conversion, Indian GST & FY utilities
│       └── __tests__/                  # 8 Vitest suites (22 tests) covering math, RBAC, BOM extensibility, exports & full 9-step E2E factory flow
└── frontend/
    └── src/
        ├── components/                 # AppShell (RBAC nav + Tamil toggle + Reset), TwoLoopFactoryFlow
        ├── context/                    # AuthContext, LanguageContext (EN / தமிழ்)
        └── pages/                      # SalesmanOrderPage, ProductionRunsPage, PurchasesPage, InventoryStockPage, AdminOrders/Invoices/Payments, OwnerDashboardPage, MastersBomPage, AuditorReportsPage
```

- **Automated Test Suite (`npm test`):** **24 tests passing** — `22` backend tests across `8` files (including `bom-extensibility.test.ts` and `e2e-section5-benchmark.test.ts`) + `2` frontend tests across `2` files.

---

## 6. Design Decisions & Scope Boundaries

### Accounting & Operational Rules
1. **Inventory Valuation Method:** Bulk ingredients and finished goods use **Weighted Average Cost (WAC)** stored in `Decimal(14,4)` (`₹/displayUnit`) so `100 kg @ ₹42 + 60 kg @ ₹45 = 160 kg @ ₹43.1250/kg`. A FIFO comparison figure (`₹30.90/packet`) is also computed alongside WAC (`₹31.14/packet`).
2. **Normal Scrap Absorption:** Damaged pouches during packing (`6 pcs`) are deducted via `PROD_SCRAP` in `StockLedger` and absorbed into the cost of good packets produced (`188 pcs`), matching standard process costing.
3. **Partial Cartons:** When a batch yields packets that are not a full multiple of 20 (e.g., `188` packets = `9` full cartons + `8` loose packets), loose packets are held in reusable factory crates without consuming a 10th carton.
4. **Financial Year & Tolerance:** Invoice (`FY26-27/001`) and Credit Note (`CN/FY26-27/001`) sequences reset on April 1. Default variance tolerance is `±3.0%`.

### Current Scope Boundaries
- **e-Invoice / e-Way Bill:** Uses a deterministic mock NIC v1.1 schema generator rather than live GSTN sandbox credentials.
- **Single-Factory Scope:** Models one manufacturing plant in Tamil Nadu (`State Code 33`); inter-branch warehouse transfers are outside current scope.
- **Partial Dispatch:** Schema fields (`dispatchedQtyPackets`, `PARTIALLY_DISPATCHED`) are modeled, while the Admin UI currently triggers full-invoice dispatch in one click.

---

## 7. End-to-End Factory Walkthrough & Reference Scenario

Verified end-to-end by automated suite [`e2e-section5-benchmark.test.ts`](backend/src/__tests__/e2e-section5-benchmark.test.ts):

| Walkthrough Check | Reference Calculation | System Output | Status |
| --- | --- | --- | --- |
| Flour closing balance | `120 kg` (`100 + 60 − 40`) | `120 kg` (`120,000 g` @ `₹43.1250/kg` WAC) | Match |
| Cooking oil closing balance | `19.5 L` | `19.5 L` (`19,500 ml`) | Match |
| Pouches closing balance | `306` (`188 used + 6 damaged`) | `306 pcs` (`-188 PROD_ISSUE`, `-6 PROD_SCRAP`) | Match |
| Finished goods after run | `238 packets` (`50 + 188`) | `238 packets` | Match |
| Finished goods after Retailer A dispatch | `88 packets` | `88 packets` (`-150 SALES_DISPATCH`) | Match |
| Yield variance | `188 vs 200`, `-6%`, flagged | `-6.0%`, `isYieldVarianceFlagged = true` | Match |
| Oil consumption variance | `+5%`, flagged | `+5.0%`, `isVarianceFlagged = true` | Match |
| Retailer A invoice (TN `33` → TN `33`) | `₹7,500 + ₹187.50 CGST + ₹187.50 SGST = ₹7,875` | `₹7,500.00 + ₹187.50 + ₹187.50 = ₹7,875.00` (`FY26-27/001`) | Match |
| Retailer A outstanding (after `₹4,000` paid) | `₹3,875` | `₹3,875.00` (`387500` paisa) | Match |
| Distributor B order (`120` pkts, KA `29`) | Shortage `32 pkts` flagged; IGST applies | `shortagePackets = 32` flagged; `5% IGST = ₹300.00` preview | Match |
| Cost per packet | Stated valuation & overhead rule | **`₹31.14/packet`** (`3114` paisa WAC, `37.71%` margin; FIFO ref `₹30.90/packet`) | Match |
