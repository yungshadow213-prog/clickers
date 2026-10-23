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
  assert.deepEqual(await result.json(), { ok: true, service: "clickers-private-api" });
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
