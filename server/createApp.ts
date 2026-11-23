import express from 'express';
import cors from 'cors';
import { collectionRouter } from './routes/collection';
import { challengesRouter } from './routes/challenges';
import { masterCatalogRouter } from './routes/masterCatalog';
import { storageUploadRouter } from './routes/storageUpload';
import { aiAndProxyRouter } from './routes/aiAndProxy';
import { importsAndExportsRouter } from './routes/importsAndExports';
import { valuationRouter } from './routes/valuation';
import { proposalsRouter } from './routes/proposals';
import { FIREBASE_PROJECT_ID } from './firebaseAdmin';

/**
 * Creates the shared Express application mounting all API routers, CORS, and health check.
 * Used by both the local Node server (`server.ts`) and Firebase Cloud Functions v2 (`functions/index.ts`).
 */
export function createApp(): express.Express {
  const app = express();

  const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'null',
    `https://${FIREBASE_PROJECT_ID}.web.app`,
    `https://${FIREBASE_PROJECT_ID}.firebaseapp.com`,
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) || []),
  ]);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.has(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Mount modular API routers
  app.use(collectionRouter);
  app.use(challengesRouter);
  app.use(masterCatalogRouter);
  app.use(storageUploadRouter);
  app.use(aiAndProxyRouter);
  app.use(importsAndExportsRouter);
  app.use(valuationRouter);
  app.use(proposalsRouter);

  return app;
}
