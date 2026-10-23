import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const config = window.CLICKERS_CONFIG || {};
const $ = id => document.getElementById(id);
const loginSection = $("loginSection");
const studioSection = $("studioSection");
const state = { supabase: null, session: null, books: [], book: null, chapters: [], chapter: null, isNewBook: false, isNewChapter: false };

function status(id, message = "", kind = "") {
  const node = $(id);
  node.textContent = message;
  node.className = "status" + (kind ? " " + kind : "");
}
function escapeText(value) { return String(value ?? ""); }
function showLogin() {
  loginSection.classList.remove("hidden");
  studioSection.classList.add("hidden");
  $("signOutButton").classList.add("hidden");
  $("backupButton").classList.add("hidden");
  $("showBackupsButton").classList.add("hidden");
}
function showStudio() {
  loginSection.classList.add("hidden");
  studioSection.classList.remove("hidden");
  $("signOutButton").classList.remove("hidden");
  $("backupButton").classList.remove("hidden");
  $("showBackupsButton").classList.remove("hidden");
}
function requireConfig() {
  if (!config.supabaseUrl || config.supabaseUrl.includes("YOUR_PROJECT_REF") ||
      !config.supabasePublishableKey || config.supabasePublishableKey.includes("REPLACE_ME") ||
      !config.apiUrl || config.apiUrl.includes("YOUR-CLICKERS-WORKER")) {
    status("loginStatus", "Setup required: configure author-config.js and the Cloudflare Worker secrets before signing in.", "error");
    $("signInButton").disabled = true;
    return false;
  }
  return true;
}
function apiUrl(path) {
  return config.apiUrl.replace(/\/+$/, "") + path;
}
async function api(path, options = {}) {
  if (!state.session?.access_token) throw new Error("Your session has expired. Sign in again.");
  const headers = new Headers(options.headers || {});
  headers.set("authorization", "Bearer " + state.session.access_token);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(apiUrl(path), { ...options, headers, cache: "no-store" });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.error || "Request failed (" + response.status + ").");
  return data;
}
function resetBookEditor() {
  state.book = null; state.chapters = []; state.chapter = null; state.isNewBook = false; state.isNewChapter = false;
  $("noBookState").classList.remove("hidden");
  $("bookEditor").classList.add("hidden");
  $("bookList").querySelectorAll(".book-item").forEach(el => el.classList.remove("active"));
  renderBooks();
}
function renderBooks() {
  const host = $("bookList");
  host.replaceChildren();
  if (!state.books.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No books yet. Choose + New to start your first manuscript."; host.append(empty); return;
  }
  for (const book of state.books) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "book-item" + (state.book?.id === book.id ? " active" : "");
    const title = document.createElement("strong"); title.textContent = book.title;
    const meta = document.createElement("span"); meta.textContent = (book.status === "published" ? "Published" : "Draft") + " · " + (book.genre || "Uncategorised");
    button.append(title, meta);
    button.addEventListener("click", () => loadBook(book.id));
    host.append(button);
  }
}
async function loadBooks(preferredId = null) {
  state.books = await api("/api/admin/books");
  renderBooks();
  const nextId = preferredId || state.book?.id;
  if (nextId && state.books.some(book => book.id === nextId)) await loadBook(nextId);
  else if (state.books.length) await loadBook(state.books[0].id);
  else resetBookEditor();
}
async function loadBook(id) {
  try {
    status("globalStatus", "Loading book…");
    const book = state.books.find(item => item.id === id);
    if (!book) return;
    state.book = book; state.isNewBook = false; state.chapter = null; state.isNewChapter = false;
    $("noBookState").classList.add("hidden");
    $("bookEditor").classList.remove("hidden");
    $("bookTitle").value = book.title || "";
    $("bookSlug").value = book.slug || "";
    $("bookGenre").value = book.genre || "";
    $("bookCover").value = book.cover_path || "";
    $("bookDescription").value = book.description || "";
    $("bookEditorHeading").textContent = book.title;
    $("bookStatusPill").textContent = book.status === "published" ? "Published" : "Draft";
    $("publishBookButton").textContent = book.status === "published" ? "Unpublish book" : "Publish book";
    $("chapterEditor").classList.add("hidden");
    $("revisionsPanel").classList.add("hidden");
    renderBooks();
    state.chapters = await api("/api/admin/books/" + encodeURIComponent(id) + "/chapters");
    renderChapters();
    status("globalStatus", "");
  } catch (error) {
    status("globalStatus", error.message, "error");
  }
}
function renderChapters() {
  const host = $("chapterList");
  host.replaceChildren();
  if (!state.chapters.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No chapters in this book yet."; host.append(empty); return;
  }
  for (const chapter of state.chapters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-item" + (state.chapter?.id === chapter.id ? " active" : "");
    const label = document.createElement("span");
    label.textContent = "Chapter " + chapter.chapter_number + " · " + chapter.title;
    const badge = document.createElement("small");
    badge.className = "pill";
    badge.textContent = chapter.is_paid ? "Paid / locked" : chapter.status === "published" ? "Published" : "Draft";
    button.append(label, badge);
    button.addEventListener("click", () => openChapter(chapter.id));
    host.append(button);
  }
}
function openChapter(id) {
  state.chapter = state.chapters.find(item => item.id === id) || null;
  if (!state.chapter) return;
  state.isNewChapter = false;
  $("chapterEditor").classList.remove("hidden");
  $("chapterNumber").value = state.chapter.chapter_number;
  $("chapterTitle").value = state.chapter.title || "";
  $("chapterBody").value = state.chapter.body || "";
  $("chapterPaid").checked = state.chapter.is_paid === true;
  $("chapterPublished").checked = state.chapter.status === "published";
  $("chapterPublishButton").textContent = "Save & publish";
  $("revisionsPanel").classList.add("hidden");
  status("chapterStatus", "");
  renderChapters();
  $("chapterBody").focus({ preventScroll: true });
}
function newBook() {
  state.book = null; state.chapters = []; state.chapter = null; state.isNewBook = true; state.isNewChapter = false;
  $("noBookState").classList.add("hidden");
  $("bookEditor").classList.remove("hidden");
  $("bookTitle").value = ""; $("bookSlug").value = ""; $("bookGenre").value = ""; $("bookCover").value = ""; $("bookDescription").value = "";
  $("bookEditorHeading").textContent = "New book"; $("bookStatusPill").textContent = "Not saved";
  $("publishBookButton").textContent = "Publish book";
  $("chapterList").replaceChildren();
  $("chapterEditor").classList.add("hidden");
  status("bookStatus", "Save the book details before adding chapters.");
  renderBooks();
  $("bookTitle").focus();
}
function newChapter() {
  if (!state.book?.id) { status("chapterStatus", "Save this book first, then add chapters.", "error"); return; }
  state.chapter = null; state.isNewChapter = true;
  $("chapterEditor").classList.remove("hidden");
  $("chapterNumber").value = Math.max(0, ...state.chapters.map(ch => ch.chapter_number)) + 1;
  $("chapterTitle").value = ""; $("chapterBody").value = ""; $("chapterPaid").checked = false; $("chapterPublished").checked = false;
  $("chapterPublishButton").textContent = "Save & publish";
  $("revisionsPanel").classList.add("hidden");
  status("chapterStatus", "New chapter — save when ready.");
  renderChapters();
  $("chapterTitle").focus();
}
async function saveBook(forceStatus = null) {
  const title = $("bookTitle").value.trim();
  const payload = {
    title,
    slug: $("bookSlug").value.trim() || title,
    genre: $("bookGenre").value.trim(),
    cover_path: $("bookCover").value.trim(),
    description: $("bookDescription").value.trim()
  };
  if (forceStatus) payload.status = forceStatus;
  if (!payload.title) throw new Error("A book title is required.");
  status("bookStatus", "Saving…");
  const saved = state.isNewBook
    ? await api("/api/admin/books", { method: "POST", body: JSON.stringify(payload) })
    : await api("/api/admin/books/" + encodeURIComponent(state.book.id), { method: "PATCH", body: JSON.stringify(payload) });
  state.isNewBook = false;
  await loadBooks(saved.id);
  status("bookStatus", "Book saved.", "success");
  return saved;
}
async function saveChapter(forceStatus = null) {
  if (!state.book?.id) throw new Error("Save the book before adding chapters.");
  const number = Number($("chapterNumber").value);
  const title = $("chapterTitle").value.trim();
  const body = $("chapterBody").value;
  const payload = {
    chapter_number: number, title, body,
    is_paid: $("chapterPaid").checked,
    status: forceStatus || ($("chapterPublished").checked ? "published" : "draft")
  };
  if (!Number.isInteger(number) || number < 1) throw new Error("Enter a valid chapter number.");
  if (!title) throw new Error("A chapter title is required.");
  if (!body.trim()) throw new Error("Chapter text cannot be empty.");
  status("chapterStatus", "Saving chapter…");
  const saved = state.isNewChapter
    ? await api("/api/admin/books/" + encodeURIComponent(state.book.id) + "/chapters", { method: "POST", body: JSON.stringify(payload) })
    : await api("/api/admin/chapters/" + encodeURIComponent(state.chapter.id), { method: "PATCH", body: JSON.stringify(payload) });
  state.isNewChapter = false;
  await loadBook(state.book.id);
  openChapter(saved.id);
  status("chapterStatus", "Chapter saved. A private revision was kept before updates.", "success");
  return saved;
}
async function deleteBook() {
  if (!state.book?.id || !confirm("Delete this book and all its chapters? This cannot be undone.")) return;
  await api("/api/admin/books/" + encodeURIComponent(state.book.id), { method: "DELETE" });
  status("globalStatus", "Book deleted.", "success");
  state.book = null; await loadBooks();
}
async function deleteChapter() {
  if (!state.chapter?.id || !confirm("Delete this chapter? Its revision snapshots will remain in private storage for backup recovery, but will no longer be accessible from the editor unless recovered from a backup.")) return;
  const bookId = state.book.id;
  await api("/api/admin/chapters/" + encodeURIComponent(state.chapter.id), { method: "DELETE" });
  state.chapter = null;
  await loadBook(bookId);
  status("chapterStatus", "Chapter deleted.", "success");
}
async function toggleBookPublish() {
  if (!state.book?.id) return;
  const next = state.book.status === "published" ? "draft" : "published";
  if (next === "published") {
    const hasFreePublishedChapter = state.chapters.some(chapter =>
      chapter.status === "published" && chapter.is_paid !== true
    );
    if (!hasFreePublishedChapter) {
      throw new Error("Publish at least one free chapter before publishing this book. Paid-chapter delivery is not available yet.");
    }
  }
  await saveBook(next);
  status("bookStatus", next === "published" ? "Book published." : "Book returned to draft.", "success");
}
async function loadRevisions() {
  if (!state.chapter?.id) { status("chapterStatus", "Save the chapter before opening its revisions.", "error"); return; }
  const revisions = await api("/api/admin/chapters/" + encodeURIComponent(state.chapter.id) + "/revisions");
  const host = $("revisionList"); host.replaceChildren();
  if (!revisions.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No previous saved versions yet. Revisions are created before each chapter update."; host.append(empty);
  } else {
    for (const revision of revisions) {
      const button = document.createElement("button"); button.type = "button"; button.className = "chapter-item";
      const snap = revision.snapshot || {};
      const label = document.createElement("span");
      label.textContent = new Date(revision.created_at).toLocaleString() + " · " + (snap.title || "Untitled version");
      const restore = document.createElement("small"); restore.className = "pill"; restore.textContent = "Preview / restore";
      button.append(label, restore);
      button.addEventListener("click", () => {
        if (!confirm("Load this saved version into the editor? It will not be saved until you press Save chapter.")) return;
        $("chapterNumber").value = snap.chapter_number || 1;
        $("chapterTitle").value = snap.title || "";
        $("chapterBody").value = snap.body || "";
        $("chapterPaid").checked = snap.is_paid === true;
        $("chapterPublished").checked = snap.status === "published";
        status("chapterStatus", "Revision loaded into the editor. Save chapter to apply it.", "success");
      });
      host.append(button);
    }
  }
  $("revisionsPanel").classList.remove("hidden");
}
async function createBackup() {
  $("backupButton").disabled = true;
  status("globalStatus", "Creating a private cloud backup…");
  try {
    const result = await api("/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
    status("globalStatus", "Backup saved privately · " + result.books + " books and " + result.chapters + " chapters.", "success");
    await loadBackups();
    $("backupsPanel").classList.remove("hidden");
  } catch (error) {
    status("globalStatus", error.message, "error");
  } finally {
    $("backupButton").disabled = false;
  }
}
async function loadBackups() {
  const host = $("backupList");
  host.replaceChildren();
  status("backupStatus", "Loading private backups…");
  try {
    const backups = await api("/api/admin/backups");
    if (!backups.length) {
      const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No cloud backups yet. Choose Create backup to save a private snapshot."; host.append(empty);
    } else {
      for (const backup of backups) {
        const row = document.createElement("div");
        row.className = "chapter-item";
        const info = document.createElement("span");
        info.textContent = backup.name + (backup.created_at ? " · " + new Date(backup.created_at).toLocaleString() : "");
        const restore = document.createElement("button");
        restore.type = "button"; restore.className = "button outline"; restore.textContent = "Recover as drafts";
        restore.addEventListener("click", async () => {
          if (!confirm("Recover this backup as new draft copies? Existing books will not be overwritten. Paid chapters remain locked.")) return;
          restore.disabled = true;
          status("backupStatus", "Recovering backup as draft copies…");
          try {
            const result = await api("/api/admin/backups/restore", { method: "POST", body: JSON.stringify({ path: backup.path }) });
            await loadBooks();
            status("backupStatus", "Recovered " + result.books + " books, " + result.chapters + " chapters, and " + (result.revisions || 0) + " saved revisions as drafts. Existing books were not changed.", "success");
          } catch (error) {
            status("backupStatus", error.message, "error");
          } finally { restore.disabled = false; }
        });
        row.append(info, restore); host.append(row);
      }
    }
    status("backupStatus", backups.length + " private backup(s) available.", "success");
  } catch (error) {
    status("backupStatus", error.message, "error");
  }
}

async function signIn(event) {
  event.preventDefault();
  if (!state.supabase) {
    status("loginStatus", "The sign-in service is not ready. Reload the page and try again.", "error");
    return;
  }
  const button = $("signInButton");
  button.disabled = true;
  status("loginStatus", "Signing in…");
  try {
    const { data, error } = await state.supabase.auth.signInWithPassword({
      email: $("email").value.trim(), password: $("password").value
    });
    if (error) throw error;
    state.session = data.session;
    if (!state.session?.access_token) throw new Error("Sign-in did not return a valid session. Please try again.");
    await startStudio();
  } catch (error) {
    status("loginStatus", error?.message || "Could not sign in. Check your connection and try again.", "error");
  } finally {
    button.disabled = false;
  }
}
async function startStudio() {
  if (!state.session?.access_token) { showLogin(); return; }
  showStudio();
  try {
    await loadBooks();
    status("globalStatus", "Connected to your private author workspace.", "success");
  } catch (error) {
    status("globalStatus", error.message, "error");
    if (/session|sign in|invalid/i.test(error.message)) {
      await state.supabase.auth.signOut(); state.session = null; showLogin();
    }
  }
}

$("loginForm").addEventListener("submit", signIn);
$("signOutButton").addEventListener("click", async () => {
  await state.supabase?.auth.signOut();
  state.session = null; state.books = []; state.book = null; showLogin();
  status("loginStatus", "You have signed out.", "success");
});
$("backupButton").addEventListener("click", createBackup);
$("showBackupsButton").addEventListener("click", async () => {
  $("backupsPanel").classList.remove("hidden");
  await loadBackups();
});
$("closeBackupsButton").addEventListener("click", () => $("backupsPanel").classList.add("hidden"));
$("newBookButton").addEventListener("click", newBook);
$("bookForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await saveBook(); } catch (error) { status("bookStatus", error.message, "error"); }
});
$("publishBookButton").addEventListener("click", async () => {
  try { await toggleBookPublish(); } catch (error) { status("bookStatus", error.message, "error"); }
});
$("deleteBookButton").addEventListener("click", async () => {
  try { await deleteBook(); } catch (error) { status("globalStatus", error.message, "error"); }
});
$("newChapterButton").addEventListener("click", newChapter);
$("chapterForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await saveChapter(); } catch (error) { status("chapterStatus", error.message, "error"); }
});
$("chapterPublishButton").addEventListener("click", async () => {
  try { $("chapterPublished").checked = true; await saveChapter("published"); } catch (error) { status("chapterStatus", error.message, "error"); }
});
$("deleteChapterButton").addEventListener("click", async () => {
  try { await deleteChapter(); } catch (error) { status("chapterStatus", error.message, "error"); }
});
$("revisionsButton").addEventListener("click", async () => {
  try { await loadRevisions(); } catch (error) { status("chapterStatus", error.message, "error"); }
});

if (requireConfig()) {
  state.supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  if (state.session) await startStudio(); else showLogin();
  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (session) startStudio();
    else showLogin();
  });
} else {
  showLogin();
}
