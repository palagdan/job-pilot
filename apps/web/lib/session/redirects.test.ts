import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../../proxy.ts';
import { destinationFor, onboardingPath, stepFromSlug, stepSlug } from '../onboarding/steps.ts';
import { defaultAfterLogin, loginUrl, pathnameHeader, safeNext } from './safe-next.ts';

describe('safeNext (no open redirects)', () => {
  it.each([
    ['/pipeline?status=sent', '/pipeline?status=sent'],
    ['/cvs/123', '/cvs/123'],
    [undefined, defaultAfterLogin],
    ['', defaultAfterLogin],
    ['https://evil.example', defaultAfterLogin],
    ['//evil.example', defaultAfterLogin],
    ['/\\evil.example', defaultAfterLogin],
    ['javascript:alert(1)', defaultAfterLogin],
    ['/today\r\nSet-Cookie: x=1', defaultAfterLogin],
    ['/login', defaultAfterLogin],
    ['/login?next=/x', defaultAfterLogin],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it('builds login URLs, omitting the default target', () => {
    expect(loginUrl('/pipeline')).toBe('/login?next=%2Fpipeline');
    expect(loginUrl('/today')).toBe('/login');
    expect(loginUrl('//evil.example')).toBe('/login');
  });
});

describe('onboarding steps', () => {
  it('maps steps to kebab-case slugs and back', () => {
    expect(stepSlug('confirm_profile')).toBe('confirm-profile');
    expect(stepFromSlug('set-targets')).toBe('set_targets');
    expect(stepFromSlug('set_targets')).toBeNull();
    expect(stepFromSlug('nope')).toBeNull();
    expect(onboardingPath('schedule')).toBe('/onboarding/schedule');
  });

  it('sends unfinished users to their step, finished users to next', () => {
    expect(destinationFor({ onboardingCompletedAt: null, onboardingStep: 'set_targets' }, '/cvs')).toBe('/onboarding/set-targets');
    expect(destinationFor({ onboardingCompletedAt: '2026-11-13T10:00:00Z', onboardingStep: 'schedule' }, '/cvs')).toBe('/cvs');
  });
});

const run = (path: string, cookie?: string) =>
  proxy(new NextRequest(new URL(path, 'http://localhost:3000'), { headers: cookie ? { cookie } : {} }));

describe('proxy (optimistic cookie check)', () => {
  it('redirects signed-out visitors to login with next', () => {
    const res = run('/pipeline?status=sent');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fpipeline%3Fstatus%3Dsent');
  });

  it('lets public pages through without a cookie', () => {
    expect(run('/login').headers.get('location')).toBeNull();
    expect(run('/design-system').headers.get('location')).toBeNull();
  });

  it('lets requests with a session cookie through and forwards the path', () => {
    const res = run('/cvs?x=1', 'better-auth.session_token=abc.def');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get(`x-middleware-request-${pathnameHeader}`)).toBe('/cvs?x=1');
  });

  it('accepts the __Secure- cookie name used on https', () => {
    expect(run('/today', '__Secure-better-auth.session_token=abc').headers.get('location')).toBeNull();
  });
});
