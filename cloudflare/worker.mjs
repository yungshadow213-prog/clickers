const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function response(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...cors } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGIN || "";
  const headers = { "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type", "vary": "Origin" };
  if (origin && allowed && origin === allowed) headers["access-control-allow-origin"] = origin;
  return headers;
}

function cleanText(value, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value) {
  return cleanText(value, 120).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function configReady(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY && env.OWNER_USER_ID);
}

async function currentUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { error: response({ error: "Sign in to continue." }, 401) };
  if (!configReady(env)) return { error: response({ error: "The author API is not configured yet." }, 503) };

  let authResponse;
  try {
    authResponse = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
    });
  } catch {
    return { error: response({ error: "Authentication service is temporarily unavailable." }, 502) };
  }
  if (!authResponse.ok) return { error: response({ error: "Your session is invalid or expired. Sign in again." }, 401) };
  const user = await authResponse.json();
  if (!user?.id || user.id !== env.OWNER_USER_ID) return { error: response({ error: "This account is not allowed to access the author dashboard." }, 403) };
  return { user };
}

async function db(env, table, { method = "GET", query = "", body, prefer } = {}) {
  const url = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + table + (query ? "?" + query : "");
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    accept: "application/json"
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;
  const result = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await result.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!result.ok) {
    const error = new Error(data?.message || data?.hint || "Database request failed.");
    error.status = result.status;
    throw error;
  }
  return data;
}

function ownerFilter(ownerId) {
  return "owner_id=eq." + encodeURIComponent(ownerId);
}

async function preventRemovingLastFreeChapter(env, ownerId, chapter, nextStatus, nextIsPaid) {
  const remainsFree = nextStatus === "published" && nextIsPaid !== true;
  if (chapter.status !== "published" || chapter.is_paid === true || remainsFree) return null;

  const books = await db(env, "clickers_books", {
    query: ownerFilter(ownerId) + "&id=eq." + chapter.book_id + "&select=status&limit=1"
  });
  if (!books?.length || books[0].status !== "published") return null;

  const alternatives = await db(env, "clickers_chapters", {
    query: ownerFilter(ownerId) + "&book_id=eq." + chapter.book_id +
      "&id=neq." + chapter.id + "&status=eq.published&is_paid=eq.false&select=id&limit=1"
  });
  if (alternatives?.length) return null;
  return response({
    error: "This is the book's last published free chapter. Publish another free chapter or return the book to draft before changing or deleting this one."
  }, 400);
}

function validateBook(body, partial = false) {
  const out = {};
  if (!partial || "title" in body) {
    out.title = cleanText(body.title, 180);
    if (!out.title) return { error: "A book title is required." };
  }
  if (!partial || "description" in body) out.description = cleanText(body.description, 5000);
  if (!partial || "genre" in body) out.genre = cleanText(body.genre, 80);
  if (!partial || "cover_path" in body) out.cover_path = cleanText(body.cover_path, 1000);
  if ("extra_images" in body || !partial) {
    const images = Array.isArray(body.extra_images) ? body.extra_images.slice(0, 8) : [];
    out.extra_images = images.filter(item => item && typeof item.url === "string" && item.url.startsWith("https://"))
      .map(item => ({ name: cleanText(item.name, 180) || "Story image", url: item.url.slice(0, 2000) }));
  }
  if (!partial || "slug" in body) {
    out.slug = slugify(body.slug || body.title);
    if (!out.slug) return { error: "A valid book slug is required." };
  }
  if ("status" in body || !partial) {
    out.status = body.status === "published" ? "published" : "draft";
  }
  return { value: out };
}

