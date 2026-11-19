import { put } from '@vercel/blob';

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sanitizeAvatarFilename(raw: string | null): string {
  const cleaned = (raw || `avatar_${Date.now()}.webp`)
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\.\.+/g, '.');
  const trimmed = cleaned.slice(0, 200) || `avatar_${Date.now()}.webp`;
  return trimmed.startsWith('avatars/') ? trimmed : `avatars/${trimmed}`;
}

function resolveAvatarContentType(headerValue: string | null, filename: string): string {
  const raw = (headerValue || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_AVATAR_TYPES.has(raw)) return raw;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function GET(): Promise<Response> {
  return Response.json({
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      {
        error: 'Vercel Blob storage token (BLOB_READ_WRITE_TOKEN) is not configured.',
        code: 'BLOB_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const filename = sanitizeAvatarFilename(searchParams.get('filename'));
  const rawContentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

  if (rawContentType && rawContentType !== 'application/octet-stream' && !ALLOWED_AVATAR_TYPES.has(rawContentType)) {
    return Response.json(
      { error: 'Unsupported avatar format. Allowed types: JPEG, PNG, WebP.' },
      { status: 415 }
    );
  }

  if (!request.body) {
    return Response.json({ error: 'Request body is empty.' }, { status: 400 });
  }

  try {
    const contentType = resolveAvatarContentType(rawContentType, filename);
    const blob = await put(filename, request.body, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    return Response.json(blob);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Avatar upload failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
