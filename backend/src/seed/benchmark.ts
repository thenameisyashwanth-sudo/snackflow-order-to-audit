import {
  BaseUnit,
  CustomerType,
  ItemCategory,
  LedgerSourceType,
  MovementType,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

export const BENCHMARK_DEFAULT_PASSWORD = 'password123';

export const SEED_USERS: Array<{
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  preferredLang: string;
}> = [
  {
    email: 'salesman_a@factory.in',
    name: 'Salesman A',
    role: 'SALESMAN',
    phone: '+91 98400 10001',
    preferredLang: 'en',
  },
  {
    email: 'salesman_b@factory.in',
    name: 'Salesman B',
    role: 'SALESMAN',
    phone: '+91 98400 10002',
    preferredLang: 'en',
  },
  {
    email: 'admin@factory.in',
    name: 'Factory Admin',
    role: 'ADMIN',
    phone: '+91 98400 10003',
    preferredLang: 'en',
  },
  {
    email: 'production@factory.in',
    name: 'Production Supervisor',
    role: 'PRODUCTION',
    phone: '+91 98400 10004',
    preferredLang: 'en',
  },
  {
    email: 'auditor@factory.in',
    name: 'External Auditor',
    role: 'AUDITOR',
    phone: '+91 98400 10005',
    preferredLang: 'en',
  },
  {
    email: 'owner@factory.in',
    name: 'Factory Owner',
    role: 'OWNER',
    phone: '+91 98400 10006',
    preferredLang: 'en',
  },
];

type DbClient = PrismaClient | Prisma.TransactionClient;

function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

async function ensureOpeningLedgerEntry(
  db: DbClient,
  params: {
    inventoryItemId: string;
    qtyBaseDelta: number;
    unitCostDecimal: string;
    totalValuePaisa: number;
    batchNo: string;
    expiryDate: Date | null;
    sourceId: string;
    notes: string;
    createdById: string;
  }
): Promise<void> {
  const existing = await db.stockLedger.findFirst({
    where: {
      inventoryItemId: params.inventoryItemId,
      sourceType: LedgerSourceType.OPENING,
      sourceId: params.sourceId,
    },
  });

  if (existing) {
    return;
  }

  await db.stockLedger.create({
    data: {
      inventoryItemId: params.inventoryItemId,
      movementType: MovementType.INITIAL_OPENING,
      qtyBaseDelta: params.qtyBaseDelta,
      unitCostDecimal: params.unitCostDecimal,
      totalValuePaisa: params.totalValuePaisa,
      batchNo: params.batchNo,
      expiryDate: params.expiryDate,
      sourceType: LedgerSourceType.OPENING,
      sourceId: params.sourceId,
      notes: params.notes,
      createdById: params.createdById,
    },
  });
}

/**
 * Idempotently seeds the Section 5 Benchmark Master Data, 6 RBAC test users,
 * Two-Layer BOM (Murukku Base Batch + Murukku 200 g SKU), and exact INITIAL_OPENING ledger rows.
 */
export async function seedBenchmarkData(db: DbClient): Promise<{
  usersSeeded: number;
  itemsSeeded: number;
  recipeId: string;
  productSkuId: string;
}> {
  const passwordHash = await bcrypt.hash(BENCHMARK_DEFAULT_PASSWORD, 10);
  const now = new Date();

  // 1. Users
  const userMap = new Map<string, { id: string; email: string; role: UserRole }>();
  for (const u of SEED_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        phone: u.phone,
        isActive: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        phone: u.phone,
        preferredLang: u.preferredLang,
        isActive: true,
      },
    });
    userMap.set(u.email, user);
  }

  const adminUser = userMap.get('admin@factory.in')!;

  // 2. Customers & Supplier (Factory is in Tamil Nadu, State Code 33, GSTIN 33AABCS1429B1Z5)
  await db.customer.upsert({
    where: { code: 'CUST-RETAILER-A' },
    update: {
      name: 'Retailer A',
      type: CustomerType.RETAILER,
      stateCode: '33',
      stateName: 'Tamil Nadu',
      gstin: '33AAACR5055K1Z2',
      isActive: true,
    },
    create: {
      code: 'CUST-RETAILER-A',
      name: 'Retailer A',
      type: CustomerType.RETAILER,
      stateCode: '33',
      stateName: 'Tamil Nadu',
      gstin: '33AAACR5055K1Z2',
      address: '42 Bazaar Street, Tiruchirappalli, Tamil Nadu 620001',
      phone: '+91 98401 11223',
      email: 'retailer.a@trichytrade.in',
      routeName: 'Trichy Central',
      creditLimitPaisa: 5000000, // ₹50,000
    },
  });

  await db.customer.upsert({
    where: { code: 'CUST-DISTRIBUTOR-B' },
    update: {
      name: 'Distributor B',
      type: CustomerType.DISTRIBUTOR,
      stateCode: '29',
      stateName: 'Karnataka',
      gstin: '29AAACD8812M1Z9',
      isActive: true,
    },
    create: {
      code: 'CUST-DISTRIBUTOR-B',
      name: 'Distributor B',
      type: CustomerType.DISTRIBUTOR,
      stateCode: '29',
      stateName: 'Karnataka',
      gstin: '29AAACD8812M1Z9',
      address: '18 APMC Yard, Yeshwanthpur, Bengaluru, Karnataka 560022',
      phone: '+91 98450 44556',
      email: 'orders@distributorb.in',
      routeName: 'Bengaluru Inter-State',
      creditLimitPaisa: 20000000, // ₹2,00,000
    },
  });

  await db.supplier.upsert({
    where: { code: 'SUP-KAVERI-AGRO' },
    update: {
      name: 'Kaveri Agro Mills',
      stateCode: '33',
      stateName: 'Tamil Nadu',
      gstin: '33AAACK9102F1Z8',
      isActive: true,
    },
    create: {
      code: 'SUP-KAVERI-AGRO',
      name: 'Kaveri Agro Mills',
      stateCode: '33',
      stateName: 'Tamil Nadu',
      gstin: '33AAACK9102F1Z8',
      address: 'Plot 14, SIDCO Industrial Estate, Thanjavur, Tamil Nadu 613006',
      phone: '+91 94431 77889',
      email: 'supply@kaveriagromills.in',
    },
  });

  // 3. Raw Materials & Packaging Items + Exact INITIAL_OPENING StockLedger
  const itemSpecs: Array<{
    skuCode: string;
    name: string;
    nameTamil: string;
    category: ItemCategory;
    baseUnit: BaseUnit;
    displayUnit: string;
    displayFactor: number;
    reorderLevelBase: number;
    unitCostDecimal: string;
    hsnCode: string;
    gstRateBps: number;
    openingQtyBase: number;
    openingTotalValuePaisa: number;
    batchNo: string;
    expiryDays: number | null;
  }> = [
    {
      skuCode: 'RM-FLOUR',
      name: 'Flour',
      nameTamil: 'மாவு (அரிசி & உளுந்து)',
      category: ItemCategory.RAW_MATERIAL,
      baseUnit: BaseUnit.GRAM,
      displayUnit: 'kg',
      displayFactor: 1000,
      reorderLevelBase: 50000, // 50 kg
      unitCostDecimal: '42.0000',
      hsnCode: '11029090',
      gstRateBps: 500,
      openingQtyBase: 100000, // 100 kg
      openingTotalValuePaisa: 420000, // ₹4,200.00
      batchNo: 'OPEN-FLOUR-01',
      expiryDays: 180,
    },
    {
      skuCode: 'RM-OIL',
      name: 'Cooking oil',
      nameTamil: 'சமையல் எண்ணெய்',
      category: ItemCategory.RAW_MATERIAL,
      baseUnit: BaseUnit.MILLILITRE,
      displayUnit: 'L',
      displayFactor: 1000,
      reorderLevelBase: 15000, // 15 L
      unitCostDecimal: '140.0000',
      hsnCode: '15121910',
      gstRateBps: 500,
      openingQtyBase: 30000, // 30 L
      openingTotalValuePaisa: 420000, // ₹4,200.00
      batchNo: 'OPEN-OIL-01',
      expiryDays: 180,
    },
    {
      skuCode: 'RM-SPICE',
      name: 'Salt and spice mix',
      nameTamil: 'உப்பு & மசாலா கலவை',
      category: ItemCategory.RAW_MATERIAL,
      baseUnit: BaseUnit.GRAM,
      displayUnit: 'kg',
      displayFactor: 1000,
      reorderLevelBase: 2000, // 2 kg
      unitCostDecimal: '200.0000',
      hsnCode: '09109100',
      gstRateBps: 500,
      openingQtyBase: 5000, // 5 kg
      openingTotalValuePaisa: 100000, // ₹1,000.00
      batchNo: 'OPEN-SPICE-01',
      expiryDays: 240,
    },
    {
      skuCode: 'PKG-POUCH-200G',
      name: '200 g pouch',
      nameTamil: '200 கிராம் பை',
      category: ItemCategory.PACKAGING,
      baseUnit: BaseUnit.PIECE,
      displayUnit: 'pcs',
      displayFactor: 1,
      reorderLevelBase: 200,
      unitCostDecimal: '2.5000',
      hsnCode: '39232990',
      gstRateBps: 1800,
      openingQtyBase: 500,
      openingTotalValuePaisa: 125000, // ₹1,250.00
      batchNo: 'OPEN-POUCH-01',
      expiryDays: null,
    },
    {
      skuCode: 'PKG-CARTON-20',
      name: 'Carton (holds 20 packets)',
      nameTamil: 'அட்டைப்பெட்டி (20 பாக்கெட்)',
      category: ItemCategory.PACKAGING,
      baseUnit: BaseUnit.PIECE,
      displayUnit: 'pcs',
      displayFactor: 1,
      reorderLevelBase: 15,
      unitCostDecimal: '15.0000',
      hsnCode: '48191010',
      gstRateBps: 1800,
      openingQtyBase: 30,
      openingTotalValuePaisa: 45000, // ₹450.00
      batchNo: 'OPEN-CARTON-01',
      expiryDays: null,
    },
  ];

  const itemsBySku = new Map<string, { id: string }>();

  for (const spec of itemSpecs) {
    const item = await db.inventoryItem.upsert({
      where: { skuCode: spec.skuCode },
      update: {
        name: spec.name,
        nameTamil: spec.nameTamil,
        category: spec.category,
        baseUnit: spec.baseUnit,
        displayUnit: spec.displayUnit,
        displayFactor: spec.displayFactor,
        reorderLevelBase: spec.reorderLevelBase,
        currentWeightedRateDecimal: spec.unitCostDecimal,
        hsnCode: spec.hsnCode,
        gstRateBps: spec.gstRateBps,
        isActive: true,
      },
      create: {
        skuCode: spec.skuCode,
        name: spec.name,
        nameTamil: spec.nameTamil,
        category: spec.category,
        baseUnit: spec.baseUnit,
        displayUnit: spec.displayUnit,
        displayFactor: spec.displayFactor,
        reorderLevelBase: spec.reorderLevelBase,
        currentWeightedRateDecimal: spec.unitCostDecimal,
        hsnCode: spec.hsnCode,
        gstRateBps: spec.gstRateBps,
      },
    });
    itemsBySku.set(spec.skuCode, item);

    await ensureOpeningLedgerEntry(db, {
      inventoryItemId: item.id,
      qtyBaseDelta: spec.openingQtyBase,
      unitCostDecimal: spec.unitCostDecimal,
      totalValuePaisa: spec.openingTotalValuePaisa,
      batchNo: spec.batchNo,
      expiryDate: spec.expiryDays !== null ? addDays(now, spec.expiryDays) : null,
      sourceId: `OPENING-${spec.skuCode}`,
      notes: `Section 5 opening stock for ${spec.name}`,
      createdById: adminUser.id,
    });
  }

  // 4. Layer 1 BOM: Bulk Recipe "Murukku Base Batch" (40,000 g dough yield)
  const recipe = await db.recipe.upsert({
    where: { code: 'RCP-MURUKKU' },
    update: {
      name: 'Murukku Base Batch',
      nameTamil: 'முறுக்கு அடிப்படை மாவு',
      batchYieldG: 40000,
      yieldTolerancePct: '3.00',
      consumptionTolerancePct: '3.00',
      overheadRuleNote:
        'Actual labour + gas/power overheads logged directly per production run and divided across actual good packets produced.',
      isActive: true,
    },
    create: {
      code: 'RCP-MURUKKU',
      name: 'Murukku Base Batch',
      nameTamil: 'முறுக்கு அடிப்படை மாவு',
      batchYieldG: 40000,
      yieldTolerancePct: '3.00',
      consumptionTolerancePct: '3.00',
      overheadRuleNote:
        'Actual labour + gas/power overheads logged directly per production run and divided across actual good packets produced.',
    },
  });

  const recipeIngredients: Array<{ skuCode: string; standardQtyBase: number; sequence: number }> = [
    { skuCode: 'RM-FLOUR', standardQtyBase: 40000, sequence: 1 }, // 40 kg
    { skuCode: 'RM-OIL', standardQtyBase: 10000, sequence: 2 }, // 10 L
    { skuCode: 'RM-SPICE', standardQtyBase: 1200, sequence: 3 }, // 1.2 kg
  ];

  for (const ing of recipeIngredients) {
    const item = itemsBySku.get(ing.skuCode)!;
    await db.recipeIngredient.upsert({
      where: {
        recipeId_inventoryItemId: {
          recipeId: recipe.id,
          inventoryItemId: item.id,
        },
      },
      update: {
        standardQtyBase: ing.standardQtyBase,
        sequence: ing.sequence,
      },
      create: {
        recipeId: recipe.id,
        inventoryItemId: item.id,
        standardQtyBase: ing.standardQtyBase,
        sequence: ing.sequence,
      },
    });
  }

  // 5. Layer 2 BOM: Sellable SKU "Murukku 200 g" + Finished Goods Opening Ledger (50 packets @ ₹30.00)
  const fgItem = await db.inventoryItem.upsert({
    where: { skuCode: 'FG-MURUKKU-200G' },
    update: {
      name: 'Murukku 200 g',
      nameTamil: 'முறுக்கு 200 கிராம்',
      category: ItemCategory.FINISHED_GOOD,
      baseUnit: BaseUnit.PIECE,
      displayUnit: 'pkt',
      displayFactor: 1,
      reorderLevelBase: 40,
      currentWeightedRateDecimal: '30.0000',
      hsnCode: '19059090',
      gstRateBps: 500,
      isActive: true,
    },
    create: {
      skuCode: 'FG-MURUKKU-200G',
      name: 'Murukku 200 g',
      nameTamil: 'முறுக்கு 200 கிராம்',
      category: ItemCategory.FINISHED_GOOD,
      baseUnit: BaseUnit.PIECE,
      displayUnit: 'pkt',
      displayFactor: 1,
      reorderLevelBase: 40,
      currentWeightedRateDecimal: '30.0000',
      hsnCode: '19059090',
      gstRateBps: 500,
    },
  });

  const productSku = await db.productSku.upsert({
    where: { skuCode: 'FG-MURUKKU-200G' },
    update: {
      name: 'Murukku 200 g',
      nameTamil: 'முறுக்கு 200 கிராம்',
      recipeId: recipe.id,
      inventoryItemId: fgItem.id,
      netWeightG: 200,
      packetsPerCarton: 20,
      sellingPricePaisa: 5000, // ₹50.00 pre-tax
      gstRateBps: 500, // 5%
      hsnCode: '19059090',
      shelfLifeDays: 90,
      isActive: true,
    },
    create: {
      skuCode: 'FG-MURUKKU-200G',
      name: 'Murukku 200 g',
      nameTamil: 'முறுக்கு 200 கிராம்',
      recipeId: recipe.id,
      inventoryItemId: fgItem.id,
      netWeightG: 200,
      packetsPerCarton: 20,
      sellingPricePaisa: 5000,
      gstRateBps: 500,
      hsnCode: '19059090',
      shelfLifeDays: 90,
    },
  });

  const pouchItem = itemsBySku.get('PKG-POUCH-200G')!;
  const cartonItem = itemsBySku.get('PKG-CARTON-20')!;

  await db.skuPackagingBom.upsert({
    where: {
      productSkuId_packagingItemId: {
        productSkuId: productSku.id,
        packagingItemId: pouchItem.id,
      },
    },
    update: {
      packagingRole: 'PRIMARY_POUCH',
      qtyBase: 1,
      perPackets: 1,
    },
    create: {
      productSkuId: productSku.id,
      packagingItemId: pouchItem.id,
      packagingRole: 'PRIMARY_POUCH',
      qtyBase: 1,
      perPackets: 1,
    },
  });

  await db.skuPackagingBom.upsert({
    where: {
      productSkuId_packagingItemId: {
        productSkuId: productSku.id,
        packagingItemId: cartonItem.id,
      },
    },
    update: {
      packagingRole: 'CARTON',
      qtyBase: 1,
      perPackets: 20,
    },
    create: {
      productSkuId: productSku.id,
      packagingItemId: cartonItem.id,
      packagingRole: 'CARTON',
      qtyBase: 1,
      perPackets: 20,
    },
  });

  await ensureOpeningLedgerEntry(db, {
    inventoryItemId: fgItem.id,
    qtyBaseDelta: 50,
    unitCostDecimal: '30.0000',
    totalValuePaisa: 150000, // 50 * ₹30.00 = ₹1,500.00
    batchNo: 'OPEN-MRK200-01',
    expiryDate: addDays(now, 60),
    sourceId: 'OPENING-FG-MURUKKU-200G',
    notes: 'Section 5 opening finished stock: 50 packets Murukku 200 g',
    createdById: adminUser.id,
  });

  return {
    usersSeeded: SEED_USERS.length,
    itemsSeeded: itemSpecs.length + 1,
    recipeId: recipe.id,
    productSkuId: productSku.id,
  };
}