function validateChapter(body, partial = false) {
  const out = {};
  if (!partial || "title" in body) {
    out.title = cleanText(body.title, 180);
    if (!out.title) return { error: "A chapter title is required." };
  }
  if (!partial || "body" in body) {
    out.body = typeof body.body === "string" ? body.body.slice(0, 500000) : "";
    if (!out.body.trim()) return { error: "Chapter text cannot be empty." };
  }
  if (!partial || "chapter_number" in body) {
    const number = Number(body.chapter_number);
    if (!Number.isInteger(number) || number < 1 || number > 10000) return { error: "Chapter number must be a whole number above zero." };
    out.chapter_number = number;
  }
  if ("status" in body || !partial) out.status = body.status === "published" ? "published" : "draft";
  if ("is_paid" in body || !partial) out.is_paid = body.is_paid === true;
  return { value: out };
}

async function adminRoute(request, env, url, user) {
  const ownerId = user.id;
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (path === "/api/admin/images" && method === "POST") {
    let form;
    try { form = await request.formData(); } catch { return response({ error: "Send an image file." }, 400); }
    const file = form.get("file");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (!file || typeof file.arrayBuffer !== "function") return response({ error: "Choose an image file." }, 400);
    if (!allowed.has(file.type)) return response({ error: "Choose a JPG, PNG, WebP or AVIF image." }, 400);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return response({ error: "Images must be between 1 byte and 5 MB." }, 400);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[file.type];
    const objectPath = ownerId + "/" + crypto.randomUUID() + "." + ext;
    const base = env.SUPABASE_URL.replace(/\/+$/, "");
    const upload = await fetch(base + "/storage/v1/object/clickers-book-images/" + objectPath.split("/").map(encodeURIComponent).join("/"), {
      method: "POST",
      headers: { apikey: env.SUPABASE_SECRET_KEY, authorization: "Bearer " + env.SUPABASE_SECRET_KEY, "content-type": file.type, "x-upsert": "false" },
      body: await file.arrayBuffer()
    });
    if (!upload.ok) {
      const details = await upload.text();
      return response({ error: "Image storage rejected the upload: " + details.slice(0, 240) }, 502);
    }
    return response({ url: base + "/storage/v1/object/public/clickers-book-images/" + objectPath, name: cleanText(file.name, 180) }, 201);
  }

  if (path === "/api/admin/books" && method === "GET") {
    return response(await db(env, "clickers_books", {
      query: ownerFilter(ownerId) + "&select=id,slug,title,description,genre,cover_path,extra_images,status,created_at,updated_at&order=updated_at.desc"
    }));
  }

  if (path === "/api/admin/books" && method === "POST") {
    const body = await readJson(request);
    if (!body) return response({ error: "Send valid JSON." }, 400);
    const parsed = validateBook(body);
    if (parsed.error) return response({ error: parsed.error }, 400);
    if (parsed.value.status === "published") {
      return response({ error: "Save the book as a draft, publish at least one free chapter, then publish the book." }, 400);
    }
    const rows = await db(env, "clickers_books", {
      method: "POST", query: "select=id,slug,title,description,genre,cover_path,extra_images,status,created_at,updated_at",
      body: { ...parsed.value, owner_id: ownerId }, prefer: "return=representation"
    });
    return response(rows?.[0] || null, 201);
  }

  const bookMatch = path.match(/^\/api\/admin\/books\/([0-9a-f-]{36})$/i);
  if (bookMatch && method === "PATCH") {
    const body = await readJson(request);
    if (!body) return response({ error: "Send valid JSON." }, 400);
    const parsed = validateBook(body, true);
    if (parsed.error) return response({ error: parsed.error }, 400);
    if (!Object.keys(parsed.value).length) return response({ error: "There are no changes to save." }, 400);
    if (parsed.value.status === "published") {
      const freeChapters = await db(env, "clickers_chapters", {
        query: ownerFilter(ownerId) + "&book_id=eq." + bookMatch[1] + "&status=eq.published&is_paid=eq.false&select=id&limit=1"
      });
      if (!freeChapters?.length) {
        return response({ error: "Publish at least one free chapter before publishing this book. Paid-chapter delivery is not available yet." }, 400);
      }
    }
    const rows = await db(env, "clickers_books", {
      method: "PATCH", query: ownerFilter(ownerId) + "&id=eq." + bookMatch[1] + "&select=id,slug,title,description,genre,cover_path,extra_images,status,created_at,updated_at",
      body: parsed.value, prefer: "return=representation"
    });
    if (!rows?.length) return response({ error: "Book not found." }, 404);
    return response(rows[0]);
  }
  if (bookMatch && method === "DELETE") {
    const rows = await db(env, "clickers_books", {
      method: "DELETE", query: ownerFilter(ownerId) + "&id=eq." + bookMatch[1] + "&select=id", prefer: "return=representation"
    });
    if (!rows?.length) return response({ error: "Book not found." }, 404);
    return response({ ok: true });
  }

  const bookChapters = path.match(/^\/api\/admin\/books\/([0-9a-f-]{36})\/chapters$/i);
  if (bookChapters && method === "GET") {
    const books = await db(env, "clickers_books", {
      query: ownerFilter(ownerId) + "&id=eq." + bookChapters[1] + "&select=id"
    });
    if (!books?.length) return response({ error: "Book not found." }, 404);
    return response(await db(env, "clickers_chapters", {
      query: ownerFilter(ownerId) + "&book_id=eq." + bookChapters[1] + "&select=id,book_id,chapter_number,title,body,status,is_paid,created_at,updated_at&order=chapter_number.asc"
    }));
  }
  if (bookChapters && method === "POST") {
    const body = await readJson(request);
    if (!body) return response({ error: "Send valid JSON." }, 400);
    const parsed = validateChapter(body);
    if (parsed.error) return response({ error: parsed.error }, 400);
    const books = await db(env, "clickers_books", {
      query: ownerFilter(ownerId) + "&id=eq." + bookChapters[1] + "&select=id"
    });
    if (!books?.length) return response({ error: "Book not found." }, 404);
    const rows = await db(env, "clickers_chapters", {
      method: "POST", query: "select=id,book_id,chapter_number,title,body,status,is_paid,created_at,updated_at",
      body: { ...parsed.value, owner_id: ownerId, book_id: bookChapters[1] }, prefer: "return=representation"
    });
    return response(rows?.[0] || null, 201);
  }

  const chapterMatch = path.match(/^\/api\/admin\/chapters\/([0-9a-f-]{36})$/i);
  if (chapterMatch && method === "PATCH") {
    const body = await readJson(request);
    if (!body) return response({ error: "Send valid JSON." }, 400);
    const parsed = validateChapter(body, true);
    if (parsed.error) return response({ error: parsed.error }, 400);
    if (!Object.keys(parsed.value).length) return response({ error: "There are no changes to save." }, 400);
    const existing = await db(env, "clickers_chapters", {
      query: ownerFilter(ownerId) + "&id=eq." + chapterMatch[1] + "&select=id,owner_id,book_id,chapter_number,title,body,status,is_paid"
    });
    if (!existing?.length) return response({ error: "Chapter not found." }, 404);
    const current = existing[0];
    const blocked = await preventRemovingLastFreeChapter(
      env,
      ownerId,
      current,
      parsed.value.status ?? current.status,
      parsed.value.is_paid ?? current.is_paid
    );
    if (blocked) return blocked;
    await db(env, "clickers_chapter_revisions", {
      method: "POST", query: "select=id",
      body: { owner_id: ownerId, chapter_id: current.id, snapshot: current },
      prefer: "return=minimal"
    });
    const rows = await db(env, "clickers_chapters", {
      method: "PATCH", query: ownerFilter(ownerId) + "&id=eq." + chapterMatch[1] + "&select=id,book_id,chapter_number,title,body,status,is_paid,created_at,updated_at",
      body: parsed.value, prefer: "return=representation"
    });
    return response(rows?.[0] || null);
  }
  if (chapterMatch && method === "DELETE") {
    const existing = await db(env, "clickers_chapters", {
      query: ownerFilter(ownerId) + "&id=eq." + chapterMatch[1] + "&select=id,book_id,status,is_paid&limit=1"
    });
    if (!existing?.length) return response({ error: "Chapter not found." }, 404);
    const current = existing[0];
    const blocked = await preventRemovingLastFreeChapter(env, ownerId, current, "draft", true);
    if (blocked) return blocked;
    const rows = await db(env, "clickers_chapters", {
      method: "DELETE", query: ownerFilter(ownerId) + "&id=eq." + chapterMatch[1] + "&select=id", prefer: "return=representation"
    });
    if (!rows?.length) return response({ error: "Chapter not found." }, 404);
    return response({ ok: true });
  }

  const revisionsMatch = path.match(/^\/api\/admin\/chapters\/([0-9a-f-]{36})\/revisions$/i);
  if (revisionsMatch && method === "GET") {
    const chapter = await db(env, "clickers_chapters", {
      query: ownerFilter(ownerId) + "&id=eq." + revisionsMatch[1] + "&select=id"
    });
    if (!chapter?.length) return response({ error: "Chapter not found." }, 404);
    return response(await db(env, "clickers_chapter_revisions", {
      query: ownerFilter(ownerId) + "&chapter_id=eq." + revisionsMatch[1] + "&select=id,created_at,snapshot&order=created_at.desc&limit=30"
    }));
  }
  if (path === "/api/admin/backups" && method === "GET") {
    const prefix = ownerId + "/backups";
    const listResponse = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1/object/list/clickers-private", {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({ prefix, limit: 50, offset: 0, sortBy: { column: "created_at", order: "desc" } })
    });
    if (!listResponse.ok) throw new Error("Could not list private backups.");
    const objects = await listResponse.json();
    return response((Array.isArray(objects) ? objects : [])
      .filter(item => item.name && item.name.endsWith(".json"))
      .map(item => ({
        name: item.name,
        path: prefix + "/" + item.name,
        created_at: item.created_at || item.updated_at || null,
        metadata: item.metadata || null
      })));
  }

  if (path === "/api/admin/backups" && method === "POST") {
    const books = await db(env, "clickers_books", {
      query: ownerFilter(ownerId) + "&select=id,owner_id,slug,title,description,genre,cover_path,status,created_at,updated_at&order=created_at.asc"
    });
    const chapters = await db(env, "clickers_chapters", {
      query: ownerFilter(ownerId) + "&select=id,owner_id,book_id,chapter_number,title,body,status,is_paid,created_at,updated_at&order=book_id.asc,chapter_number.asc"
    });
    const revisions = await db(env, "clickers_chapter_revisions", {
      query: ownerFilter(ownerId) + "&select=id,owner_id,chapter_id,snapshot,created_at&order=created_at.asc"
    });
    const backup = {
      format: "clickers-author-backup-v1",
      created_at: new Date().toISOString(),
      owner_id: ownerId,
      books,
      chapters,
      revisions
    };
    const filename = "clickers-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    const objectPath = ownerId + "/backups/" + filename;
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const upload = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1/object/clickers-private/" + encodedPath, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "content-type": "application/json",
        "x-upsert": "false"
      },
      body: JSON.stringify(backup)
    });
    if (!upload.ok) {
      const detail = await upload.text();
      throw new Error("Private backup upload failed: " + detail.slice(0, 180));
    }
    return response({ ok: true, name: filename, path: objectPath, created_at: backup.created_at, books: books.length, chapters: chapters.length }, 201);
  }

  if (path === "/api/admin/backups/restore" && method === "POST") {
    const requestBody = await readJson(request);
    const objectPath = typeof requestBody?.path === "string" ? requestBody.path : "";
    if (!objectPath.startsWith(ownerId + "/backups/") || !objectPath.endsWith(".json") || objectPath.includes("..")) {
      return response({ error: "Choose a valid backup belonging to your account." }, 400);
    }
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const download = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1/object/clickers-private/" + encodedPath, {
      headers: { apikey: env.SUPABASE_SECRET_KEY }
    });
    if (!download.ok) return response({ error: "That backup could not be found." }, 404);
    const backup = await download.json();
    if (backup?.format !== "clickers-author-backup-v1" || backup.owner_id !== ownerId ||
        !Array.isArray(backup.books) || !Array.isArray(backup.chapters)) {
      return response({ error: "The backup file is invalid or belongs to another account." }, 400);
    }
    const bookIdMap = new Map();
    const restoredBooks = [];
    for (const original of backup.books) {
      const rows = await db(env, "clickers_books", {
        method: "POST", query: "select=id,slug,title,status",
        body: {
          owner_id: ownerId,
          slug: slugify((original.slug || original.title || "restored") + "-restored-" + crypto.randomUUID().slice(0, 8)),
          title: cleanText("Recovered copy — " + (original.title || "Untitled book"), 180),
          description: cleanText(original.description, 5000),
          genre: cleanText(original.genre, 80),
          cover_path: cleanText(original.cover_path, 500),
          status: "draft"
        },
        prefer: "return=representation"
      });
      if (rows?.[0]) {
        bookIdMap.set(original.id, rows[0].id);
        restoredBooks.push(rows[0]);
      }
    }
    const chapterIdMap = new Map();
    let restoredChapters = 0;
    for (const original of backup.chapters) {
      const newBookId = bookIdMap.get(original.book_id);
      if (!newBookId) continue;
      const rows = await db(env, "clickers_chapters", {
        method: "POST", query: "select=id",
        body: {
          owner_id: ownerId,
          book_id: newBookId,
          chapter_number: original.chapter_number,
          title: cleanText(original.title || "Untitled chapter", 180),
          body: typeof original.body === "string" ? original.body.slice(0, 500000) : "",
          status: "draft",
          is_paid: original.is_paid === true
        },
        prefer: "return=representation"
      });
      if (rows?.[0]?.id) {
        chapterIdMap.set(original.id, { id: rows[0].id, book_id: newBookId });
        restoredChapters++;
      }
    }
    const revisions = Array.isArray(backup.revisions) ? backup.revisions : [];
    const usedNumbers = new Map();
    for (const original of backup.chapters) {
      if (!usedNumbers.has(original.book_id)) usedNumbers.set(original.book_id, new Set());
      usedNumbers.get(original.book_id).add(Number(original.chapter_number));
    }
    const orphanSnapshots = new Map();
    for (const revision of revisions) {
      const snapshot = revision?.snapshot;
      if (!snapshot || typeof snapshot !== "object" || !snapshot.id ||
          chapterIdMap.has(revision.chapter_id || snapshot.id) ||
          !bookIdMap.has(snapshot.book_id) || typeof snapshot.body !== "string" || !snapshot.body.trim()) continue;
      orphanSnapshots.set(snapshot.id, { revision, snapshot });
    }
    for (const [oldChapterId, item] of orphanSnapshots) {
      const oldBookId = item.snapshot.book_id;
      const newBookId = bookIdMap.get(oldBookId);
      const used = usedNumbers.get(oldBookId) || new Set();
      let chapterNumber = Number(item.snapshot.chapter_number);
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 10000 || used.has(chapterNumber)) {
        chapterNumber = 1;
        while (chapterNumber <= 10000 && used.has(chapterNumber)) chapterNumber++;
      }
      if (chapterNumber > 10000) continue;
      const rows = await db(env, "clickers_chapters", {
        method: "POST", query: "select=id",
        body: {
          owner_id: ownerId,
          book_id: newBookId,
          chapter_number: chapterNumber,
          title: cleanText(item.snapshot.title || "Recovered deleted chapter", 180) || "Recovered deleted chapter",
          body: item.snapshot.body.slice(0, 500000),
          status: "draft",
          is_paid: item.snapshot.is_paid === true
        },
        prefer: "return=representation"
      });
      if (rows?.[0]?.id) {
        chapterIdMap.set(oldChapterId, { id: rows[0].id, book_id: newBookId });
        used.add(chapterNumber);
        usedNumbers.set(oldBookId, used);
        restoredChapters++;
      }
    }
    let restoredRevisions = 0;
    for (const original of revisions) {
      if (!original.snapshot || typeof original.snapshot !== "object") continue;
      const oldChapterId = original.chapter_id || original.snapshot.id;
      const restoredChapter = chapterIdMap.get(oldChapterId);
      if (!restoredChapter) continue;
      const snapshot = {
        ...original.snapshot,
        id: restoredChapter.id,
        owner_id: ownerId,
        book_id: restoredChapter.book_id
      };
      await db(env, "clickers_chapter_revisions", {
        method: "POST", query: "select=id",
        body: {
          owner_id: ownerId,
          chapter_id: restoredChapter.id,
          snapshot
        },
        prefer: "return=minimal"
      });
      restoredRevisions++;
    }
    return response({
      ok: true,
      mode: "restored-as-drafts",
      books: restoredBooks.length,
      chapters: restoredChapters,
      revisions: restoredRevisions,
      message: "Recovered copies were added as drafts. Saved revisions for recovered chapters were restored too. Your existing books were not overwritten."
    }, 201);
  }

  return response({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (url.pathname === "/" && request.method === "GET") {
      return Response.redirect("https://yungshadow213-prog.github.io/clickers/", 302);
    }
    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") && cors["access-control-allow-origin"] === undefined) {
        return response({ error: "Origin not allowed." }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.headers.get("Origin") && cors["access-control-allow-origin"] === undefined) {
      return response({ error: "Origin not allowed." }, 403, cors);
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return response({ ok: true, service: "clickers-private-api" }, 200, cors);
    }
    if (!url.pathname.startsWith("/api/")) return response({ error: "Not found." }, 404, cors);
    if (!configReady(env)) return response({ error: "The author API is not configured yet." }, 503, cors);

    try {
      if (url.pathname === "/api/books" && request.method === "GET") {
        const books = await db(env, "clickers_books", {
          query: "owner_id=eq." + encodeURIComponent(env.OWNER_USER_ID) + "&status=eq.published&select=id,slug,title,description,genre,cover_path,extra_images&order=updated_at.desc"
        });
        return response(books, 200, cors);
      }
      const publicChapterMatch = url.pathname.match(/^\/api\/books\/([0-9a-f-]{36})\/chapters$/i);
      if (publicChapterMatch && request.method === "GET") {
        const books = await db(env, "clickers_books", {
          query: "owner_id=eq." + encodeURIComponent(env.OWNER_USER_ID) + "&id=eq." + publicChapterMatch[1] + "&status=eq.published&select=id"
        });
        if (!books?.length) return response({ error: "Book not found." }, 404, cors);
        const chapters = await db(env, "clickers_chapters", {
          query: "owner_id=eq." + encodeURIComponent(env.OWNER_USER_ID) + "&book_id=eq." + publicChapterMatch[1] + "&status=eq.published&is_paid=eq.false&select=id,chapter_number,title,body&order=chapter_number.asc"
        });
        return response(chapters, 200, cors);
      }
      if (!url.pathname.startsWith("/api/admin/")) return response({ error: "Not found." }, 404, cors);
      const auth = await currentUser(request, env);
      if (auth.error) {
        const result = await auth.error.json();
        return response(result, auth.error.status, cors);
      }
      return await adminRoute(request, env, url, auth.user).then(async result => {
        const body = result.status === 204 ? null : await result.text();
        return new Response(body, { status: result.status, headers: { ...Object.fromEntries(result.headers), ...cors } });
      });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
      return response({ error: status === 500 ? "The request could not be completed. Check the server configuration and database migration." : error.message }, status, cors);
    }
  }
};
