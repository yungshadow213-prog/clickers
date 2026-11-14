import assert from "node:assert/strict";import fs from "node:fs";import vm from "node:vm";
const html=fs.readFileSync("index.html","utf8"),source=fs.readFileSync("books.js","utf8"),js=fs.readFileSync("storefront.js","utf8");
assert.match(html,/styles\.css/);assert.match(html,/storefront\.js/);assert.match(html,/id="readerContent"/);assert.match(html,/id="nextChapter"/);assert.match(js,/async function loadPublishedAuthorBooks/);assert.match(js,/\/api\/books\//);new Function(js);
const context={window:{}};vm.runInNewContext(source,context);const books=context.window.READING_ROOM_BOOKS;assert.ok(Array.isArray(books));const ids=new Set();for(const b of books){assert.ok(b.id&&b.title&&b.description);assert.ok(!ids.has(b.id));ids.add(b.id);assert.ok(Array.isArray(b.chapters)&&b.chapters.length>0);}
const store=fs.readFileSync("store.html","utf8"),detail=fs.readFileSync("book.html","utf8");assert.match(store,/id="books"/);assert.match(detail,/id="purchaseNote"/);assert.match(js,/purchaseUrl/);
const authorHtml=fs.readFileSync("author.html","utf8"),authorJs=fs.readFileSync("author.js","utf8");
assert.match(authorHtml,/id="chapterBody"/);assert.match(authorHtml,/id="backupButton"/);assert.match(authorHtml,/id="ordersPanel"/);assert.match(authorHtml,/id="ordersList"/);assert.match(authorJs,/async function loadOrders/);assert.match(authorHtml,/id="bookPrice"/);assert.match(authorHtml,/id="bookEbookFile"/);
assert.match(authorJs,/async function loadRevisions/);assert.match(authorJs,/async function uploadEbook/);assert.match(authorJs,/price_minor/);
const checkoutHtml=fs.readFileSync("checkout.html","utf8"),checkoutJs=fs.readFileSync("checkout.js","utf8"),worker=fs.readFileSync("cloudflare/worker.mjs","utf8");
assert.match(checkoutHtml,/id="checkoutForm"/);assert.match(checkoutHtml,/id="downloadLink"/);new Function(checkoutJs);
assert.match(worker,/\/api\/admin\/orders/);assert.match(worker,/\/api\/checkout\/initialize/);assert.match(worker,/\/api\/checkout\/verify/);assert.match(worker,/PAYSTACK_SECRET_KEY/);assert.match(worker,/clickers_orders/);assert.match(worker,/storage\/v1\/object\/sign\/clickers-private/);
assert.match(fs.readFileSync("admin.html","utf8"),/author\.html/);
console.log("Clickers storefront validation passed:",books.length,"public static books.");
