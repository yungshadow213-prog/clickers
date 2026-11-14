import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.mjs";

const originalFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  OWNER_USER_ID: "11111111-1111-4111-8111-111111111111",
  ALLOWED_ORIGIN: "https://yungshadow213-prog.github.io"
};
afterEach(() => { globalThis.fetch = originalFetch; });

test("health check does not require credentials", async () => {
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/health"), {});
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, service: "clickers-private-api", authorApiReady: false, paymentReady: false, missingConfiguration: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "OWNER_USER_ID"] });
});

test("health check reports missing configuration names without exposing values", async () => {
  const configured = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable", SUPABASE_SECRET_KEY: "do-not-return-this", OWNER_USER_ID: "owner-id" };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/health"), configured);
  const data = await result.json();
  assert.equal(data.authorApiReady, true);
  assert.equal(data.paymentReady, false);
  assert.deepEqual(data.missingConfiguration, []);
  assert.equal(JSON.stringify(data).includes("do-not-return-this"), false);
});

test("rejects browser requests from an unapproved origin", async () => {
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/books", {
    headers: { origin: "https://not-clickers.example" }
  }), env);
  assert.equal(result.status, 403);
});

test("author routes require a bearer token", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("unexpected fetch"); };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/books", {
    headers: { origin: env.ALLOWED_ORIGIN }
  }), env);
  assert.equal(result.status, 401);
  assert.equal(fetchCalled, false);
});

test("invalid Supabase sessions cannot access the author API", async () => {
  globalThis.fetch = async url => {
    assert.equal(String(url), env.SUPABASE_URL + "/auth/v1/user");
    return new Response(JSON.stringify({ message: "invalid token" }), { status: 401 });
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/books", {
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer invalid-token" }
  }), env);
  assert.equal(result.status, 401);
});

test("a valid but non-owner Supabase account is forbidden", async () => {
  globalThis.fetch = async url => {
    assert.equal(String(url), env.SUPABASE_URL + "/auth/v1/user");
    return new Response(JSON.stringify({ id: "33333333-3333-4333-8333-333333333333" }), { status: 200 });
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/books", {
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer valid-but-not-owner" }
  }), env);
  assert.equal(result.status, 403);
});

test("public chapter endpoint only requests published, non-paid chapters", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    if (parsed.pathname.endsWith("/clickers_books")) {
      return new Response(JSON.stringify([{ id: "22222222-2222-4222-8222-222222222222" }]), { status: 200 });
    }
    if (parsed.pathname.endsWith("/clickers_chapters")) {
      return new Response(JSON.stringify([{ id: "chapter-free", status: "published", is_paid: false }]), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request(
    "https://api.example.workers.dev/api/books/22222222-2222-4222-8222-222222222222/chapters",
    { headers: { origin: env.ALLOWED_ORIGIN } }
  ), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), [{ id: "chapter-free", status: "published", is_paid: false }]);
  const chapterCall = calls.find(call => call.url.pathname.endsWith("/clickers_chapters"));
  assert.match(chapterCall.url.search, /status=eq\.published/);
  assert.match(chapterCall.url.search, /is_paid=eq\.false/);
  assert.equal(chapterCall.init.headers.apikey, env.SUPABASE_SECRET_KEY);
  assert.equal(chapterCall.init.headers.authorization, undefined, "New Supabase secret keys must not be sent as Bearer JWTs");
});

test("unpublished books are not discoverable from the public API", async () => {
  let requested = "";
  globalThis.fetch = async url => {
    requested = String(url);
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/books", {
    headers: { origin: env.ALLOWED_ORIGIN }
  }), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), []);
  assert.match(requested, /status=eq\.published/);
});

test("private backup storage uses the secret key only as an apikey", async () => {
  let storageHeaders;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    }
    if (parsed.pathname === "/storage/v1/object/list/clickers-private") {
      storageHeaders = init.headers;
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/backups", {
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer valid-owner-session" }
  }), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), []);
  assert.equal(storageHeaders.apikey, env.SUPABASE_SECRET_KEY);
  assert.equal(storageHeaders.authorization, undefined, "Storage must not receive a secret key as a Bearer token");
});

