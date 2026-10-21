// Lists early-access sign-ups, newest first.
// Setup once:  npx vercel link --project dorehlandingpage && npx vercel env pull .env.local
// Then:        node --env-file=.env.local scripts/list-early-access.mjs [--csv]
import { list, get } from '@vercel/blob';

const rows = [];
let cursor;
do {
  const page = await list({ prefix: 'early-access/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const f = await get(b.pathname, { access: 'private', useCache: false });
    if (f?.statusCode === 200) rows.push(JSON.parse(await new Response(f.stream).text()));
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
rows.sort((a, b) => (a.at < b.at ? 1 : -1));
if (process.argv.includes('--csv')) {
  console.log('email,role,signed_up,country');
  for (const r of rows) console.log([r.email, r.role, r.at, r.country].join(','));
} else {
  console.log(rows.length, 'sign-ups');
  for (const r of rows) console.log(r.at.slice(0, 10), '|', r.role.padEnd(7), '|', r.email, r.country ? '| ' + r.country : '');
}
