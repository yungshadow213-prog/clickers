import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const bookSource = fs.readFileSync("books.js", "utf8");
assert.match(html, /<script src="\.\/books\.js"><\/script>/, "HTML must load the book catalogue");
assert.match(html, /id="readerContent"/, "Reader content area must exist");
assert.match(html, /id="chapterSelect"/, "Chapter selector must exist");
assert.match(html, /id="downloadBook"/, "Reader download control must exist");
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.equal(inlineScripts.length, 1, "Expected one application inline script");
new Function(inlineScripts[0]);
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
console.log("Site validation passed:", books.length, "books,", chapterCount, "chapters.");
