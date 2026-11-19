import { put } from '@vercel/blob';

function sanitizeBlobFilename(raw: string | null): string {
  const cleaned = (raw || `upload_${Date.now()}`)
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\.\.+/g, '.');
  return cleaned.slice(0, 200) || `upload_${Date.now()}`;
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
  const filename = sanitizeBlobFilename(searchParams.get('filename'));

  if (!request.body) {
    return Response.json({ error: 'Request body is empty.' }, { status: 400 });
  }

  try {
    const contentType = request.headers.get('content-type') || undefined;
    const blob = await put(filename, request.body, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    return Response.json(blob);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vercel Blob upload failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
