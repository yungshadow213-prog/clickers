(function(){
"use strict";
const $=id=>document.getElementById(id);
const SAVE_KEY="clickers-reading-list-v1";
const PROGRESS_KEY="clickers-reading-progress-v1";
const PREF_KEY="clickers-reading-preferences-v1";
let books=Array.isArray(window.READING_ROOM_BOOKS)?[...window.READING_ROOM_BOOKS]:[];
let activeBook=null,chapterIndex=0,readerFontSize=19;
const api=window.CLICKERS_CONFIG&&window.CLICKERS_CONFIG.apiUrl;
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const coverSrc=v=>{const s=String(v||"").trim();if(/^https?:\/\//i.test(s))return s;if(!s||/^(?:data:|javascript:|\/\/)/i.test(s))return "";return "./"+s.replace(/^\.?\//,"");};
const readStore=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||"null");return value==null?fallback:value;}catch{return fallback;}};
const writeStore=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(e){console.warn("Could not save this reading preference.",e);}};
const savedIds=()=>{const value=readStore(SAVE_KEY,[]);return Array.isArray(value)?value.map(String):[];};
const progressMap=()=>{const value=readStore(PROGRESS_KEY,{});return value&&typeof value==="object"&&!Array.isArray(value)?value:{};};
function toast(message){const node=$("toast");if(!node)return;node.textContent=message;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2400);}
function money(b){return Number(b.price_minor||0)>0?"₦"+(Number(b.price_minor)/100).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2}):"Free preview";}
function isSaved(id){return savedIds().includes(String(id));}
function updateSavedCount(){const node=$("savedCount");if(node)node.textContent=String(savedIds().length);}
function toggleSaved(id){const key=String(id),ids=savedIds(),has=ids.includes(key),next=has?ids.filter(x=>x!==key):[key,...ids];writeStore(SAVE_KEY,next);updateSavedCount();renderHome();renderStore();renderSaved();renderBook();toast(has?"Removed from your reading list.":"Saved to your reading list.");}
function saveButton(b){const saved=isSaved(b.id);return '<button class="save-book '+(saved?"saved":"")+'" type="button" data-save-book="'+esc(b.id)+'" aria-label="'+(saved?"Remove from reading list":"Save to reading list")+'" aria-pressed="'+saved+'">'+(saved?"♥":"♡")+'</button>';}
function emptyState(title,copy,action){return '<div class="empty-state"><div class="empty-mark">✳</div><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p>'+(action||"")+'</div>';}
function card(b){
 const cover=coverSrc(b.cover),n=(b.chapters||[]).length,price=b.for_sale&&Number(b.price_minor)>0?'<span class="book-price">'+money(b)+'</span>':'<span class="book-price free">'+(n?"Free preview":"Preview soon")+'</span>';
 return '<article class="book-card">'+saveButton(b)+'<a class="book-card-link" href="./book.html?book='+encodeURIComponent(b.id)+'" aria-label="View '+esc(b.title)+'"><div class="book-cover">'+(cover?'<img src="'+esc(cover)+'" alt="Cover of '+esc(b.title)+'" loading="lazy">':'<div class="cover-fallback"><small>CLICKERS ORIGINAL</small><strong>'+esc(b.title)+'</strong><small>BY '+esc(b.author||"Yung Dharick")+'</small></div>')+'</div></a><div class="book-info"><div class="book-meta"><span>'+esc(b.genre||"Fiction")+'</span><span>'+n+' '+(n===1?"chapter":"chapters")+'</span></div><h3>'+esc(b.title)+'</h3><p>'+esc(b.description||"Open the book and discover what’s inside.")+'</p><div class="card-foot"><small>By '+esc(b.author||"Yung Dharick")+'</small>'+price+'<a href="./book.html?book='+encodeURIComponent(b.id)+'">Open book ↗</a></div></div></article>';
}
function matchesQuery(b,q){return [b.title,b.genre,b.description,b.author].join(" ").toLowerCase().includes(q);}
function renderGenreOptions(){
 const select=$("genre");if(!select)return;
 const selected=new URLSearchParams(location.search).get("genre")||select.value||"";
 const genres=[...new Set(books.map(b=>b.genre).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 select.innerHTML='<option value="">Every genre</option>'+genres.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join("");
 if(selected&&genres.includes(selected))select.value=selected;
}
function renderGenrePills(targetId,selected){
 const node=$(targetId);if(!node)return;
 const genres=[...new Set(books.map(b=>b.genre).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 if(!genres.length){node.innerHTML="";return;}
 node.innerHTML=genres.map(g=>'<button type="button" class="genre-pill '+(selected===g?"active":"")+'" data-filter-genre="'+esc(g)+'">'+esc(g)+'</button>').join("");
}
function renderHome(){
 if($("year"))$("year").textContent=new Date().getFullYear();
 const q=$("homeSearch")?$("homeSearch").value.trim().toLowerCase():"";
 const shown=books.filter(b=>matchesQuery(b,q));
 if($("featuredBooks"))$("featuredBooks").innerHTML=books.length?books.slice(0,3).map(card).join(""):emptyState("The next story is still being written.","The catalogue has been cleared for a fresh start. New releases will appear here as they’re published.",'<a class="text-link" href="./store.html">Visit the bookshop ↗</a>');
 if($("homeBooks"))$("homeBooks").innerHTML=books.length?(shown.length?shown.map(card).join(""):emptyState("No stories match that search.","Try another title, writer or genre.")):emptyState("Your next favourite hasn’t landed yet.","The shelves are getting ready for new stories. Check back as fresh books arrive.",'<a class="button button-primary" href="./store.html">Visit the bookshop ↗</a>');
 renderGenrePills("homeGenres","");
 renderContinue();
 updateSavedCount();
}
function renderStore(){
 if(!$("books"))return;
 const q=$("search")?$("search").value.trim().toLowerCase():"";
 const g=$("genre")?$("genre").value:"";
 const shown=books.filter(b=>(!g||b.genre===g)&&matchesQuery(b,q));
 if($("count"))$("count").textContent=shown.length+" "+(shown.length===1?"book":"books")+" "+(q||g?"match your filters":"on the shelves");
 $("books").innerHTML=shown.length?shown.map(card).join(""):books.length?emptyState("No books found this time.","Try clearing a filter or searching for something else."):emptyState("The shelves are taking a fresh breath.","The old catalogue has been cleared. New titles will appear here as soon as they’re published.",'<a class="button button-primary" href="./index.html">Back to Clickers ↗</a>');
 renderGenrePills("storeGenres",g);
 updateSavedCount();
}
function renderContinue(){
 const node=$("continueReading");if(!node)return;
 const progress=progressMap(),recent=Object.entries(progress).filter(([id,p])=>books.some(b=>String(b.id)===String(id))&&p&&Number.isFinite(Number(p.chapterIndex))).sort((a,b)=>(Number(b[1].lastRead)||0)-(Number(a[1].lastRead)||0))[0];
 if(!recent){node.innerHTML='<div class="continue-card-top"><span>YOUR READING CORNER</span><span class="live-dot">READY WHEN YOU ARE</span></div><div class="continue-empty"><div class="mini-book"><span>OPEN<br>A BOOK</span><b>✳</b></div><div><h3>Your next chapter starts here.</h3><p>Open a book preview and we’ll remember where you stopped.</p><a href="./store.html" class="button button-lime">Find something to read ↗</a></div></div>';return;}
 const [id,p]=recent,b=books.find(x=>String(x.id)===String(id)),cover=coverSrc(b.cover),chapter=Math.max(0,Number(p.chapterIndex)||0);
 node.innerHTML='<div class="continue-card-top"><span>BACK TO YOUR STORY</span><span class="live-dot">SAVED ON THIS DEVICE</span></div><div class="continue-active">'+(cover?'<img class="continue-cover" src="'+esc(cover)+'" alt="">':'<div class="continue-placeholder">c.</div>')+'<div><span class="shelf-kicker">'+esc(b.genre||"YOUR BOOK")+'</span><h3>'+esc(b.title)+'</h3><p>Pick up at '+esc(p.chapterTitle||("Chapter "+(chapter+1)))+'.</p><a class="button button-primary" href="./index.html?book='+encodeURIComponent(b.id)+'">Continue reading ↗</a></div></div>';
}
function renderSaved(){
 const savedNode=$("savedBooks");if(savedNode){const list=savedIds().map(id=>books.find(b=>String(b.id)===id)).filter(Boolean);savedNode.innerHTML=list.length?list.map(card).join(""):emptyState("Your list is waiting for its first story.","Save a book from the bookshop and it’ll be waiting here.",'<a class="button button-primary" href="./store.html">Browse the books ↗</a>');}
 const progressNode=$("savedProgress");if(progressNode){const progress=progressMap(),rows=Object.entries(progress).filter(([id,p])=>books.some(b=>String(b.id)===String(id))&&p).sort((a,b)=>(Number(b[1].lastRead)||0)-(Number(a[1].lastRead)||0));progressNode.innerHTML=rows.length?'<div class="book-grid">'+rows.map(([id,p])=>{const b=books.find(x=>String(x.id)===String(id));return '<article class="book-card"><div class="book-info"><div class="book-meta"><span>RECENTLY OPENED</span></div><h3>'+esc(b.title)+'</h3><p>Paused at '+esc(p.chapterTitle||("Chapter "+((Number(p.chapterIndex)||0)+1)))+'.</p><div class="card-foot"><small>'+esc(b.author||"Yung Dharick")+'</small><a href="./index.html?book='+encodeURIComponent(b.id)+'">Resume ↗</a></div></div></article>';}).join("")+'</div>':emptyState("No chapters on pause yet.","Read a preview and Clickers will remember your place.");}
 updateSavedCount();
}
async function loadPublishedAuthorBooks(){
 if(!api)return;
 try{
  const r=await fetch(api.replace(/\/+$/,"")+"/api/books",{cache:"no-store"});if(!r.ok)return;
  const rows=await r.json();if(!Array.isArray(rows))return;
  const known=new Set(books.map(b=>String(b.title||"").trim().toLowerCase()));
  const additions=await Promise.all(rows.map(async item=>{
   const key=String(item.title||"").trim().toLowerCase();if(known.has(key))return null;
   let chapters=[];
   try{const cr=await fetch(api.replace(/\/+$/,"")+"/api/books/"+encodeURIComponent(item.id)+"/chapters",{cache:"no-store"});if(cr.ok){const data=await cr.json();chapters=Array.isArray(data)?data.map(ch=>({title:ch.title,paragraphs:String(ch.body||"").split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean)})):[];}}catch{}
   return {id:item.id,title:item.title,genre:item.genre||"Fiction",description:item.description||"",cover:item.cover_path||"",author:item.author||"Yung Dharick",chapters,extraImages:item.extra_images||[],purchaseUrl:item.purchase_url||"",price_minor:Number(item.price_minor||0),currency:item.currency||"NGN",for_sale:item.for_sale===true};
  }));
  books.push(...additions.filter(Boolean));
  renderGenreOptions();renderGenreOptions();renderHome();renderStore();renderBook();renderSaved();
 }catch(e){console.warn("Could not load published books.",e);}
}
function rememberProgress(){
 if(!activeBook)return;
 const progress=progressMap();
 progress[String(activeBook.id)]={chapterIndex,chapterTitle:(activeBook.chapters[chapterIndex]&&activeBook.chapters[chapterIndex].title)||("Chapter "+(chapterIndex+1)),lastRead:Date.now()};
 writeStore(PROGRESS_KEY,progress);
}
function openReader(id){
 activeBook=books.find(b=>String(b.id)===String(id));if(!activeBook)return;
 const savedProgress=progressMap()[String(activeBook.id)];
 chapterIndex=savedProgress?Math.min(Math.max(0,Number(savedProgress.chapterIndex)||0),Math.max(0,activeBook.chapters.length-1)):0;
 renderChapter();
 const reader=$("reader");if(!reader)return;
 reader.classList.add("open");reader.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
 if($("readerSave")){$("readerSave").textContent=isSaved(activeBook.id)?"♥ Saved to list":"♡ Save book";}
 $("closeReader")&&$("closeReader").focus();
}
function closeReader(){const reader=$("reader");if(!reader)return;reader.classList.remove("open");reader.setAttribute("aria-hidden","true");document.body.style.overflow="";activeBook=null;renderHome();renderSaved();}
function renderChapter(){
 if(!activeBook)return;
 const ch=activeBook.chapters[chapterIndex];
 $("readerBookTitle").textContent=activeBook.title;
 $("readerTitle").textContent=ch?ch.title:activeBook.title;
 $("readerSubtitle").textContent=ch?"CHAPTER "+(chapterIndex+1)+" OF "+activeBook.chapters.length:"PREVIEW";
 $("readerContent").innerHTML=ch&&ch.paragraphs&&ch.paragraphs.length?ch.paragraphs.map(p=>"<p>"+esc(p)+"</p>").join(""):"<p>This preview isn’t available yet. Check back when the author releases a sample.</p>";
 $("prevChapter").disabled=chapterIndex===0;$("nextChapter").disabled=!activeBook.chapters.length||chapterIndex>=activeBook.chapters.length-1;
 if($("readerProgress"))$("readerProgress").textContent=activeBook.chapters.length?"Chapter "+(chapterIndex+1)+" / "+activeBook.chapters.length:"Preview";
 rememberProgress();
}
function updateReaderTheme(theme){
 const panel=document.querySelector(".reader-panel");if(!panel)return;
 panel.classList.remove("reader-theme-paper","reader-theme-warm","reader-theme-night");
 panel.classList.add("reader-theme-"+(theme||"paper"));
 const prefs=readStore(PREF_KEY,{});prefs.theme=theme||"paper";writeStore(PREF_KEY,prefs);
 document.querySelectorAll("[data-reader-theme]").forEach(btn=>btn.classList.toggle("active",btn.dataset.readerTheme===(theme||"paper")));
}
function updateReaderSize(delta){
 readerFontSize=Math.min(27,Math.max(15,readerFontSize+delta));
 const content=$("readerContent");if(content)content.style.fontSize=readerFontSize+"px";
 const prefs=readStore(PREF_KEY,{});prefs.fontSize=readerFontSize;writeStore(PREF_KEY,prefs);
}
function renderBook(){
 if(!$("detail"))return;
 const id=new URLSearchParams(location.search).get("book"),b=books.find(x=>String(x.id)===String(id));
 if(!b){$("title").textContent="This story isn’t on the shelf yet.";if($("description"))$("description").textContent="It may not have been published, or the link may be out of date. Explore the bookshop to find another story.";return;}
 document.title=b.title+" — Clickers";
 $("genre").textContent=b.genre||"CLICKERS ORIGINAL";$("title").textContent=b.title;$("author").textContent="By "+(b.author||"Yung Dharick");$("description").textContent=b.description||"Open the book and discover what’s inside.";
 const cover=coverSrc(b.cover);
 $("coverStage").innerHTML=cover?'<img src="'+esc(cover)+'" alt="Cover of '+esc(b.title)+'">':'<div class="cover-art"><small>CLICKERS ORIGINAL</small><strong>'+esc(b.title)+'</strong><small>OPEN THE COVER</small></div>';
 $("tags").innerHTML='<span>'+esc(b.genre||"Fiction")+'</span><span>'+(b.chapters||[]).length+' '+((b.chapters||[]).length===1?"chapter":"chapters")+'</span>';
 const actions=[];
 if((b.chapters||[]).length)actions.push('<a class="button button-primary" href="./index.html?book='+encodeURIComponent(b.id)+'">Read a preview ↗</a>');
 if(b.for_sale&&Number(b.price_minor)>0)actions.push('<a class="button button-dark" href="./checkout.html?book='+encodeURIComponent(b.id)+'">Buy ebook · '+money(b)+' ↗</a>');
 else if(b.purchaseUrl)actions.push('<a class="button button-dark" href="'+esc(b.purchaseUrl)+'" target="_blank" rel="noopener">Get the book ↗</a>');
 $("actions").innerHTML=actions.join("")||'<a class="button button-primary" href="./store.html">Explore other books ↗</a>';
 $("bookTools").innerHTML='<button type="button" data-save-book="'+esc(b.id)+'" class="book-save-toggle">'+(isSaved(b.id)?"♥ Saved to your list":"♡ Save to my list")+'</button><button type="button" data-share-book="'+esc(b.id)+'">↗ Share this book</button>';
 $("purchaseNote").textContent=b.for_sale?"Secure checkout. Your private ebook download unlocks after payment is verified.":b.purchaseUrl?"You’ll complete your purchase through the book’s external checkout.":"Preview the story before deciding if it’s for you.";
 const first=b.chapters&&b.chapters[0];$("sampleCopy").innerHTML=first&&first.paragraphs&&first.paragraphs.length?first.paragraphs.slice(0,3).map(p=>"<p>"+esc(p)+"</p>").join(""):"<p>A sample from this book will appear here when the author makes one available.</p>";
 updateSavedCount();
}
async function shareBook(id){
 const b=books.find(x=>String(x.id)===String(id));if(!b)return;
 const url=new URL("./book.html?book="+encodeURIComponent(b.id),location.href).href;
 try{if(navigator.share){await navigator.share({title:b.title,text:"Take a look at "+b.title+" on Clickers.",url});return;}if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);toast("Book link copied. Share it with a friend.");return;}}catch(e){if(e.name==="AbortError")return;}
 toast("Book link: "+url);
}
document.addEventListener("click",e=>{
 const save=e.target.closest("[data-save-book]");if(save){toggleSaved(save.dataset.saveBook);return;}
 const filter=e.target.closest("[data-filter-genre]");if(filter){const genre=filter.dataset.filterGenre;location.href="./store.html?genre="+encodeURIComponent(genre);return;}
 const theme=e.target.closest("[data-reader-theme]");if(theme){updateReaderTheme(theme.dataset.readerTheme);return;}
 const share=e.target.closest("[data-share-book]");if(share){shareBook(share.dataset.shareBook);}
});
if($("homeSearch"))$("homeSearch").addEventListener("input",renderHome);
if($("search"))$("search").addEventListener("input",renderStore);
if($("genre"))$("genre").addEventListener("change",renderStore);
if($("menuToggle"))$("menuToggle").addEventListener("click",()=>{const n=$("navlinks"),open=n.classList.toggle("open");$("menuToggle").setAttribute("aria-expanded",String(open));$("menuToggle").textContent=open?"×":"☰";});
if($("closeReader"))$("closeReader").addEventListener("click",closeReader);
if($("reader"))$("reader").addEventListener("click",e=>{if(e.target===$("reader"))closeReader();});
if($("prevChapter"))$("prevChapter").addEventListener("click",()=>{if(chapterIndex>0){chapterIndex--;renderChapter();$("readerContent").scrollIntoView({block:"start",behavior:"smooth"});}});
if($("nextChapter"))$("nextChapter").addEventListener("click",()=>{if(activeBook&&chapterIndex<activeBook.chapters.length-1){chapterIndex++;renderChapter();$("readerContent").scrollIntoView({block:"start",behavior:"smooth"});}});
if($("fontUp"))$("fontUp").addEventListener("click",()=>updateReaderSize(1));
if($("fontDown"))$("fontDown").addEventListener("click",()=>updateReaderSize(-1));
if($("readerSave"))$("readerSave").addEventListener("click",()=>{if(activeBook){toggleSaved(activeBook.id);$("readerSave").textContent=isSaved(activeBook.id)?"♥ Saved to list":"♡ Save book";}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("reader")&&$("reader").classList.contains("open"))closeReader();});
const prefs=readStore(PREF_KEY,{});readerFontSize=Number(prefs.fontSize)||19;updateReaderTheme(prefs.theme||"paper");if($("readerContent"))$("readerContent").style.fontSize=readerFontSize+"px";
if($("year"))$("year").textContent=new Date().getFullYear();
renderHome();renderStore();renderBook();renderSaved();
loadPublishedAuthorBooks().then(()=>{const id=new URLSearchParams(location.search).get("book");if(id&&$("reader"))openReader(id);});
})();