test("backup upload and restore never send a secret key as a Bearer token", async () => {
  const storageCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_books" ||
        parsed.pathname === "/rest/v1/clickers_chapters" ||
        parsed.pathname === "/rest/v1/clickers_chapter_revisions") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (parsed.pathname.startsWith("/storage/v1/object/clickers-private/")) {
      storageCalls.push({ method: init.method || "GET", headers: init.headers });
      if ((init.method || "GET") === "POST") return new Response(JSON.stringify({ Key: "backup" }), { status: 200 });
      return new Response(JSON.stringify({
        format: "clickers-author-backup-v1", owner_id: env.OWNER_USER_ID, books: [], chapters: [], revisions: []
      }), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const headers = { origin: env.ALLOWED_ORIGIN, authorization: "Bearer valid-owner-session", "content-type": "application/json" };
  const created = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/backups", {
    method: "POST", headers, body: "{}"
  }), env);
  assert.equal(created.status, 201);
  const createdData = await created.json();
  const restored = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/backups/restore", {
    method: "POST", headers, body: JSON.stringify({ path: createdData.path })
  }), env);
  assert.equal(restored.status, 201);
  assert.equal(storageCalls.length, 2);
  for (const call of storageCalls) {
    assert.equal(call.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(call.headers.authorization, undefined);
  }
});

test("book cannot be published through the API before it has a published free chapter", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapters") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request(
    "https://api.example.workers.dev/api/admin/books/22222222-2222-4222-8222-222222222222",
    {
      method: "PATCH",
      headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session", "content-type": "application/json" },
      body: JSON.stringify({ status: "published" })
    }
  ), env);
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /at least one free chapter/i);
  assert.equal(calls.some(call => call.url.pathname === "/rest/v1/clickers_books" && call.init.method === "PATCH"), false);
});

test("book creation cannot bypass the draft-first publishing flow", async () => {
  let bookInsertCalled = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_books" && init.method === "POST") {
      bookInsertCalled = true;
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/books", {
    method: "POST",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session", "content-type": "application/json" },
    body: JSON.stringify({ title: "Bypass", status: "published" })
  }), env);
  assert.equal(result.status, 400);
  assert.equal(bookInsertCalled, false);
});

