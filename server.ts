import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { pool, initDatabase } from './server/db';
import { collectionRouter } from './server/routes/collection';
import { challengesRouter } from './server/routes/challenges';
import { aiAndProxyRouter } from './server/routes/aiAndProxy';
import { importsAndExportsRouter } from './server/routes/importsAndExports';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'capacitor://localhost',
    'http://localhost',
    'null',
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

  if (pool) {
    try {
      await initDatabase(pool);
      console.log('Database initialized with creators & character appearance tables.');
    } catch (err) {
      console.warn('Database initialization warning:', err);
    }
  }

  // Mount modular API routers
  app.use(collectionRouter);
  app.use(challengesRouter);
  app.use(aiAndProxyRouter);
  app.use(importsAndExportsRouter);

  // --- VITE MIDDLEWARE / PRODUCTION STATIC SETUP ---
  if (process.env.NODE_ENV?.trim() !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
