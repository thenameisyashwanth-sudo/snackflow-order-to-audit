import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import mastersRoutes from './routes/masters.routes.js';
import productionRoutes from './routes/production.routes.js';
import purchasesRoutes from './routes/purchases.routes.js';
import { ensureSeededOnBoot } from './seed/benchmark.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'ok',
        service: 'snackflow-backend',
        factory: env.factoryName,
        factoryGstin: env.factoryGstin,
        stateCode: env.factoryStateCode,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        service: 'snackflow-backend',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Database connection error',
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/masters', mastersRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/production-runs', productionRoutes);

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  ensureSeededOnBoot(prisma)
    .catch((err) => {
      console.warn('[SnackFlow] Boot seed check skipped or failed:', err.message);
    })
    .finally(() => {
      app.listen(env.port, () => {
        console.log(`[SnackFlow API] Listening on http://localhost:${env.port}`);
      });
    });
}