/**
 * Atomically clears all transactional & master tables (preserving/upserting users)
 * and re-seeds the clean Section 5 Benchmark starting state.
 */
export async function resetBenchmarkData(prisma: PrismaClient, actorUserId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({});
    await tx.salesmanVisit.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.creditNoteItem.deleteMany({});
    await tx.creditNote.deleteMany({});
    await tx.invoiceItem.deleteMany({});
    await tx.invoice.deleteMany({});
    await tx.salesOrderItem.deleteMany({});
    await tx.salesOrder.deleteMany({});
    await tx.productionConsumption.deleteMany({});
    await tx.productionRun.deleteMany({});
    await tx.purchaseItem.deleteMany({});
    await tx.purchase.deleteMany({});
    await tx.stockLedger.deleteMany({});
    await tx.customerPrice.deleteMany({});
    await tx.skuPackagingBom.deleteMany({});
    await tx.productSku.deleteMany({});
    await tx.recipeIngredient.deleteMany({});
    await tx.recipe.deleteMany({});
    await tx.inventoryItem.deleteMany({});
    await tx.customer.deleteMany({});
    await tx.supplier.deleteMany({});

    const summary = await seedBenchmarkData(tx);

    if (actorUserId) {
      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'RESET_BENCHMARK',
          entityType: 'System',
          entityId: 'BENCHMARK_SEED',
          afterJson: summary,
        },
      });
    }

    return summary;
  });
}

/**
 * Automatically seeds benchmark data on server startup if the User table is empty.
 */
export async function ensureSeededOnBoot(prisma: PrismaClient): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('[SnackFlow] Empty database detected — seeding Section 5 benchmark data...');
    const summary = await prisma.$transaction((tx) => seedBenchmarkData(tx));
    console.log(
      `[SnackFlow] Seeded ${summary.usersSeeded} users and ${summary.itemsSeeded} inventory items.`
    );
  }
}
