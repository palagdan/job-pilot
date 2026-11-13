import { createHmac, timingSafeEqual } from 'node:crypto';

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`unsubscribe:${payload}`).digest();

/** `base64url(userId).base64url(hmac)`. No expiry: unsubscribe links in old emails must keep working. */
export const createUnsubscribeToken = (userId: string, secret: string) => {
  const payload = Buffer.from(userId, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
};

/** Returns the user id, or null when the token is malformed or the signature does not match. */
export const verifyUnsubscribeToken = (token: string, secret: string): string | null => {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const given = Buffer.from(signature, 'base64url');
  const expected = sign(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const userId = Buffer.from(payload, 'base64url').toString('utf8');
  return userId || null;
};
