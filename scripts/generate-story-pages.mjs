import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "books.js"), "utf8");
const match = source.match(/window\\.READING_ROOM_BOOKS\\s*=\\s*(\\[[\\s\\S]*\\])\\s*;?\\s*$/);
if (!match) throw new Error("Could not parse the book catalogue in books.js.");
const books = JSON.parse(match[1]);
if (!Array.isArray(books) || books.length === 0) throw new Error("The book catalogue is empty.");

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const attr = value => esc(value);
const site = "https://yungshadow213-prog.github.io/clickers";
const imageFor = book => book.cover
  ? "https://raw.githubusercontent.com/yungshadow213-prog/clickers/main/" + book.cover.replace(/^\\.\\//, "")
  : site + "/assets/clickers-social-cover.jpg";

for (const book of books) {
  if (!book.id || !book.title || !book.description) throw new Error("Every book needs an id, title, and description.");
  const pageDir = path.join(root, "stories", book.id);
  fs.mkdirSync(pageDir, { recursive: true });
  const canonical = site + "/stories/" + encodeURIComponent(book.id) + "/";
  const cover = imageFor(book);
  const description = String(book.description).replace(/\\s+/g, " ").trim().slice(0, 220);
  const chapters = Array.isArray(book.chapters) ? book.chapters.length : 0;
  const genre = book.label || book.genre || "Original fiction";
  const readUrl = "../../index.html?book=" + encodeURIComponent(book.id);
  const pinterestUrl = "https://www.pinterest.com/pin/create/button/?url=" +
    encodeURIComponent(canonical) + "&media=" + encodeURIComponent(cover) +
    "&description=" + encodeURIComponent(book.title + " — " + description);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#fff7f0">
<meta name="description" content="${attr(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:type" content="book">
<meta property="og:site_name" content="Clickers Reading Room">
<meta property="og:title" content="${attr(book.title)} — Read on Clickers">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:image" content="${attr(cover)}">
<meta property="og:image:alt" content="Cover of ${attr(book.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(book.title)} — Read on Clickers">
<meta name="twitter:description" content="${attr(description)}">
<meta name="twitter:image" content="${attr(cover)}">
<meta name="pinterest-rich-pin" content="true">
<title>${attr(book.title)} — Read on Clickers</title>
<style>
:root{color-scheme:light;--ink:#302431;--muted:#766774;--wine:#873653;--rose:#f4dfe3;--paper:#fff8f1;--line:#ead8d9}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 10% 0,#fbe2d4,transparent 36%),radial-gradient(ellipse at 100% 60%,#f0e3f5,transparent 30%),var(--paper);color:var(--ink);font-family:Georgia,"Times New Roman",serif}.wrap{width:min(1040px,calc(100% - 36px));margin:auto}header{padding:24px 0;border-bottom:1px solid var(--line)}.brand{font:700 17px Arial,sans-serif;letter-spacing:-.04em}.brand span{color:var(--wine)}main{padding:54px 0 72px}.story{display:grid;grid-template-columns:minmax(230px,.72fr) minmax(0,1.28fr);gap:clamp(28px,6vw,76px);align-items:center}.cover-wrap{max-width:390px;width:100%;margin:auto;position:relative}.cover-wrap:before{content:"";position:absolute;inset:8% -7% -5% 10%;background:#ead0d4;border-radius:48% 52% 42% 58%;transform:rotate(-7deg)}.cover{position:relative;display:block;width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:4px;box-shadow:0 25px 65px #49223524;background:#ead8d2}.cover-placeholder{aspect-ratio:3/4;display:grid;place-items:center;padding:28px;background:linear-gradient(145deg,#873653,#3a283b);color:white;font-size:clamp(26px,4vw,44px);text-align:center;line-height:1.05;box-shadow:0 25px 65px #49223524}.eyebrow{font:700 11px Arial,sans-serif;letter-spacing:.17em;text-transform:uppercase;color:var(--wine)}h1{font-size:clamp(42px,6vw,72px);line-height:.98;letter-spacing:-.06em;font-weight:400;margin:18px 0}.author{font:13px Arial,sans-serif;color:var(--muted)}.description{font-size:17px;line-height:1.85;color:#665866;max-width:600px;margin:25px 0}.details{display:flex;flex-wrap:wrap;gap:9px;margin:24px 0}.pill{padding:9px 12px;border:1px solid var(--line);border-radius:999px;font:11px Arial,sans-serif;color:var(--muted);background:#fffaf7}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:999px;background:var(--wine);color:white;text-decoration:none;font:700 13px Arial,sans-serif;box-shadow:0 9px 22px #87365322}.button.secondary{background:transparent;color:var(--wine);border:1px solid #d9b6c1;box-shadow:none}.hint{margin-top:20px;color:var(--muted);font:12px/1.7 Arial,sans-serif}.more{border-top:1px solid var(--line);padding-top:23px;margin-top:55px;font:13px Arial,sans-serif;color:var(--muted)}a:focus-visible{outline:3px solid #cf7d9a;outline-offset:4px}@media(max-width:680px){main{padding:34px 0 48px}.story{grid-template-columns:minmax(0,1fr);gap:38px}.cover-wrap{width:min(68%,300px)}h1{font-size:clamp(42px,12vw,62px)}.description{font-size:16px;margin:20px 0}.actions{display:grid;grid-template-columns:1fr}.button{width:100%}.more{margin-top:40px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="../../index.html" style="color:inherit;text-decoration:none" aria-label="Clickers Reading Room home">clickers<span> · reading room</span></a></div></header>
<main class="wrap">
<article class="story">
<div class="cover-wrap">${book.cover ? '<img class="cover" src="../../' + attr(book.cover.replace(/^\\.\\//, "")) + '" alt="Cover of ' + attr(book.title) + '" fetchpriority="high">' : '<div class="cover-placeholder" role="img" aria-label="Cover artwork for ' + attr(book.title) + '">' + attr(book.title) + '</div>'}</div>
<div><div class="eyebrow">${attr(genre)}</div><h1>${attr(book.title)}</h1><div class="author">By ${attr(book.author || "Yung Dharick")}</div><p class="description">${attr(description)}</p><div class="details"><span class="pill">${chapters} chapters</span><span class="pill">Read in your browser</span><span class="pill">Free to explore</span></div><div class="actions"><a class="button" href="${attr(readUrl)}">Read this story ↗</a><a class="button secondary" href="${attr(pinterestUrl)}" rel="nofollow">Save to Pinterest ♡</a></div><p class="hint">No account needed. Open the story on your phone, tablet, or computer and settle in at your own pace.</p></div>
</article>
<div class="more"><a href="../../index.html">← Explore the full Clickers library</a></div>
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(pageDir, "index.html"), html);
}
console.log("Generated " + books.length + " shareable story landing pages.");
