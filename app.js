/* CardTrack Pro — Edit cards & show Paid (avg) */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmtUSD = (cents) => (cents==null?0:cents/100).toLocaleString(undefined,{style:"currency",currency:"USD"});

const CACHE = { USER:"ctp.user", SNAP_PREF:"ctp.snap.v1." , COLLECTION:"ctp.collection" };
const state = { user:null, collection:"Personal", inventory:[], watchlist:[], history:[], sets:[], transactions:[] };

function debounce(fn, ms=600){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
async function cloudLoad(user, collection){
  const res = await fetch(`/.netlify/functions/storage?user=${encodeURIComponent(user)}&collection=${encodeURIComponent(collection)}`, { headers:{ "accept":"application/json" } });
  if (!res.ok) throw new Error(`load ${res.status}`);
  return await res.json();
}
const cloudSave = debounce(async (user, collection, data)=>{
  await fetch(`/.netlify/functions/storage`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user, collection, data }) });
}, 500);

// --- Stats helpers ---
function estimateItemValue(it){
  const prices = it.prices || {};
  const grade = it.gradeKey || "loose-price";
  let cents = prices[grade]; if (cents == null) cents = prices["loose-price"];
  return (Number(cents)||0) * (Number(it.qty)||1);
}
function totals(){
  const count = state.inventory.reduce((a,it)=>a+(Number(it.qty)||0),0);
  const est = state.inventory.reduce((a,it)=>a+estimateItemValue(it),0);
  const cost = state.inventory.reduce((a,it)=>a+(Number(it.costBasisCents)||0),0);
  return { count, est, cost, pl: est-cost };
}
function todayISO(d=new Date()){ return d.toISOString().slice(0,10); }
function logDailySnapshot(){
  const t = totals(); const last = state.history[state.history.length-1]; const d = todayISO();
  if (!last || last.date !== d){ state.history.push({ date:d, ts:new Date().toISOString(), estCents:t.est, costCents:t.cost }); if (state.history.length>730) state.history=state.history.slice(-730);
  } else { last.estCents=t.est; last.costCents=t.cost; }
}
function updateStats(){
  const t = totals();
  $("#stat-count").textContent = Number(t.count||0).toLocaleString();
  $("#stat-value").textContent = fmtUSD(t.est);
  $("#stat-cost").textContent = fmtUSD(t.cost);
  $("#stat-pl").textContent = fmtUSD(t.pl);
  localStorage.setItem(CACHE.SNAP_PREF + state.collection, JSON.stringify({ inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions }));
  cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
}

// --- Search + Add ---
function priceKeysDisplay(obj){
  const preferred=["loose-price","graded-price","manual-only-price","new-price","cib-price","bgs-10-price","condition-17-price","condition-18-price"];
  const keys=preferred.filter(k=>obj[k]!=null); Object.keys(obj).forEach(k=>{ if (/-price$/.test(k) && !keys.includes(k)) keys.push(k); }); return keys;
}
const GRADE_LABEL = (k) => {
  const map = { "loose-price":"Loose", "graded-price":"Graded", "new-price":"New", "cib-price":"CIB", "manual-only-price":"Manual", "bgs-10-price":"BGS 10", "condition-17-price":"Cond 17", "condition-18-price":"Cond 18" };
  return map[k] || k.replace(/-/g," ").replace(/\w/g, s=>s.toUpperCase());
};

