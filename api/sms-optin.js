// RSVPs from the sample invitations carriers review:
// - doreh.com/r/demo (10DLC, per-event): a guest may add their own number and tick "Text me updates"; only then do we keep
//   the number, with the exact consent text they saw, and send one confirmation text.
// - doreh.com/invite/demo (short code, program 'events'): the guest's number is their account; ticking the box opts them in
//   to texts for all their Doreh events. No text is sent until the short code is live.
// One private Blob per opt-in: sms-optin/<time>-<random>.json
// Env: TELNYX_API_KEY, CALL_FROM (defaults to the Doreh number).
import { put } from '@vercel/blob';
import { createHash, randomBytes } from 'node:crypto';
import { sameSite, looksLikeSpam, overLimit } from './_guard.js';

const CONSENT = 'By checking this box, you agree to receive text messages from Doreh about this event on behalf of the host: your RSVP confirmation, reminders, day-of updates and a thank-you note. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. Consent is not required to RSVP. Privacy: doreh.com/privacy. Terms: doreh.com/terms.';
const CONSENT_EVENTS = 'Text me invitations and updates for my Doreh events. By checking this box, you agree to receive recurring texts from Doreh at the number provided: event invitations, RSVP confirmations, reminders and updates. Consent is not required to RSVP. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Carriers are not liable for delayed or undelivered messages. Terms: doreh.com/terms#sms Privacy: doreh.com/privacy';
const CONFIRM = "Doreh: You're signed up for texts about Emily & David's wedding. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. Privacy: doreh.com/privacy";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// US mobile numbers only, as +1XXXXXXXXXX
function usNumber(v) {
  const d = String(v || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? '+1' + ten : null;
}

// one confirmation per number per day, so the form can't be used to flood someone's phone
async function firstToday(phone, prefix) {
  const day = new Date().toISOString().slice(0, 10);
  const who = createHash('sha256').update(phone).digest('hex').slice(0, 32);
  try {
    await put(prefix + 'sent/' + day + '/' + who, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    return true;
  } catch { return false; }
}

export async function POST(request) {
  if (!sameSite(request)) return json({ error: 'Send this from doreh.com.' }, 403);
  const text = await request.text();
  if (text.length > 4000) return json({ error: 'Too large.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Try again.' }, 400); }
  if (looksLikeSpam(body, 2) === 'bot') return json({ ok: true });

  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const attending = body.attending === 'yes' ? 'yes' : body.attending === 'no' ? 'no' : null;
  if (!name) return json({ error: 'Enter your name.' }, 400);
  if (!attending) return json({ error: 'Choose whether you can come.' }, 400);

  const events = body.program === 'events';
  const optIn = body.optIn === true;
  const raw = String(body.phone || '').trim();
  if (!optIn) return json({ ok: true, texts: false }); // a plain RSVP: no number is kept
  const phone = usNumber(raw);
  if (!phone) return json({ error: 'Enter a US mobile number to get texts.' }, 400);

  const prefix = process.env.VERCEL_ENV === 'production' ? 'sms-optin/' : 'sms-optin-test/';
  const at = new Date().toISOString();
  try {
    if (await overLimit(request, 'sms-optin', 10)) return json({ error: 'Too many tries. Try again in an hour.' }, 429);
    await put(prefix + at.replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex') + '.json', JSON.stringify({
      phone, name, attending, event: 'demo', program: events ? 'events' : 'event', consent: events ? CONSENT_EVENTS : CONSENT, at,
      page: events ? 'https://doreh.com/invite/demo' : 'https://doreh.com/r/demo',
      country: request.headers.get('x-vercel-ip-country') || '',
      userAgent: (request.headers.get('user-agent') || '').slice(0, 300),
    }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
  } catch (err) {
    console.error('sms-optin save failed', { error: err?.message });
    return json({ error: 'That did not go through. Try again in a minute.' }, 502);
  }

  // the opt-in is recorded either way; a failed confirmation text only gets logged
  if (!events && process.env.TELNYX_API_KEY && await firstToday(phone, prefix)) {
    try {
      const r = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + process.env.TELNYX_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: process.env.CALL_FROM || '+14245505566', to: phone, text: CONFIRM }),
      });
      if (!r.ok) console.error('sms-optin confirmation failed', { status: r.status, body: (await r.text()).slice(0, 300) });
    } catch (err) {
      console.error('sms-optin confirmation failed', { error: err?.message });
    }
  }
  return json({ ok: true, texts: true });
}
