// Early-access sign-ups. One private Blob per email: early-access/<sha256(email)>.json
// Needs a Vercel Blob store connected to this project (provides BLOB_READ_WRITE_TOKEN).
import { put, get } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { sameSite, looksLikeSpam, overLimit } from './_guard.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['host', 'planner', 'vendor']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request) {
  if (!sameSite(request)) return json({ error: 'Send this from doreh.com.' }, 403);
  const text = await request.text();
  if (text.length > 4000) return json({ error: 'Too large.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Try again.' }, 400); }

  // bots get a normal-looking success so they don't adapt
  if (looksLikeSpam(body, 2) === 'bot') return json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email.' }, 400);
  const role = ROLES.has(body.role) ? body.role : 'unspecified';
  // only production writes count; previews and local runs go to a separate prefix
  const prefix = process.env.VERCEL_ENV === 'production' ? 'early-access/' : 'early-access-test/';
  const path = prefix + createHash('sha256').update(email).digest('hex') + '.json';

  try {
    if (await overLimit(request, 'early-access', 10)) return json({ error: 'Too many tries. Try again in an hour.' }, 429);
    // already signed up: keep the first record
    const existing = await get(path, { access: 'private', useCache: false });
    if (existing && existing.statusCode === 200) return json({ ok: true });
    await put(path, JSON.stringify({
      email, role,
      at: new Date().toISOString(),
      ref: String(body.ref || '').slice(0, 300),
      country: request.headers.get('x-vercel-ip-country') || '',
    }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
    return json({ ok: true });
  } catch (err) {
    // a simultaneous sign-up with the same email already wrote the record
    if (/already exists/i.test(err?.message || '')) return json({ ok: true });
    console.error('early-access failed', { error: err?.message });
    return json({ error: 'That did not go through. Try again in a minute.' }, 502);
  }
}