async function doSearch(q){
  const res = await fetch(`/.netlify/functions/prices?type=products&q=${encodeURIComponent(q)}`);
  if (!res.ok){ $("#results").innerHTML = `<div class="col-span-full text-red-300">Search failed: ${res.status}</div>`; return; }
  const data = await res.json();
  const products = data.products || (data.status==="success" ? [data] : []);
  renderResults(products);
}
function renderResults(products){
  const container=$("#results"); container.innerHTML="";
  if (!products?.length){ container.innerHTML=`<div class="col-span-full text-slate-300/80">No results.</div>`; return; }
  for (const p of products){
    const keys = priceKeysDisplay(p);
    const priceRows = keys.map(k=>`<div class="flex items-center justify-between text-sm"><div class="text-slate-300/80">${k.replace(/-/g," ")}</div><div class="font-semibold price">${fmtUSD(p[k])}</div></div>`).join("");
    const card=document.createElement("div"); card.className="glass rounded-2xl p-4";
    card.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${p["console-name"]||""}</div><div class="font-semibold wrap-anywhere">${p["product-name"]||""}</div></div>
        <div class="shrink-0 flex items-center gap-3">
          <button class="rounded-lg px-3 py-1 bg-sky-400/20 border border-sky-400/40 text-sm hover:bg-sky-400/30" data-id="${p.id}" data-json='${JSON.stringify(p).replaceAll("'","&apos;")}'>
            + Add
          </button>
        </div>
      </div>
      <div class="mt-3 space-y-1">${priceRows}</div>`;
    container.appendChild(card);
  }
  container.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click",()=>{
      const data = JSON.parse(btn.getAttribute("data-json").replaceAll("&apos;","'"));
      const paid = prompt("Price paid (total USD, optional):","") || "";
      const inv = { id:data.id, productName:data["product-name"], setName:data["console-name"],
        prices:Object.fromEntries(Object.entries(data).filter(([k])=>/-price$/.test(k)||["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
        qty:1, costBasisCents: paid ? Math.round(Number(paid)*100) : 0, note:"", gradeKey:"loose-price" };
      state.inventory.push(inv); logDailySnapshot(); updateStats(); renderInventory();
    });
  });
}

// --- Inventory with "Paid (avg)" and Edit link ---
function renderInventory(){
  const list=$("#inventory-list"); list.innerHTML="";
  if (!state.inventory.length){ list.innerHTML=`<div class="col-span-full text-slate-300/80">No items in ${state.collection}. Use search to add cards.</div>`; return; }
  state.inventory.forEach((it, idx)=>{
    const keys = priceKeysDisplay(it.prices||{});
    const gradeOptions = keys.map(k=>`<option value="${k}" ${k===it.gradeKey?"selected":""}>${GRADE_LABEL(k)}</option>`).join("");
    const avgPaid = (Number(it.costBasisCents||0) / Math.max(1, Number(it.qty||1)))|0;
    const row=document.createElement("div"); row.className="glass rounded-2xl p-4";
    row.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${it.setName||""}</div><div class="font-semibold wrap-anywhere">${it.productName||""}</div></div>
        <div class="shrink-0 flex items-center gap-3">
          <a class="linkish cursor-pointer" data-action="edit">Edit</a>
          <button class="text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Qty</span>
          <input type="number" min="1" value="${it.qty||1}" data-field="qty" class="bg-transparent w-20 outline-none">
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Grade</span>
          <select data-field="grade" class="bg-transparent outline-none w-full min-w-0 truncate">${gradeOptions}</select>
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Paid (total)</span>
          <input type="number" min="0" value="${(it.costBasisCents||0)/100}" step="0.01" data-field="paid" class="bg-transparent w-28 outline-none">
        </label>
        <div class="chip rounded-xl px-3 py-2 overflow-hidden">
          <div class="text-slate-300/70">Est. Value</div>
          <div class="font-semibold price">${fmtUSD(estimateItemValue(it))}</div>
          <div class="text-xs text-slate-300/70 mt-0.5">Paid (avg): <span class="price">${fmtUSD(avgPaid)}</span> • Total: <span class="price">${fmtUSD(it.costBasisCents||0)}</span></div>
        </div>
      </div>
      <textarea placeholder="Notes (purchase details, cert #, comps)" data-field="note" class="mt-3 w-full chip rounded-xl px-3 py-2 bg-transparent outline-none wrap-anywhere">${it.note||""}</textarea>`;
    list.appendChild(row);

    row.querySelector('[data-field="qty"]').addEventListener("input",(e)=>{ it.qty=Number(e.target.value||1); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="grade"]').addEventListener("change",(e)=>{ it.gradeKey=e.target.value; logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="paid"]').addEventListener("input",(e)=>{ it.costBasisCents=Math.round(Number(e.target.value||0)*100); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="note"]').addEventListener("input",(e)=>{ it.note=e.target.value||""; updateStats(); });
    row.querySelector('[data-action="remove"]').addEventListener("click",()=>{ state.inventory.splice(idx,1); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-action="edit"]').addEventListener("click",()=> openEditPrompt(it));
  });
}

function openEditPrompt(it){
  const name = prompt("Card title (optional):", it.productName||"");
  if (name===null) return;
  const setName = prompt("Set (optional):", it.setName||""); if (setName===null) return;
  const qty = Number(prompt("Quantity:", String(it.qty||1))||"0"); if (!qty || qty<=0) return;
  const grade = prompt("Price key / grade (loose-price, graded-price, etc):", it.gradeKey||"loose-price") || it.gradeKey || "loose-price";
  const paid = Number(prompt("Price paid (total USD):", String((it.costBasisCents||0)/100))||"0");
  const note = prompt("Notes:", it.note||"") || "";
  it.productName = name || it.productName;
  it.setName = setName || it.setName;
  it.qty = qty;
  it.gradeKey = grade;
  it.costBasisCents = Math.round(paid*100);
  it.note = note;
  logDailySnapshot(); updateStats(); renderInventory();
}

// --- Watchlist (unchanged minimal) ---
function renderWatchlist(){
  const list=$("#watch-list"); list.innerHTML="";
  if (!state.watchlist.length){ list.innerHTML=`<div class="col-span-full text-slate-300/80">No watchlist items yet.</div>`; return; }
  state.watchlist.forEach((w, idx)=>{
    const row=document.createElement("div"); row.className="glass rounded-2xl p-4";
    row.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0">
          <div class="text-sm text-slate-300/70 wrap-anywhere">${w.setName||""}</div>
          <div class="font-semibold wrap-anywhere">${w.productName||""}</div>
        </div>
        <button class="text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
      </div>`;
    list.appendChild(row);
    row.querySelector('[data-action="remove"]').addEventListener("click",()=>{ state.watchlist.splice(idx,1); updateStats(); renderWatchlist(); });
  });
}

// --- Wire up ---
document.addEventListener("DOMContentLoaded", async ()=>{
  state.user = localStorage.getItem(CACHE.USER) || "guest";
  localStorage.setItem(CACHE.USER, state.user);
  state.collection = localStorage.getItem(CACHE.COLLECTION) || "Personal";
  $("#collection-select").value = state.collection;

  try {
    const snap = JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + state.collection) || "null");
    if (snap){ state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; state.transactions=snap.transactions||[]; }
  } catch {}

  try {
    const cloud = await cloudLoad(state.user, state.collection);
    if (cloud){
      state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
      state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
      state.history = Array.isArray(cloud.history) ? cloud.history : [];
      state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
      state.transactions = Array.isArray(cloud.transactions) ? cloud.transactions : [];
    }
  } catch(e){ console.warn("Cloud load failed", e); }

  updateStats(); renderInventory(); renderWatchlist();

  $("#collection-select").addEventListener("change", async (e)=>{
    state.collection = e.target.value || "Personal";
    localStorage.setItem(CACHE.COLLECTION, state.collection);
    try{
      const snap = JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + state.collection) || "null") || {};
      state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; state.transactions=snap.transactions||[];
    } catch { state.inventory=[]; state.watchlist=[]; state.history=[]; state.sets=[]; state.transactions=[]; }
    updateStats(); renderInventory(); renderWatchlist();
    try {
      const cloud = await cloudLoad(state.user, state.collection);
      if (cloud){
        state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
        state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
        state.history = Array.isArray(cloud.history) ? cloud.history : [];
        state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
        state.transactions = Array.isArray(cloud.transactions) ? cloud.transactions : [];
        updateStats(); renderInventory(); renderWatchlist();
      }
    } catch(e){ console.warn("Cloud load failed", e); }
  });

  $("#search-form").addEventListener("submit",(e)=>{ e.preventDefault(); const q=$("#q").value.trim(); if(q) doSearch(q); });
});
