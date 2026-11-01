import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PUSH_TIMEOUT_MS } from './push.constants';

/** What the tick needs in order to encrypt one message for one browser. */
export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The body the service worker shows. `url` is already a same-site path, when there is one. */
export interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends one web-push message. The tick depends on this interface, so tests replace it and never
 * call the push service.
 */
export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<void>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** The push service refused the subscription (404 or 410) or failed for another HTTP status. */
export class PushRejectedError extends Error {
  constructor(readonly statusCode: number) {
    super('Push rejected');
  }
}

/** web-push plus the VAPID keys from the environment. Each send gives up after 10 seconds. */
@Injectable()
export class WebPushSender implements PushSender {
  constructor(config: ConfigService) {
    webpush.setVapidDetails(
      config.getOrThrow<string>('VAPID_SUBJECT'),
      config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  async send(target: PushTarget, message: PushMessage): Promise<void> {
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      ...(message.url ? { url: message.url } : {}),
    });
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { timeout: PUSH_TIMEOUT_MS },
      );
    } catch (error) {
      const statusCode = statusOf(error);
      if (statusCode !== undefined) throw new PushRejectedError(statusCode);
      throw error;
    }
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  const statusCode = error.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}
