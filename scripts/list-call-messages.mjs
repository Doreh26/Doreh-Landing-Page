// Lists messages taken by the voice assistant on the Doreh number, newest first.
// Same setup as list-early-access.mjs:  node --env-file=.env.local scripts/list-call-messages.mjs [word to search for]
import { list, get } from '@vercel/blob';

const only = process.argv[2];
const rows = [];
let cursor;
do {
  const page = await list({ prefix: 'calls/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const f = await get(b.pathname, { access: 'private', useCache: false });
    if (f?.statusCode === 200) rows.push(JSON.parse(await new Response(f.stream).text()));
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
const shown = rows.filter((r) => !only || (r.name + ' ' + r.number + ' ' + r.message).toLowerCase().includes(only.toLowerCase())).sort((a, b) => (a.at < b.at ? 1 : -1));
console.log(shown.length, 'message(s)' + (only ? ' matching "' + only + '"' : ''));
for (const r of shown) {
  console.log('\n' + r.at.slice(0, 16).replace('T', ' '), '|', r.name || 'No name', '|', r.number || 'no number');
  console.log('  ' + (r.message || '(no message)'));
}
