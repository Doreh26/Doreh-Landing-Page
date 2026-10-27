// Messages taken by the Telnyx voice assistant on the Doreh number. The assistant's "take_message" webhook
// tool posts here; we keep one private Blob per message (calls/<time>-<random>.json) and text it to the founder
// from the Doreh number. Either one succeeding counts, so a message is never lost to a single failure.
// Env: CALL_MESSAGE_SECRET (shared with the Telnyx tool's x-doreh-secret header), TELNYX_API_KEY,
// CALL_NOTIFY_TO (the founder's mobile, E.164), CALL_FROM (defaults to the Doreh number).
import { put } from '@vercel/blob';
import { randomBytes, timingSafeEqual } from 'node:crypto';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function authorized(request) {
  const want = process.env.CALL_MESSAGE_SECRET || '';
  const got = request.headers.get('x-doreh-secret') || '';
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

async function sendText(text) {
  const key = process.env.TELNYX_API_KEY, to = process.env.CALL_NOTIFY_TO;
  if (!key || !to) throw new Error('texting is not configured');
  const r = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.CALL_FROM || '+14245505566', to, text }),
  });
  if (!r.ok) throw new Error('telnyx ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const raw = await request.text();
  if (raw.length > 8000) return json({ error: 'too long' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }

  const name = clip(body.caller_name, 120);
  const number = clip(body.callback_number, 40);
  const message = clip(body.message, 1500);
  if (!message && !number) return json({ error: 'message or callback_number is required' }, 400);

  const at = new Date().toISOString();
  const prefix = process.env.VERCEL_ENV === 'production' ? 'calls/' : 'calls-test/';
  const path = prefix + at.replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex') + '.json';
  const text = 'Doreh call message\n' + (name || 'No name') + ', ' + (number || 'no number') + '\n' + (message || '(no message)').slice(0, 600);

  const [saved, texted] = await Promise.allSettled([
    put(path, JSON.stringify({ name, number, message, at }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false }),
    sendText(text),
  ]);
  if (saved.status === 'rejected') console.error('call-message save failed', { error: saved.reason?.message });
  if (texted.status === 'rejected') console.error('call-message text failed', { error: texted.reason?.message });
  if (saved.status === 'rejected' && texted.status === 'rejected') return json({ error: 'could not deliver the message' }, 502);
  // the assistant reads this back, so keep it plain
  return json({ ok: true, result: 'Message delivered to the Doreh team.' });
}
