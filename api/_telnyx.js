// Telnyx helpers shared by sms-inbound, voice-menu and voice-vars.
// Webhook signatures:
// Telnyx signs `${timestamp}|${rawBody}` with Ed25519; TELNYX_PUBLIC_KEY is the raw 32-byte key, base64
// (Telnyx portal → Keys & Credentials → Public Key).
import { put, get } from '@vercel/blob';
import { createHash, createPublicKey, verify } from 'node:crypto';

const MAX_SKEW_SECONDS = 300;

export function signed(request, raw) {
  const key = process.env.TELNYX_PUBLIC_KEY, sig = request.headers.get('telnyx-signature-ed25519'), ts = request.headers.get('telnyx-timestamp');
  if (!key || !sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) return false;
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'base64')]);
    return verify(null, Buffer.from(ts + '|' + raw), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(sig, 'base64'));
  } catch { return false; }
}

// The keypad menu (voice-menu) remembers which option a caller picked, and the assistant's dynamic-variables
// webhook (voice-vars) reads it a moment later. Keyed by a hash of the caller's number; old picks are ignored.
const ROUTE_MAX_AGE_MS = 2 * 60 * 1000;

function routePath(phone) {
  const prefix = process.env.VERCEL_ENV === 'production' ? 'call-route/' : 'call-route-test/';
  return prefix + createHash('sha256').update(String(phone)).digest('hex').slice(0, 32) + '.json';
}

export async function saveRoute(phone, route) {
  await put(routePath(phone), JSON.stringify({ route, at: Date.now() }), {
    access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
  });
}

export async function readRoute(phone) {
  const found = await get(routePath(phone), { access: 'private', useCache: false });
  if (!found || found.statusCode !== 200) return null;
  const { route, at } = JSON.parse(await new Response(found.stream).text());
  return Date.now() - at < ROUTE_MAX_AGE_MS ? route : null;
}
