'use client';

import { ApiError, callApi } from '../api/api-client.ts';

/** Why push could not be turned on; the toggle shows a message per reason. */
export type PushFailure = 'unsupported' | 'denied' | 'unavailable' | 'failed';

export class PushError extends Error {
  constructor(readonly reason: PushFailure) {
    super(reason);
  }
}

const SW_URL = '/sw.js';

export const isPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** VAPID keys are base64url; `pushManager.subscribe` wants bytes. */
const keyBytes = (base64url: string) => {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const save = (sub: PushSubscription) => {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return callApi('subscribePush', { body: { endpoint: json.endpoint, keys: json.keys } });
};

/**
 * Push toggle on: asks for permission, registers the service worker, subscribes this browser and saves the
 * subscription on the server. Throws `PushError` with the reason the toggle must flip back.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new PushError('unsupported');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('denied');

  let publicKey: string;
  try {
    ({ publicKey } = await callApi('getVapidKey'));
  } catch (error) {
    throw new PushError(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'failed');
  }
  try {
    const registration = await navigator.serviceWorker.register(SW_URL);
    await navigator.serviceWorker.ready;
    const sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await save(sub);
  } catch (error) {
    if (error instanceof PushError) throw error;
    throw new PushError(Notification.permission === 'denied' ? 'denied' : 'failed');
  }
}

/** Push toggle off: this browser stops receiving pushes. Best effort: the server also checks `notify_push`. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return;
  await callApi('unsubscribePush', { body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/**
 * On app start: re-sends an existing subscription so the server has this browser's current endpoint (browsers
 * rotate them). Never prompts for permission.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await registration?.pushManager.getSubscription();
  if (sub) await save(sub).catch(() => undefined);
}

export const pushFailureMessage = (reason: PushFailure, blocked: string) =>
  ({
    unsupported: 'This browser does not support notifications.',
    denied: blocked,
    unavailable: 'Push notifications are not available right now. Try email instead.',
    failed: 'Could not turn on push notifications. Try again.',
  })[reason];
