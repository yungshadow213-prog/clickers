import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const bookSource = fs.readFileSync("books.js", "utf8");
assert.match(html, /<script src="\.\/books\.js"><\/script>/, "HTML must load the book catalogue");
assert.match(html, /<script src="\.\/author-config\.js"><\/script>/, "Reader must load the public author API configuration");
assert.match(html, /id="readerContent"/, "Reader content area must exist");
assert.match(html, /id="chapterSelect"/, "Chapter selector must exist");
assert.match(html, /id="downloadBook"/, "Reader download control must exist");
assert.ok(fs.existsSync("assets/the-man-behind-the-mask.jpg"), "The existing book cover asset must be included");
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.equal(inlineScripts.length, 1, "Expected one application inline script");
new Function(inlineScripts[0]);
assert.match(inlineScripts[0], /async function loadPublishedAuthorBooks/, "Reader must load published books from the author API");
assert.match(inlineScripts[0], /is_paid=eq\.false|\/api\/books\//, "Reader must use the public book/chapter API routes");
assert.match(inlineScripts[0], /existing\.add\(titleKey\)/, "Reader must deduplicate new author books against the existing catalogue");
const context = { window: {} };
vm.runInNewContext(bookSource, context);
const books = context.window.READING_ROOM_BOOKS;
assert.ok(Array.isArray(books) && books.length >= 2, "Expected at least two books");
const ids = new Set();
let chapterCount = 0;
for (const book of books) {
  assert.ok(book.id && book.title && book.description, "Each book needs identity and description");
  assert.ok(!ids.has(book.id), "Book ids must be unique");
  ids.add(book.id);
  assert.ok(Array.isArray(book.chapters) && book.chapters.length > 0, book.title + " must have chapters");
  for (const chapter of book.chapters) {
    assert.ok(chapter.title, book.title + " has a chapter without a title");
    assert.ok(Array.isArray(chapter.paragraphs) && chapter.paragraphs.length > 0, chapter.title + " has no paragraphs");
    assert.ok(chapter.paragraphs.every(p => typeof p === "string" && p.trim()), chapter.title + " contains an empty paragraph");
    chapterCount++;
  }
}
assert.ok(html.includes("localStorage"), "Reading progress should persist on the device");
for (const book of books) {
  const storyPage = path.join("stories", book.id, "index.html");
  assert.ok(fs.existsSync(storyPage), "Missing generated story landing page for " + book.title);
  const page = fs.readFileSync(storyPage, "utf8");
  assert.ok(page.includes('property="og:title"'), book.title + " landing page needs a social title");
  assert.ok(page.includes('property="og:image"'), book.title + " landing page needs a social preview image");
  assert.ok(page.includes('href="../../index.html?book=' + encodeURIComponent(book.id) + '"'), book.title + " landing page needs a reading link");
}
console.log("Site validation passed:", books.length, "books,", chapterCount, "chapters, and", books.length, "story landing pages.");
