import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { pool, initDatabase } from './server/db';
import { createApp } from './server/createApp';
import { valuationBatchManager } from './server/services/valuationEngine';

async function startServer() {
  const app = createApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (pool) {
    try {
      await initDatabase(pool);
      valuationBatchManager.initScheduler(pool);
      console.log('Database initialized with creators & character appearance tables.');
    } catch (err) {
      console.warn('Database initialization warning:', err);
    }
  }

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
