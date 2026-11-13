import { describe, expect, it } from 'vitest';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.ts';

const secret = 'secret-secret-secret-secret-secret-1';

describe('unsubscribe token', () => {
  it('round-trips', () => {
    const token = createUnsubscribeToken('user-1', secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe('user-1');
  });

  it('rejects tampering, wrong secret and garbage', () => {
    const token = createUnsubscribeToken('user-1', secret);
    const [, sig] = token.split('.') as [string, string];
    const forged = `${Buffer.from('user-2').toString('base64url')}.${sig}`;
    expect(verifyUnsubscribeToken(forged, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, 'other-secret-other-secret-other-1')).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, secret)).toBeNull();
    expect(verifyUnsubscribeToken('nope', secret)).toBeNull();
    expect(verifyUnsubscribeToken('a.b.c', secret)).toBeNull();
    expect(verifyUnsubscribeToken('', secret)).toBeNull();
  });
});
