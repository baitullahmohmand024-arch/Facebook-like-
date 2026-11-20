import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_DIR = path.resolve(__dirname, '.uploads');
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MEDIA_MIME_TO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const EXT_TO_MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

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

function resolveMediaUploadType(
  headerValue: string | undefined,
  filename: string
): { contentType: string; ext: string } | null {
  const raw = (headerValue || '').split(';')[0].trim().toLowerCase();
  if (raw && raw !== 'application/octet-stream' && ALLOWED_MEDIA_MIME_TO_EXT[raw]) {
    return { contentType: raw, ext: ALLOWED_MEDIA_MIME_TO_EXT[raw] };
  }
  const ext = path.extname(filename).toLowerCase();
  const mappedMime = EXT_TO_MEDIA_MIME[ext];
  if (mappedMime && ALLOWED_MEDIA_MIME_TO_EXT[mappedMime]) {
    return { contentType: mappedMime, ext: ALLOWED_MEDIA_MIME_TO_EXT[mappedMime] };
  }
  return null;
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

  app.get('/api/media/status', (_req: Request, res: Response) => {
    res.json({
      available: true,
      maxBytes: 60 * 1024 * 1024,
    });
  });

  app.post(
    '/api/media/upload',
    express.raw({ type: '*/*', limit: '60mb' }),
    async (req: Request, res: Response) => {
      const rawHeader =
        typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
      const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : '';
      const resolved = resolveMediaUploadType(rawHeader, rawFilename);
      if (!resolved) {
        res.status(415).json({
          error: 'Unsupported media format. Upload MP4, WebM, MOV, JPG, PNG, WebP, or GIF files.',
        });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Uploaded file is empty.' });
        return;
      }

      try {
        await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
        const storedName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${resolved.ext}`;
        const targetPath = path.join(MEDIA_DIR, storedName);
        await fs.promises.writeFile(targetPath, body);
        res.json({
          url: `/api/media/${storedName}`,
          pathname: storedName,
          contentType: resolved.contentType,
          size: body.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Server media save failed.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.get('/api/media/:fileName', async (req: Request, res: Response) => {
    const rawParam = Array.isArray(req.params.fileName)
      ? req.params.fileName[0]
      : req.params.fileName;
    const safeName = path.basename(rawParam || '');
    if (!safeName || safeName !== rawParam || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid media filename.' });
      return;
    }

    const filePath = path.join(MEDIA_DIR, safeName);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        res.status(404).end();
        return;
      }
      const ext = path.extname(safeName).toLowerCase();
      const contentType = EXT_TO_MEDIA_MIME[ext] || 'application/octet-stream';
      const totalSize = stat.size;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const rangeHeader = req.headers.range;
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const parts = rangeHeader.replace('bytes=', '').split('-');
        const start = Number.parseInt(parts[0], 10);
        const end = parts[1] ? Number.parseInt(parts[1], 10) : totalSize - 1;

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          end >= totalSize ||
          start > end
        ) {
          res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
          return;
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', String(chunkSize));
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.status(200);
      res.setHeader('Content-Length', String(totalSize));
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.status(404).json({ error: 'Media file not found.' });
    }
  });

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