test("backup recovery restores saved revisions against recovered chapter IDs", async () => {
  const oldBookId = "22222222-2222-4222-8222-222222222222";
  const oldChapterId = "33333333-3333-4333-8333-333333333333";
  const newBookId = "44444444-4444-4444-8444-444444444444";
  const newChapterId = "55555555-5555-4555-8555-555555555555";
  let revisionInsert;
  const backup = {
    format: "clickers-author-backup-v1",
    owner_id: env.OWNER_USER_ID,
    books: [{ id: oldBookId, slug: "test", title: "Test", description: "", genre: "Romance", cover_path: "", status: "published" }],
    chapters: [{ id: oldChapterId, book_id: oldBookId, chapter_number: 1, title: "Chapter one", body: "Saved text", status: "published", is_paid: false }],
    revisions: [{
      chapter_id: oldChapterId,
      snapshot: { id: oldChapterId, owner_id: env.OWNER_USER_ID, book_id: oldBookId, chapter_number: 1, title: "Earlier title", body: "Earlier text", status: "draft", is_paid: false }
    }]
  };
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    }
    if (parsed.pathname.startsWith("/storage/v1/object/clickers-private/") && (init.method || "GET") === "GET") {
      return new Response(JSON.stringify(backup), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_books" && init.method === "POST") {
      return new Response(JSON.stringify([{ id: newBookId }]), { status: 201 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapters" && init.method === "POST") {
      return new Response(JSON.stringify([{ id: newChapterId }]), { status: 201 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapter_revisions" && init.method === "POST") {
      revisionInsert = JSON.parse(init.body);
      return new Response(null, { status: 201 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/backups/restore", {
    method: "POST",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session", "content-type": "application/json" },
    body: JSON.stringify({ path: env.OWNER_USER_ID + "/backups/test.json" })
  }), env);
  assert.equal(result.status, 201);
  const data = await result.json();
  assert.equal(data.revisions, 1);
  assert.equal(revisionInsert.chapter_id, newChapterId);
  assert.equal(revisionInsert.snapshot.id, newChapterId);
  assert.equal(revisionInsert.snapshot.book_id, newBookId);
  assert.equal(revisionInsert.snapshot.body, "Earlier text");
});

test("backup recovery can recover a deleted chapter from its orphaned revisions", async () => {
  const oldBookId = "22222222-2222-4222-8222-222222222222";
  const oldChapterId = "33333333-3333-4333-8333-333333333333";
  const newBookId = "44444444-4444-4444-8444-444444444444";
  const newChapterId = "55555555-5555-4555-8555-555555555555";
  const insertedChapters = [];
  const insertedRevisions = [];
  const backup = {
    format: "clickers-author-backup-v1",
    owner_id: env.OWNER_USER_ID,
    books: [{ id: oldBookId, slug: "test", title: "Test", description: "", genre: "Romance", cover_path: "", status: "published" }],
    chapters: [],
    revisions: [
      { chapter_id: null, created_at: "2026-10-20T00:00:00Z", snapshot: { id: oldChapterId, owner_id: env.OWNER_USER_ID, book_id: oldBookId, chapter_number: 2, title: "Deleted chapter", body: "Recovered text", status: "published", is_paid: false } }
    ]
  };
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    if (parsed.pathname.startsWith("/storage/v1/object/clickers-private/") && (init.method || "GET") === "GET") return new Response(JSON.stringify(backup), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_books" && init.method === "POST") return new Response(JSON.stringify([{ id: newBookId }]), { status: 201 });
    if (parsed.pathname === "/rest/v1/clickers_chapters" && init.method === "POST") {
      insertedChapters.push(JSON.parse(init.body));
      return new Response(JSON.stringify([{ id: newChapterId }]), { status: 201 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapter_revisions" && init.method === "POST") {
      insertedRevisions.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/backups/restore", {
    method: "POST",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session", "content-type": "application/json" },
    body: JSON.stringify({ path: env.OWNER_USER_ID + "/backups/deleted.json" })
  }), env);
  assert.equal(result.status, 201);
  const data = await result.json();
  assert.equal(data.chapters, 1);
  assert.equal(data.revisions, 1);
  assert.equal(insertedChapters[0].title, "Deleted chapter");
  assert.equal(insertedChapters[0].body, "Recovered text");
  assert.equal(insertedChapters[0].status, "draft");
  assert.equal(insertedRevisions[0].chapter_id, newChapterId);
  assert.equal(insertedRevisions[0].snapshot.id, newChapterId);
});

test("cannot turn the last free chapter of a published book into a paid chapter", async () => {
  const chapterId = "33333333-3333-4333-8333-333333333333";
  const bookId = "22222222-2222-4222-8222-222222222222";
  let chapterMutation = false;
  let revisionMutation = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_chapters" && parsed.searchParams.get("id") === "eq." + chapterId && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify([{ id: chapterId, book_id: bookId, status: "published", is_paid: false, chapter_number: 1, title: "Only free chapter", body: "Text" }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_books") return new Response(JSON.stringify([{ status: "published" }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_chapters" && parsed.searchParams.get("id") === "neq." + chapterId) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapter_revisions" && init.method === "POST") revisionMutation = true;
    if (parsed.pathname === "/rest/v1/clickers_chapters" && init.method === "PATCH") chapterMutation = true;
    throw new Error("Unexpected URL " + parsed + " method=" + init.method);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/chapters/" + chapterId, {
    method: "PATCH",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session", "content-type": "application/json" },
    body: JSON.stringify({ is_paid: true })
  }), env);
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /last published free chapter/i);
  assert.equal(chapterMutation, false);
  assert.equal(revisionMutation, false);
});

test("cannot delete the last free chapter of a published book", async () => {
  const chapterId = "33333333-3333-4333-8333-333333333333";
  const bookId = "22222222-2222-4222-8222-222222222222";
  let chapterDeleted = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_chapters" && parsed.searchParams.get("id") === "eq." + chapterId && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify([{ id: chapterId, book_id: bookId, status: "published", is_paid: false }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_books") return new Response(JSON.stringify([{ status: "published" }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_chapters" && parsed.searchParams.get("id") === "neq." + chapterId) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_chapters" && init.method === "DELETE") chapterDeleted = true;
    throw new Error("Unexpected URL " + parsed + " method=" + init.method);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/chapters/" + chapterId, {
    method: "DELETE",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session" }
  }), env);
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /last published free chapter/i);
  assert.equal(chapterDeleted, false);
});


test("checkout initialization uses the saved NGN price and never trusts a client-supplied amount", async () => {
  const paymentEnv = { ...env, PAYSTACK_SECRET_KEY: "sk_test_clickers" };
  const bookId = "22222222-2222-4222-8222-222222222222";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/rest/v1/clickers_books") {
      return new Response(JSON.stringify([{
        id: bookId, title: "A Clickers Story", price_minor: 250000,
        currency: "NGN", ebook_file_path: env.OWNER_USER_ID + "/books/" + bookId + "/book.pdf"
      }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_orders" && init.method === "POST") {
      const order = JSON.parse(init.body);
      assert.equal(order.amount_minor, 250000);
      assert.equal(order.currency, "NGN");
      assert.equal(order.buyer_email, "reader@example.com");
      assert.equal(order.status, "pending");
      return new Response(JSON.stringify([{ id: "order-id", reference: order.reference }]), { status: 201 });
    }
    if (parsed.hostname === "api.paystack.co" && parsed.pathname === "/transaction/initialize") {
      const body = JSON.parse(init.body);
      assert.equal(body.amount, "250000");
      assert.equal(body.currency, "NGN");
      assert.equal(body.email, "reader@example.com");
      assert.equal(body.callback_url, "https://yungshadow213-prog.github.io/clickers/checkout.html");
      assert.equal(init.headers.authorization, "Bearer sk_test_clickers");
      return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/example" } }), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/checkout/initialize", {
    method: "POST",
    headers: { origin: env.ALLOWED_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ book_id: bookId, email: "reader@example.com", amount: 1 })
  }), paymentEnv);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.authorization_url, "https://checkout.paystack.com/example");
  assert.match(data.reference, /^clk-[a-f0-9]{32}$/);
  assert.ok(calls.some(call => call.parsed.pathname === "/rest/v1/clickers_orders"));
});

