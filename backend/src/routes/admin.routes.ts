import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resetBenchmarkData } from '../seed/benchmark.js';

const router = Router();

router.post(
  '/reset-benchmark',
  authenticate,
  requireRole('ADMIN', 'OWNER'),
  async (req, res) => {
    const summary = await resetBenchmarkData(prisma, req.user!.id);
    res.json({
      message: 'Section 5 benchmark data has been reset to initial opening state.',
      summary,
    });
  }
);

export default router;
