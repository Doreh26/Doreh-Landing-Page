// Dynamic-variables webhook for the Doreh assistant. Telnyx calls it as the assistant starts; we return
// the opening line for the option the caller pressed in the keypad menu (voice-menu.js). If this is slow or
// fails, the assistant uses its default values ("How can I help you today?").
// Env: TELNYX_PUBLIC_KEY.
import { signed, readRoute } from './_telnyx.js';

const OPENERS = {
  about: "We're reimagining how events are planned, shared, and remembered, from the first invitation to the last memory. "
    + "There's a lot more to reveal soon. To join our early access, sign up on our website, D-O-R-E-H dot com, "
    + "and we'll be in touch with next steps. Is there anything else I can help with?",
  team: "I can see if someone from our team is available. May I have your name and company?",
  message: "I'll take a message for our team. May I have your name, your company, and the reason for your call?",
  open: 'How can I help you today?',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function POST(request) {
  const raw = await request.text();
  if (!signed(request, raw)) return json({ error: 'unauthorized' }, 401);
  let route = null;
  try {
    const caller = JSON.parse(raw)?.data?.payload?.telnyx_end_user_target;
    if (caller) route = await readRoute(caller);
  } catch (err) {
    console.error('voice-vars route read failed', { error: err?.message });
  }
  route = OPENERS[route] ? route : 'open';
  return json({ dynamic_variables: { caller_choice: route, opener: OPENERS[route] } });
}
