import assert from "node:assert/strict";import fs from "node:fs";import vm from "node:vm";
const html=fs.readFileSync("index.html","utf8"),source=fs.readFileSync("books.js","utf8"),js=fs.readFileSync("storefront.js","utf8");
assert.match(html,/styles\.css/);assert.match(html,/storefront\.js/);assert.match(html,/id="readerContent"/);assert.match(html,/id="nextChapter"/);assert.match(js,/async function loadPublishedAuthorBooks/);assert.match(js,/\/api\/books\//);new Function(js);
const context={window:{}};vm.runInNewContext(source,context);const books=context.window.READING_ROOM_BOOKS;assert.ok(Array.isArray(books));const ids=new Set();for(const b of books){assert.ok(b.id&&b.title&&b.description);assert.ok(!ids.has(b.id));ids.add(b.id);assert.ok(Array.isArray(b.chapters)&&b.chapters.length>0);}
const store=fs.readFileSync("store.html","utf8"),detail=fs.readFileSync("book.html","utf8");assert.match(store,/id="books"/);assert.match(detail,/id="purchaseNote"/);assert.match(js,/purchaseUrl/);
const authorHtml=fs.readFileSync("author.html","utf8"),authorJs=fs.readFileSync("author.js","utf8");assert.match(authorHtml,/id="chapterBody"/);assert.match(authorHtml,/id="backupButton"/);assert.match(authorJs,/async function loadRevisions/);
console.log("Clickers storefront validation passed:",books.length,"public static books.");
