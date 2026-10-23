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
  assert.deepEqual(await result.json(), { ok: true, service: "clickers-private-api", authorApiReady: false, missingConfiguration: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "OWNER_USER_ID"] });
});

test("health check reports missing configuration names without exposing values", async () => {\n  const configured = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable", SUPABASE_SECRET_KEY: "do-not-return-this", OWNER_USER_ID: "owner-id" };\n  const result = await worker.fetch(new Request("https://api.example.workers.dev/api/health"), configured);\n  const data = await result.json();\n  assert.equal(data.authorApiReady, true);\n  assert.deepEqual(data.missingConfiguration, []);\n  assert.equal(JSON.stringify(data).includes("do-not-return-this"), false);\n});\n\ntest("rejects browser requests from an unapproved origin", async () => {
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
