// Spam checks shared by the contact and early-access forms.
// 1. same-site only: the request must come from doreh.com (or a Vercel preview of it)
// 2. honeypot: a hidden "website" field people never see; bots fill it
// 3. too fast: a person needs a few seconds to fill the form; scripts submit instantly
// 4. rate limit: at most N submissions per IP address per hour (counted in the private Blob store)
// 5. links: messages stuffed with links are rejected
import { put, list } from '@vercel/blob';
import { createHash, randomBytes } from 'node:crypto';

const SITE = /^https:\/\/(www\.)?doreh\.com$|^https:\/\/dorehlandingpage-[a-z0-9-]+\.vercel\.app$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function sameSite(request) {
  const origin = request.headers.get('origin') || '';
  return SITE.test(origin);
}

// returns 'bot' (pretend success), or an error message, or null when it looks human
export function looksLikeSpam(body, minSeconds = 3) {
  if (body.website) return 'bot';
  const elapsed = Number(body.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < minSeconds * 1000) return 'bot';
  return null;
}

export function tooManyLinks(text, max = 2) {
  return (String(text).match(/https?:\/\/|www\./gi) || []).length > max;
}

export async function overLimit(request, bucket, perHour) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const id = createHash('sha256').update(ip + '|doreh').digest('hex').slice(0, 24);
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, '');
  const prefix = `ratelimit/${bucket}/${hour}/${id}/`;
  const { blobs } = await list({ prefix, limit: perHour + 1 });
  if (blobs.length >= perHour) return true;
  await put(prefix + randomBytes(4).toString('hex'), '1', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
  return false;
}
