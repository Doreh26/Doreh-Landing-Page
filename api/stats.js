// Early-access counts for the founder's daily update. Totals only, never emails.
// GET with "Authorization: Bearer <STATS_TOKEN>"; without the token it answers 404.
import { list, get } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function authorized(request) {
  const want = process.env.STATS_TOKEN || '';
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(request) {
  if (!authorized(request)) return json({ error: 'Not found.' }, 404);
  const day = 864e5, now = Date.now();
  const out = { total: 0, last24h: 0, last7d: 0, roles: {}, asOf: new Date(now).toISOString() };
  try {
    let cursor;
    do {
      const page = await list({ prefix: 'early-access/', cursor, limit: 1000 });
      for (const b of page.blobs) {
        const f = await get(b.pathname, { access: 'private', useCache: false });
        if (f?.statusCode !== 200) continue;
        const r = JSON.parse(await new Response(f.stream).text());
        const age = now - Date.parse(r.at);
        out.total++;
        if (age < day) out.last24h++;
        if (age < 7 * day) out.last7d++;
        out.roles[r.role || 'unspecified'] = (out.roles[r.role || 'unspecified'] || 0) + 1;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return json(out);
  } catch (err) {
    console.error('stats failed', { error: err?.message });
    return json({ error: 'Could not count.' }, 502);
  }
}
