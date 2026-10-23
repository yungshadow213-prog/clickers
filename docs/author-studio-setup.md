# Clickers private author studio — setup and safety

This feature is isolated on \`feature/private-author-dashboard\`. It does not change the reader page design or replace the existing \`books.js\` catalogue. It adds a separate \`author.html\` dashboard, a Cloudflare Worker API, and a Supabase migration for private author content.

## Important distinction

The two manuscripts currently stored in \`books.js\` are already public in the repository and on the static site. This upgrade does not make those existing published texts private retroactively. New drafts must be created in the private author dashboard and must not be copied into \`books.js\` until they are ready to be public.

The Worker public API only lists published books and only returns chapters whose status is \`published\` **and** \`is_paid = false\`. Paid chapters remain excluded even if someone marks them published. Payment processing and paid-reader entitlements are not implemented yet, so do not sell access until that is implemented and tested.

## Architecture

- Existing Clickers reading room: stays visually unchanged.
- \`author.html\` / \`author.js\`: separate author-only interface; sign-in is via Supabase Auth.
- Cloudflare Worker (\`cloudflare/worker.mjs\`): checks the Supabase access token and an exact configured owner user ID before any author operation. The Supabase secret key is only used inside the Worker.
- Supabase Postgres: private books, chapters, and chapter revisions; tables have RLS enabled and direct \`anon\` / \`authenticated\` table grants revoked.
- Supabase Storage: private \`clickers-private\` bucket for backup JSON snapshots. Backup recovery creates additional **draft copies**; it never overwrites existing books.

## One-time setup

**Already completed:** a dedicated project named \`clickers\` was created for this site in region \`eu-west-2\`, and migration \`clickers_private_author\` was applied and verified. Its project reference is \`jlqyusgaauovyksksywh\`. The private tables have row-level security enabled, the private Storage bucket exists, and the security advisor returned no findings at setup time. Existing Supabase projects were not changed.

**Still required before the dashboard can sign in:**

1. In [Clickers Authentication → Users](https://supabase.com/dashboard/project/jlqyusgaauovyksksywh/auth/users), create the one approved author account. Use an email address you control and a strong password. Public sign-up is intentionally not provided by the dashboard. The user's UUID becomes \`OWNER_USER_ID\`.
2. In [Clickers Project Settings → API Keys](https://supabase.com/dashboard/project/jlqyusgaauovyksksywh/settings/api-keys), copy the Project URL, publishable key, and a server-side secret key. The publishable key is already configured in \`author-config.js\`. The secret key must never be added to browser files, commits, screenshots, or chat.
3. Install Wrangler in your local project environment and authenticate to Cloudflare. From the repository root, set Worker secrets:

   \`\`\`sh
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
   npx wrangler secret put SUPABASE_SECRET_KEY
   npx wrangler secret put OWNER_USER_ID
   npx wrangler deploy
   \`\`\`

   Paste each value only into Wrangler's interactive prompt. Do not put secret values in shell history, commits, or screenshots.

4. The Worker allows browser requests only from \`https://yungshadow213-prog.github.io\` by default. If the site later moves to a custom domain, change \`ALLOWED_ORIGIN\` in \`wrangler.toml\` and deploy again.
5. The public Worker URL must be added to \`author-config.js\` after deployment. Then deploy the static site using its existing Pages workflow. The public reader UI remains unchanged.

## Security behaviour

- Only the exact configured Supabase Auth user ID can use author routes.
- Worker secrets never appear in browser JavaScript.
- Private books, chapters, and revision snapshots are not returned by the public endpoints.
- The public chapter endpoint filters to \`status=published\` and \`is_paid=false\`.
- Supabase Storage bucket is private. Backup objects live under the authenticated owner's UUID folder.
- Chapter updates save the prior version to revision history before applying edits.
- Restoring a backup creates new books/chapters as drafts, leaves existing books untouched, and retains paid flags so recovered paid chapters remain locked from public delivery.
- Backups are stored in the same Supabase project. Keep a separate offline copy of important backups too; same-project storage is not a substitute for disaster recovery.

## Free-tier feasibility (checked 23 October 2026)

The first deployment can be operated at **$0/month** if usage remains within both platforms' free allowances and no paid add-ons are selected:

- Cloudflare Workers Free: 100,000 requests/day, with 10 ms CPU time per invocation. The Worker is small and the API workload should fit for a small author workflow. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) · [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Supabase Free: 500 MB database per project, 1 GB file storage, 50,000 monthly active users, and 5 GB egress. Free projects may pause after one week of inactivity and the free tier does not include automatic database backups. [Supabase pricing](https://supabase.com/pricing) · [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)

Private backup snapshots use the project's 1 GB Storage allowance. As manuscripts and snapshots grow, storage will need monitoring and old backups may need to be exported and removed. This is a free-tier design, not a guarantee of unlimited storage or availability.

## Validation

The PR validation workflow first generates the existing shareable story pages, then runs the existing site checks and new Worker API security tests. It does not apply the database migration, create a Supabase project, configure secrets, or deploy a Worker. Those steps require the intended Clickers project and owner account to be selected first.
