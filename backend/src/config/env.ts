import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://snackflow:snackflow_dev_pwd@localhost:5432/snackflow?schema=public',
  jwtSecret: process.env.JWT_SECRET ?? 'snackflow-dev-secret-change-me',
  factoryStateCode: process.env.FACTORY_STATE_CODE ?? '33',
  factoryName: process.env.FACTORY_NAME ?? 'Kaveri Traditional Snacks Pvt Ltd',
  factoryGstin: process.env.FACTORY_GSTIN ?? '33AABCK1234F1Z5',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};
