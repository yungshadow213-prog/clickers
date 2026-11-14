# Clickers — The Story House

Clickers is the editorial bookshop and reading room for original books by Yung Dharick.

## Public experience
- Editorial homepage and dedicated searchable bookshop.
- Genre discovery, individual book pages and free chapter previews.
- Responsive layouts and accessible reader controls.
- NGN ebook prices and a Paystack checkout path for books marked for sale.
- Private PDF delivery through a short-lived signed download URL after server-side Paystack verification.

## Author Studio
- Open `/author.html` (also linked discreetly in the public-site footer).
- Sign in with the approved Clickers Supabase Auth account.
- Create and edit books, covers, chapters and previews.
- Upload the complete PDF to the private `clickers-private` bucket.
- Set an NGN price, mark the book for sale, publish and manage private backups/revisions.

## Catalogue reset
The old public catalogue was cleared on 2026-11-14. `books.js` starts empty, old generated story pages and old cover artwork were removed, and the public API only lists editions created from 2026-11-14 onward. Private manuscripts, revisions, the Author Studio and the author account were preserved.

## Payments and delivery
- Paystack keys are server-only Cloudflare Worker secrets: `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET`.
- The Worker initializes transactions from the book's saved NGN price, verifies the Paystack transaction and checks amount, currency and buyer email before releasing a download.
- The complete PDF is never placed in the public catalogue or public Storage bucket.
- Download links expire after 10 minutes.
- Webhook endpoint: `https://clickers.rayyung713.workers.dev/api/paystack/webhook`.
- Callback page: `https://yungshadow213-prog.github.io/clickers/checkout.html`.
- Paid chapter access is not enabled; paid editions are complete PDF ebooks.

## Deployment
- GitHub Pages publishes the static storefront through `.github/workflows/pages.yml`.
- Cloudflare Worker source is `cloudflare/worker.mjs`, deployed with Wrangler.
- Supabase schema changes are tracked under `supabase/migrations/`.
