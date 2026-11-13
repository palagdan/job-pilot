import { describe, expect, it } from 'vitest';
import { contentDisposition } from './file-storage.ts';
import { storageKeys } from './keys.ts';
import { createMemoryFileStorage } from './memory-file-storage.ts';
import { createS3FileStorage } from './s3-file-storage.ts';

describe('contentDisposition', () => {
  it('adds an ASCII fallback and a UTF-8 filename', () => {
    expect(contentDisposition('CV - Škoda Auto - Head of Growth.pdf')).toBe(
      `attachment; filename="CV - Skoda Auto - Head of Growth.pdf"; filename*=UTF-8''CV%20-%20%C5%A0koda%20Auto%20-%20Head%20of%20Growth.pdf`,
    );
    expect(contentDisposition('a"b.pdf', 'inline')).toMatch(/^inline; filename="a_b.pdf"/);
  });
});

describe('memory storage', () => {
  it('round-trips files', async () => {
    const storage = createMemoryFileStorage();
    await storage.put({
      key: 'k',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    });
    expect((await storage.get('k'))?.sizeBytes).toBe(3);
    await storage.delete('k');
    expect(await storage.exists('k')).toBe(false);
  });
});

/** Runs against the docker RustFS when TEST_S3_ENDPOINT is set (credentials from docker-compose). */
const endpoint = process.env.TEST_S3_ENDPOINT;

describe.skipIf(!endpoint)('S3 storage (integration)', () => {
  const storage = createS3FileStorage({
    endpoint,
    bucket: process.env.S3_BUCKET ?? 'jobpilot',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'jobpilot',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'jobpilot-secret',
    forcePathStyle: true,
  });
  const key = storageKeys.upload('test-user', `it-${Date.now()}`, 'pdf');
  const body = new TextEncoder().encode('%PDF-1.7 fake cv');

  it('put → exists → get → signed URL → delete', async () => {
    expect(await storage.exists(key)).toBe(false);
    expect(await storage.get(key)).toBeNull();

    await storage.put({ key, body, contentType: 'application/pdf' });
    expect(await storage.exists(key)).toBe(true);
    const stored = await storage.get(key);
    expect(stored?.contentType).toBe('application/pdf');
    expect(new TextDecoder().decode(stored?.body)).toBe('%PDF-1.7 fake cv');

    const url = await storage.signedDownloadUrl(key, {
      filename: 'CV - Škoda - CMO.pdf',
      expiresInSeconds: 60,
    });
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('%PDF-1.7 fake cv');
    expect(res.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''CV%20-%20%C5%A0koda%20-%20CMO.pdf`,
    );

    await storage.delete(key);
    await storage.delete(key); // idempotent
    expect(await storage.exists(key)).toBe(false);
  });

  it('rejects a tampered signed URL', async () => {
    await storage.put({ key, body, contentType: 'application/pdf' });
    const url = new URL(await storage.signedDownloadUrl(key, { filename: 'x.pdf' }));
    url.searchParams.set('X-Amz-Expires', '30'); // valid value, but not what was signed
    expect((await fetch(url)).status).toBe(403);
    await storage.delete(key);
  });
});
