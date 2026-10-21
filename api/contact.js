// Contact form messages. One private Blob per message: contact/<time>-<random>.json
// Uses the same Blob store as early-access (BLOB_READ_WRITE_TOKEN).
import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = new Set(['host', 'planner', 'vendor', 'investor', 'other']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const clip = (v, n) => String(v || '').trim().slice(0, n);

export async function POST(request) {
  const text = await request.text();
  if (text.length > 12000) return json({ error: 'Message is too long.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Try again.' }, 400); }

  // bots fill the hidden field; pretend it worked
  if (body.website) return json({ ok: true });

  const name = clip(body.name, 120);
  const email = clip(body.email, 200).toLowerCase();
  const message = clip(body.message, 4000);
  const topic = TOPICS.has(body.topic) ? body.topic : 'other';
  if (!name) return json({ error: 'Enter your name.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email.' }, 400);
  if (!message) return json({ error: 'Write a message.' }, 400);

  // only production messages count; previews and local runs go to a separate prefix
  const prefix = process.env.VERCEL_ENV === 'production' ? 'contact/' : 'contact-test/';
  const at = new Date().toISOString();
  const path = prefix + at.replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex') + '.json';
  try {
    await put(path, JSON.stringify({
      topic, name, email, message, at,
      country: request.headers.get('x-vercel-ip-country') || '',
    }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
    return json({ ok: true });
  } catch (err) {
    console.error('contact failed', { error: err?.message });
    return json({ error: 'That did not go through. Try again in a minute.' }, 502);
  }
}
