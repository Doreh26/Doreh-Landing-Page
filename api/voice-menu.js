// Keypad menu in front of the AI assistant on the Doreh number (TeXML application voice URL).
// The greeting plays inside <Gather>, so pressing 1, 2 or 3 cuts it off at once; the assistant then
// picks up with an opening line for that choice (see voice-vars.js). The assistant itself only hears
// keys after its own greeting, which is why the menu lives here.
// Telnyx app voice URL: https://doreh.com/api/voice-menu?k=<VOICE_MENU_KEY>
// Env: VOICE_MENU_KEY, VOICE_ASSISTANT_ID (assistant-...), VOICE_MENU_VOICE (same voice as the assistant).
import { timingSafeEqual } from 'node:crypto';
import { saveRoute } from './_telnyx.js';

const GREETING = "Welcome to Do-reh! I'm an AI assistant, and this call is transcribed for quality assurance purposes. "
  + "If you'd like to learn more about us or our early access program, press 1. "
  + "If you're calling about investing, partnerships, or media, press 2. "
  + 'To leave a message, press 3. Or stay on the line to talk with me.';
const ROUTES = { 1: 'about', 2: 'team', 0: 'team', 3: 'message' };

const xml = (body) => new Response('<?xml version="1.0" encoding="UTF-8"?>\n<Response>' + body + '</Response>', {
  headers: { 'content-type': 'application/xml', 'cache-control': 'no-store' },
});
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function keyOk(url) {
  const want = process.env.VOICE_MENU_KEY || '', got = url.searchParams.get('k') || '';
  return want.length > 0 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function menu(url, retry, sorry) {
  const next = (step) => esc(url.origin + url.pathname + '?k=' + encodeURIComponent(url.searchParams.get('k')) + '&step=' + step + (retry ? '&retry=1' : ''));
  const say = '<Say voice="' + esc(process.env.VOICE_MENU_VOICE || 'alice') + '">' + esc((sorry ? "Sorry, I didn't catch that. " : '') + GREETING) + '</Say>';
  return xml('<Gather input="dtmf" numDigits="1" timeout="3" action="' + next('pick') + '" method="POST">' + say + '</Gather>'
    + '<Redirect method="POST">' + next('pick') + '</Redirect>');
}

async function handle(request) {
  const url = new URL(request.url);
  if (!keyOk(url)) return new Response(null, { status: 403 });
  const form = request.method === 'POST' ? new URLSearchParams(await request.text()) : url.searchParams;
  if (url.searchParams.get('step') !== 'pick') return menu(url, false, false);

  const digit = (form.get('Digits') || '').trim();
  const retry = url.searchParams.get('retry') === '1';
  if (digit === '9') return menu(url, retry, false);
  // an unknown key gets the menu once more; after that, or with no key at all, the assistant just asks how it can help
  if (digit && !ROUTES[digit] && !retry) return menu(url, true, true);
  const route = ROUTES[digit] || 'open';

  const from = form.get('From');
  if (from) {
    try { await saveRoute(from, route); } catch (err) { console.error('voice-menu route save failed', { error: err?.message }); }
  }
  return xml('<Connect><AIAssistant id="' + esc(process.env.VOICE_ASSISTANT_ID || '') + '"/></Connect>');
}

export const GET = handle;
export const POST = handle;
