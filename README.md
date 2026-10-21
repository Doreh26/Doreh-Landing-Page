# Doreh-Landing-Page

doreh.com — the first fold of the Doreh site: hero and **Request early access**.

- Hosted on Vercel, project `dorehlandingpage`. Every push to `main` goes live.
- `index.html` — the page. `privacy.html`, `terms.html` — served at /privacy and /terms.
- Footer: Privacy & Terms (one pop-up, two tabs, loaded from /privacy and /terms) and Contact (pop-up, also at /contact: Name, Email, Subject, Message).
- `api/contact.js` — saves each contact message to the same Blob store (`contact/`); read with `scripts/list-messages.mjs [search word]`.
- `api/_guard.js` — spam checks for both forms: same-site only, hidden honeypot field, too-fast submits, per-IP hourly limit (contact 5, early access 10), link-stuffed messages.
- `api/early-access.js` — saves each sign-up to a private Vercel Blob store connected to the project.
- `scripts/list-early-access.mjs` — prints the sign-ups (see the comment at the top for setup).
