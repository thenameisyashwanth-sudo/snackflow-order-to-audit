import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { seedBenchmarkData } from '../src/seed/benchmark.js';

async function main() {
  console.log('[Seed] Running idempotent Section 5 benchmark seed...');
  const summary = await prisma.$transaction((tx) => seedBenchmarkData(tx));
  console.log('[Seed] Complete:', summary);
}

main()
  .catch((error) => {
    console.error('[Seed] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
