import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createPreviewSender, createResendSender } from './sender.ts';

const mail = {
  to: 'a@example.com',
  subject: 'Hello there',
  html: '<p>hi</p>',
  text: 'hi',
  headers: { 'List-Unsubscribe': '<https://x.test/u>' },
};

describe('resend sender', () => {
  it('posts the expected request', async () => {
    const fetchFake = vi.fn(
      async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }),
    );
    const sender = createResendSender('re_key', 'JobPilot <hello@x.test>', fetchFake);
    expect(await sender.send(mail)).toEqual({ providerMessageId: 'msg_1' });
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'JobPilot <hello@x.test>',
      to: ['a@example.com'],
      subject: 'Hello there',
      html: '<p>hi</p>',
      text: 'hi',
      headers: mail.headers,
    });
  });

  it('throws on a non-2xx response', async () => {
    const fetchFake = vi.fn(async () => new Response('bad', { status: 422 }));
    await expect(createResendSender('k', 'f', fetchFake).send(mail)).rejects.toThrow('422');
  });
});

describe('preview sender', () => {
  it('writes an html file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jp-emails-'));
    try {
      const log = vi.fn();
      const { providerMessageId } = await createPreviewSender(dir, log).send(mail);
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d+-a-example-com-hello-there\.html$/);
      expect(providerMessageId).toBe(`preview:${files[0]}`);
      expect(await readFile(join(dir, files[0] as string), 'utf8')).toBe('<p>hi</p>');
      expect(log).toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
