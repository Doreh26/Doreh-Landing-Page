# Doreh-Landing-Page

doreh.com — the first fold of the Doreh site: hero and **Request early access**.

- Hosted on Vercel, project `dorehlandingpage`. Every push to `main` goes live.
- `index.html` — the page. `privacy.html`, `terms.html` — served at /privacy and /terms.
- Footer: Investors and Contact open a contact pop-up (also at /contact); Privacy & Terms opens one pop-up with two tabs, loaded from /privacy and /terms.
- `api/contact.js` — saves each contact message to the same Blob store (`contact/`); read with `scripts/list-messages.mjs [investor]`.
- `api/early-access.js` — saves each sign-up to a private Vercel Blob store connected to the project.
- `scripts/list-early-access.mjs` — prints the sign-ups (see the comment at the top for setup).
