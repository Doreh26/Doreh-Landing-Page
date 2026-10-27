// Incoming texts to the Doreh number (Telnyx messaging profile webhook). The number is text-out only:
// STOP/HELP/START are answered by Telnyx's keyword replies and skipped here; any other text gets one fixed
// reply pointing to phone and email support, at most once per sender per day. Message bodies are not stored.
// Env: TELNYX_PUBLIC_KEY (Telnyx portal → Keys & Credentials → Public Key), TELNYX_API_KEY.
import { put } from '@vercel/blob';
import { createHash, createPublicKey, verify } from 'node:crypto';

const KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'HELP', 'INFO', 'START', 'UNSTOP']);
const REPLY = 'Doreh: This number does not accept text messages. For help, call +1 424 550 5566 or email support@doreh.com. Reply STOP to opt out.';
const MAX_SKEW_SECONDS = 300;

const ok = () => new Response(null, { status: 200 });

// Telnyx signs `${timestamp}|${rawBody}` with Ed25519; the public key is the raw 32-byte key, base64.
function signed(request, raw) {
  const key = process.env.TELNYX_PUBLIC_KEY, sig = request.headers.get('telnyx-signature-ed25519'), ts = request.headers.get('telnyx-timestamp');
  if (!key || !sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) return false;
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'base64')]);
    return verify(null, Buffer.from(ts + '|' + raw), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(sig, 'base64'));
  } catch { return false; }
}

// First reply of the day to this sender? A marker blob that can't be overwritten makes the check atomic.
async function firstToday(phone) {
  const day = new Date().toISOString().slice(0, 10);
  const who = createHash('sha256').update(phone).digest('hex').slice(0, 32);
  const prefix = process.env.VERCEL_ENV === 'production' ? 'sms-autoreply/' : 'sms-autoreply-test/';
  try {
    await put(prefix + day + '/' + who, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    return true;
  } catch { return false; } // already replied today, or storage is down: stay quiet either way
}

export async function POST(request) {
  const raw = await request.text();
  if (!signed(request, raw)) return new Response(null, { status: 401 });
  let event;
  try { event = JSON.parse(raw); } catch { return ok(); }
  const data = event?.data;
  const msg = data?.payload;
  // delivery receipts and anything that isn't a new incoming text are acknowledged and ignored
  if (data?.event_type !== 'message.received' || msg?.direction !== 'inbound') return ok();

  const from = msg.from?.phone_number, ours = msg.to?.[0]?.phone_number;
  const word = String(msg.text || '').trim().toUpperCase();
  if (!from || !ours || KEYWORDS.has(word)) return ok();
  if (!(await firstToday(from))) return ok();

  try {
    const r = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.TELNYX_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: ours, to: from, text: REPLY }),
    });
    if (!r.ok) console.error('sms-inbound reply failed', { status: r.status, body: (await r.text()).slice(0, 300) });
  } catch (err) {
    console.error('sms-inbound reply failed', { error: err?.message });
  }
  return ok(); // always 200 so Telnyx doesn't retry
}
