import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sanitizeBlobFilename(raw: unknown, prefix = ''): string {
  const str = typeof raw === 'string' ? raw : '';
  const cleaned = (str || `upload_${Date.now()}`)
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\.\.+/g, '.')
    .slice(0, 200);
  const base = cleaned || `upload_${Date.now()}`;
  if (prefix && !base.startsWith(prefix)) {
    return `${prefix}${base}`;
  }
  return base;
}

function resolveAvatarContentType(headerValue: string | undefined, filename: string): string {
  const raw = (headerValue || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_AVATAR_TYPES.has(raw)) return raw;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  const handleStatus = (_req: Request, res: Response) => {
    res.json({
      configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    });
  };

  app.get('/api/upload', handleStatus);
  app.get('/api/avatar/upload', handleStatus);

  app.post(
    '/api/avatar/upload',
    express.raw({ type: '*/*', limit: '5mb' }),
    async (req: Request, res: Response) => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({
          error: 'Vercel Blob storage token (BLOB_READ_WRITE_TOKEN) is not configured.',
          code: 'BLOB_NOT_CONFIGURED',
        });
        return;
      }

      const rawHeader = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
      const rawType = rawHeader.split(';')[0].trim().toLowerCase();
      if (rawType && rawType !== 'application/octet-stream' && !ALLOWED_AVATAR_TYPES.has(rawType)) {
        res.status(415).json({
          error: 'Unsupported avatar format. Allowed types: JPEG, PNG, WebP.',
        });
        return;
      }

      const filename = sanitizeBlobFilename(req.query.filename, 'avatars/');
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Request body is empty.' });
        return;
      }

      try {
        const contentType = resolveAvatarContentType(rawHeader, filename);
        const blob = await put(filename, body, {
          access: 'public',
          addRandomSuffix: true,
          contentType,
        });
        res.json(blob);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Avatar upload failed.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    '/api/upload',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req: Request, res: Response) => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(503).json({
          error: 'Vercel Blob storage token (BLOB_READ_WRITE_TOKEN) is not configured.',
          code: 'BLOB_NOT_CONFIGURED',
        });
        return;
      }

      const filename = sanitizeBlobFilename(req.query.filename);
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Request body is empty.' });
        return;
      }

      try {
        const contentType = req.headers['content-type'] || undefined;
        const blob = await put(filename, body, {
          access: 'public',
          addRandomSuffix: true,
          contentType,
        });
        res.json(blob);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Vercel Blob upload failed.';
        res.status(500).json({ error: message });
      }
    }
  );

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          }
        },
      })
    );
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Hostel Friend server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