test("ebook download is released only after Paystack confirms matching amount, currency, and buyer email", async () => {
  const paymentEnv = { ...env, PAYSTACK_SECRET_KEY: "sk_test_clickers" };
  const reference = "clk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const objectPath = env.OWNER_USER_ID + "/books/22222222-2222-4222-8222-222222222222/book.pdf";
  let signed = false, markedPaid = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/clickers_orders" && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify([{
        id: "order-id", reference, book_title: "A Clickers Story", amount_minor: 250000,
        currency: "NGN", buyer_email: "reader@example.com", status: "pending", ebook_file_path: objectPath
      }]), { status: 200 });
    }
    if (parsed.hostname === "api.paystack.co" && parsed.pathname === "/transaction/verify/" + reference) {
      return new Response(JSON.stringify({ status: true, data: {
        reference, status: "success", amount: 250000, currency: "NGN",
        customer: { email: "reader@example.com" }, id: 12345, channel: "card", paid_at: "2026-11-14T00:00:00Z"
      } }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_orders" && init.method === "PATCH") {
      markedPaid = true;
      return new Response(null, { status: 204 });
    }
    if (parsed.pathname.startsWith("/storage/v1/object/sign/clickers-private/")) {
      signed = true;
      assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
      return new Response(JSON.stringify({ signedURL: "/object/sign/clickers-private/book.pdf?token=temporary" }), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/checkout/verify?reference=" + reference, {
    headers: { origin: env.ALLOWED_ORIGIN }
  }), paymentEnv);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.ok, true);
  assert.equal(data.status, "paid");
  assert.equal(data.expires_in, 600);
  assert.match(data.download_url, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign/);
  assert.equal(markedPaid, true);
  assert.equal(signed, true);
});

test("a mismatched Paystack amount never releases the private ebook", async () => {
  const paymentEnv = { ...env, PAYSTACK_SECRET_KEY: "sk_test_clickers" };
  const reference = "clk-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  let signed = false, markedPaid = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/clickers_orders" && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify([{
        id: "order-id", reference, book_title: "A Clickers Story", amount_minor: 250000,
        currency: "NGN", buyer_email: "reader@example.com", status: "pending",
        ebook_file_path: env.OWNER_USER_ID + "/books/22222222-2222-4222-8222-222222222222/book.pdf"
      }]), { status: 200 });
    }
    if (parsed.hostname === "api.paystack.co") {
      return new Response(JSON.stringify({ status: true, data: {
        reference, status: "success", amount: 100, currency: "NGN", customer: { email: "reader@example.com" }
      } }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/clickers_orders" && init.method === "PATCH") markedPaid = true;
    if (parsed.pathname.includes("/storage/v1/object/sign/")) signed = true;
    throw new Error("Unexpected URL " + parsed);
  };
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/checkout/verify?reference=" + reference), paymentEnv);
  assert.equal(result.status, 402);
  assert.equal(signed, false);
  assert.equal(markedPaid, false);
});

test("author ebook uploads are stored in the private bucket under the owner's book folder", async () => {
  const bookId = "22222222-2222-4222-8222-222222222222";
  let uploadUrl = "";
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: env.OWNER_USER_ID }), { status: 200 });
    if (parsed.pathname === "/rest/v1/clickers_books") return new Response(JSON.stringify([{ id: bookId }]), { status: 200 });
    if (parsed.pathname.startsWith("/storage/v1/object/clickers-private/")) {
      uploadUrl = parsed.pathname;
      assert.equal(init.headers["content-type"], "application/pdf");
      assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
      return new Response(JSON.stringify({ Key: "private-ebook" }), { status: 200 });
    }
    throw new Error("Unexpected URL " + parsed);
  };
  const form = new FormData();
  form.append("book_id", bookId);
  form.append("file", new Blob(["%PDF-1.7 test"], { type: "application/pdf" }), "book.pdf");
  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/admin/ebooks", {
    method: "POST",
    headers: { origin: env.ALLOWED_ORIGIN, authorization: "Bearer owner-session" },
    body: form
  }), env);
  assert.equal(result.status, 201);
  const data = await result.json();
  assert.match(data.path, new RegExp("^" + env.OWNER_USER_ID + "/books/" + bookId + "/"));
  assert.match(uploadUrl, /\/storage\/v1\/object\/clickers-private\//);
  assert.equal(uploadUrl.includes("public"), false);
});
