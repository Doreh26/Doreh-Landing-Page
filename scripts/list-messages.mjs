// Lists contact-form messages, newest first.
// Same setup as list-early-access.mjs:  node --env-file=.env.local scripts/list-messages.mjs [investor|host|planner|vendor|other]
import { list, get } from '@vercel/blob';

const only = process.argv[2];
const rows = [];
let cursor;
do {
  const page = await list({ prefix: 'contact/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const f = await get(b.pathname, { access: 'private', useCache: false });
    if (f?.statusCode === 200) rows.push(JSON.parse(await new Response(f.stream).text()));
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
const shown = rows.filter((r) => !only || r.topic === only).sort((a, b) => (a.at < b.at ? 1 : -1));
console.log(shown.length, 'message(s)' + (only ? ' from ' + only + 's' : ''));
for (const r of shown) {
  console.log('\n' + r.at.slice(0, 16).replace('T', ' '), '|', r.topic, '|', r.name, '<' + r.email + '>', r.country ? '| ' + r.country : '');
  console.log('  ' + r.message.replace(/\n/g, '\n  '));
}
