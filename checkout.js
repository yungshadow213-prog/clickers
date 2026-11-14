(function(){
"use strict";
const $=id=>document.getElementById(id),config=window.CLICKERS_CONFIG||{},api=(config.apiUrl||"").replace(/\/+$/,""),params=new URLSearchParams(location.search),bookId=params.get("book"),reference=params.get("reference");
let selectedBook=null;
function status(message,kind=""){$("result").textContent=message;$("result").className="checkout-status"+(kind?" "+kind:"");}
function money(amount){return "₦"+(Number(amount||0)/100).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});}
async function loadBook(){
 if(!api){status("The checkout service is not configured yet. Please contact the author.", "error");return;}
 const r=await fetch(api+"/api/books",{cache:"no-store"});if(!r.ok)throw new Error("The bookshop could not be reached. Please try again.");
 const books=await r.json();selectedBook=books.find(b=>String(b.id)===String(bookId)&&b.for_sale===true);
 if(!selectedBook)throw new Error("This book is not currently available for purchase.");
 $("bookTitle").textContent=selectedBook.title;$("bookGenre").textContent=selectedBook.genre||"Clickers original";$("bookPrice").textContent=money(selectedBook.price_minor);
 $("bookSummary").classList.remove("hidden");$("checkoutForm").classList.remove("hidden");
}
async function verifyPayment(){
 $("heading").textContent="Confirming your payment.";
 $("intro").textContent="Please wait while Clickers confirms the transaction directly with Paystack.";
 status("Verifying payment. Do not close this page yet.");
 const r=await fetch(api+"/api/checkout/verify?reference="+encodeURIComponent(reference),{cache:"no-store"});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok||!data.download_url)throw new Error(data.error||"Payment is not confirmed yet. If you completed the payment, refresh this page in a moment.");
 $("heading").textContent="Your story is ready.";
 $("intro").textContent="Payment confirmed. Your private download link is ready and will remain valid for 10 minutes.";
 $("bookSummary").classList.add("hidden");$("checkoutForm").classList.add("hidden");
 $("downloadLink").href=data.download_url;$("downloadLink").classList.remove("hidden");
 status("Payment confirmed for "+data.book_title+". Your download is ready.","success");
}
$("checkoutForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!selectedBook)return;
 const button=$("payButton");button.disabled=true;status("Preparing secure checkout…");
 try{
  const r=await fetch(api+"/api/checkout/initialize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({book_id:selectedBook.id,email:$("buyerEmail").value.trim()})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.authorization_url)throw new Error(data.error||"Could not start checkout.");
  location.assign(data.authorization_url);
 }catch(error){status(error.message,"error");button.disabled=false;}
});
(async()=>{
 if(reference){try{await verifyPayment();}catch(error){status(error.message,"error");$("heading").textContent="Payment confirmation pending.";}}
 else if(bookId){try{await loadBook();}catch(error){status(error.message,"error");}}
 else{status("Choose a book from the Clickers bookshop to begin checkout.");}
})();
})();