# Clickers Author Studio — setup and safety

## Admin access

The private author dashboard is published at:

- `https://yungshadow213-prog.github.io/clickers/author.html`
- `https://yungshadow213-prog.github.io/clickers/admin.html` (short alias)

The public bookshop links to Author Studio, but the dashboard itself requires the approved Supabase Auth account. Account creation is disabled in the browser.

## Architecture

- `author.html` / `author.js`: private author interface.
- `cloudflare/worker.mjs`: validates Supabase sessions, restricts author actions to the configured owner ID, stores the private manuscripts and mediates ebook uploads and purchases.
- Supabase Postgres: private books, chapters, revisions and order records. RLS is enabled; direct `anon` and `authenticated` access to author and order tables is revoked.
- Supabase Storage: public covers in `clickers-book-images`; full ebook PDFs and backup snapshots in private `clickers-private`.

## Current Supabase project

The dedicated Clickers project is `jlqyusgaauovyksksywh` in `eu-west-2`. It was restored on 2026-11-14 and is now healthy. The private author schema and public image migration were already applied. The ebook sales migration `20261114172038_clickers_book_sales` is applied and verified.

## Cloudflare Worker secrets

Keep all secret values out of browser files and Git:

```sh
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put OWNER_USER_ID
npx wrangler secret put PAYSTACK_SECRET_KEY
npx wrangler secret put PAYSTACK_WEBHOOK_SECRET
```

The public Supabase URL and publishable key are configured in `author-config.js`. The Worker also needs the existing Supabase URL, publishable key and allowed origin settings. Deploy the Worker after setting the secrets. For a GitHub-driven deployment, add repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run Actions → Deploy Clickers Worker → Run workflow. This deploy workflow preserves Worker secrets already configured in Cloudflare. Alternatively, run `npx wrangler deploy` from a locally authenticated project directory.

Use the Paystack secret key from the environment you intend to run (test first, then live). The webhook signing secret is managed in Paystack Dashboard → Developers → Webhooks / API configuration. Never paste either secret into this chat, source files or GitHub commits.

## Paystack configuration

- Callback URL: `https://yungshadow213-prog.github.io/clickers/checkout.html`
- Webhook URL: `https://clickers.rayyung713.workers.dev/api/paystack/webhook`
- Currency: NGN. Prices entered in Author Studio are naira; the Worker converts to kobo.
- The Worker creates the transaction from the stored book price. Client-submitted prices are ignored.
- The Worker verifies the transaction directly with Paystack and checks the reference, successful status, amount, currency and buyer email before issuing a 10-minute signed URL.
- Paystack webhooks are signature-verified. Both the newer timestamped `Paystack-Signature` and legacy `x-paystack-signature` format are supported.
- Ebook PDFs are stored in the private Storage bucket and are not returned by public book APIs.
- Do not publish a book for sale until a PDF is uploaded, a price is set and Paystack secrets are configured.

## Publishing workflow

1. Sign in at `/author.html`.
2. Create the book, upload its cover and write its free sample chapters.
3. Upload the complete ebook PDF, set its NGN price and enable Offer this book for sale.
4. Save the book, publish at least one free chapter, then publish the book.
5. The public book page shows the price and secure checkout action.
6. After successful payment, Paystack redirects the buyer to the checkout page; the Worker verifies the transaction and issues a temporary private download URL.

Paid chapters are deliberately not delivered as unlocked web chapters. Clickers sells the complete PDF edition. Orders retain a snapshot of the book title, amount and PDF storage path so later book edits do not change a completed purchase.

## Safety and operational notes

- Only the configured owner account can access author routes.
- Secret/service-role keys remain server-side.
- RLS is enabled on private tables, with no direct public or authenticated table grants.
- Full PDF files are not stored in public buckets.
- Paystack confirmation is server-side; a browser redirect alone never unlocks a file.
- Test transactions in Paystack test mode before accepting live payments.
- The Supabase security advisor currently reports that leaked-password protection is disabled; enable it in Supabase Auth settings before inviting any additional accounts.
