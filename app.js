/* CardTrack Pro — Set Details View (Owned vs Missing + Quick Add) */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmtUSD = (cents) => (cents==null?0:cents/100).toLocaleString(undefined,{style:"currency",currency:"USD"});

const CACHE = { USER:"ctp.user", SNAP_PREF:"ctp.snap.v1." , COLLECTION:"ctp.collection" };
const state = { user:null, collection:"Personal", inventory:[], watchlist:[], history:[], sets:[], chart:null, expandedSets:{} };

function debounce(fn, ms=600){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

async function cloudLoad(user, collection){
  const res = await fetch(`/.netlify/functions/storage?user=${encodeURIComponent(user)}&collection=${encodeURIComponent(collection)}`, { headers:{ "accept":"application/json" } });
  if (!res.ok) throw new Error(`load ${res.status}`);
  return await res.json();
}
const cloudSave = debounce(async (user, collection, data)=>{
  await fetch(`/.netlify/functions/storage`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user, collection, data }) });
}, 600);

// local snapshot helpers
function getLocalSnap(col){ try { return JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + col) || "null") || {inventory:[],watchlist:[],history:[],sets:[]}; } catch { return {inventory:[],watchlist:[],history:[],sets:[]}; } }
function setLocalSnap(col, data){ localStorage.setItem(CACHE.SNAP_PREF + col, JSON.stringify(data)); }

// --- Pricing calc ---
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
  renderChart();
  setLocalSnap(state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets });
  cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets });
}

// --- Chart ---
function renderChart(){
  const canvas = $("#valueChart"); if (!canvas) return;
  const labels = state.history.map(p=>p.date);
  const est = state.history.map(p=>p.estCents/100);
  const cost = state.history.map(p=>p.costCents/100);
  if (!state.chart){
    state.chart = new Chart(canvas, { type:"line", data:{ labels, datasets:[ {label:"Est. Value", data:est, tension:.25}, {label:"Cost Basis", data:cost, tension:.25} ] },
      options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
        plugins:{ legend:{labels:{color:"#e7eaf3"}}, tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ${c.parsed.y.toLocaleString(undefined,{style:'currency',currency:'USD'})}`}} },
        scales:{ x:{ticks:{color:"#9aa3b2"}, grid:{color:"rgba(255,255,255,.06)"}}, y:{ticks:{color:"#9aa3b2"}, grid:{color:"rgba(255,255,255,.06)"}} } } });
  } else { state.chart.data.labels=labels; state.chart.data.datasets[0].data=est; state.chart.data.datasets[1].data=cost; state.chart.update(); }
}

// --- Search ---
function priceKeysDisplay(obj){
  const preferred=["loose-price","graded-price","manual-only-price","new-price","cib-price","bgs-10-price","condition-17-price","condition-18-price"];
  const keys=preferred.filter(k=>obj[k]!=null); Object.keys(obj).forEach(k=>{ if (/-price$/.test(k) && !keys.includes(k)) keys.push(k); }); return keys;
}
const GRADE_LABEL = (k) => {
  const map = { "loose-price":"Loose", "graded-price":"Graded", "new-price":"New", "cib-price":"CIB", "manual-only-price":"Manual", "bgs-10-price":"BGS 10", "condition-17-price":"Cond 17", "condition-18-price":"Cond 18" };
  return map[k] || k.replace(/-/g," ").replace(/\b\w/g, s=>s.toUpperCase());
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
    const trackSetLink = p["console-name"] ? `<a class="linkish cursor-pointer" data-track-set="${p["console-name"].replace(/\"/g,'&quot;')}">☆ Track Set</a>` : "";
    card.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${p["console-name"]||""}</div><div class="font-semibold wrap-anywhere">${p["product-name"]||""}</div></div>
        <div class="shrink-0 flex items-center gap-3">
          ${trackSetLink}
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
      const inv = { id:data.id, productName:data["product-name"], setName:data["console-name"],
        prices:Object.fromEntries(Object.entries(data).filter(([k])=>/-price$/.test(k)||["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
        qty:1, costBasisCents:0, note:"", gradeKey:"loose-price" };
      state.inventory.push(inv); logDailySnapshot(); updateStats(); renderInventory(); renderSets();
    });
  });
  container.querySelectorAll("[data-track-set]").forEach(a => {
    a.addEventListener("click", async ()=>{
      const setName = a.getAttribute("data-track-set");
      await addOrRefreshSet(setName, true);
    });
  });
}

// --- Inventory UI ---
function renderInventory(){
  const list=$("#inventory-list"); list.innerHTML="";
  if (!state.inventory.length){ list.innerHTML=`<div class="col-span-full text-slate-300/80">No items in ${state.collection}. Use search to add cards.</div>`; return; }
  state.inventory.forEach((it, idx)=>{
    const keys = priceKeysDisplay(it.prices);
    const gradeOptions = keys.map(k=>`<option value="${k}" ${k===it.gradeKey?"selected":""}>${GRADE_LABEL(k)}</option>`).join("");
    const row=document.createElement("div"); row.className="glass rounded-2xl p-4";
    row.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${it.setName||""}</div><div class="font-semibold wrap-anywhere">${it.productName||""}</div></div>
        <button class="shrink-0 text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
      </div>
      <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Qty</span>
          <input type="number" min="1" value="${it.qty}" data-field="qty" class="bg-transparent w-20 outline-none">
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Grade</span>
          <select data-field="grade" class="bg-transparent outline-none w-full min-w-0 truncate">${gradeOptions}</select>
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
          <span class="text-slate-300/70">Cost</span>
          <input type="number" min="0" value="${(it.costBasisCents||0)/100}" step="0.01" data-field="cost" class="bg-transparent w-28 outline-none">
        </label>
        <div class="chip rounded-xl px-3 py-2 overflow-hidden">
          <div class="text-slate-300/70">Est. Value</div>
          <div class="font-semibold price">${fmtUSD(estimateItemValue(it))}</div>
        </div>
      </div>
      <textarea placeholder="Notes (purchase details, cert #, comps)" data-field="note" class="mt-3 w-full chip rounded-xl px-3 py-2 bg-transparent outline-none wrap-anywhere">${it.note||""}</textarea>`;
    list.appendChild(row);

    row.querySelector('[data-field="qty"]').addEventListener("input",(e)=>{ it.qty=Number(e.target.value||1); logDailySnapshot(); updateStats(); renderInventory(); renderSets(); });
    row.querySelector('[data-field="grade"]').addEventListener("change",(e)=>{ it.gradeKey=e.target.value; logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="cost"]').addEventListener("input",(e)=>{ it.costBasisCents=Math.round(Number(e.target.value||0)*100); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="note"]').addEventListener("input",(e)=>{ it.note=e.target.value||""; updateStats(); });
    row.querySelector('[data-action="remove"]').addEventListener("click",()=>{ state.inventory.splice(idx,1); logDailySnapshot(); updateStats(); renderInventory(); renderSets(); });
  });
}

// --- Sets (with details) ---
async function fetchSetChecklist(setName){
  const r = await fetch(`/.netlify/functions/setlist?q=${encodeURIComponent(setName)}`);
  if (!r.ok) throw new Error("setlist fetch failed");
  return await r.json();
}
async function fetchProductById(id){
  const r = await fetch(`/.netlify/functions/prices?type=product&id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("product fetch failed");
  return await r.json();
}
async function addOrRefreshSet(setName, showAlert=false){
  if (!setName) return;
  try{
    const data = await fetchSetChecklist(setName);
    if (!data || !Array.isArray(data.cards) || data.cards.length===0){ if(showAlert) alert("No checklist found for that set."); return; }
    let s = state.sets.find(x => (x.title||x.key) === setName);
    if (!s){
      s = { key: setName, title: setName, total: data.total||data.cards.length, cards: data.cards, lastSync: new Date().toISOString() };
      state.sets.push(s);
    } else {
      s.cards = data.cards; s.total = data.total||data.cards.length; s.lastSync = new Date().toISOString();
    }
    updateStats(); renderSets(); if (showAlert) alert(`Tracking set: ${setName}`);
  } catch(e){ console.warn(e); if (showAlert) alert("Failed to load set checklist."); }
}
function computeOwnedForSet(s){
  const ids = new Set(state.inventory.map(it => it.id));
  let owned = 0;
  for (const c of (s.cards||[])){ if (ids.has(c.id)) owned++; }
  return { owned, total: s.total || (s.cards?.length||0) };
}
function makeSetDetailsHTML(s, start=0, batch=20){
  const invIds = new Set(state.inventory.map(it => it.id));
  const owned = (s.cards||[]).filter(c => invIds.has(c.id));
  const missing = (s.cards||[]).filter(c => !invIds.has(c.id));
  const slice = (arr) => arr.slice(start, start+batch);
  const ownSlice = slice(owned);
  const missSlice = slice(missing);
  const missIdsCSV = missSlice.map(m=>m.id).join(",");

  const li = (c, own=false) => `<div class="flex items-center justify-between gap-2 text-xs">
    <div class="min-w-0 wrap-anywhere">${c.number?`#${c.number} — `:""}${c.name}</div>
    ${own ? `<span class="text-emerald-300/80">Owned</span>` : `<a class="linkish cursor-pointer" data-action="add-one" data-id="${c.id}">Add</a>`}
  </div>`;

  return `
    <div class="mt-2 rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-slate-300/70">Showing ${start+1}-${Math.min(start+batch, Math.max(owned.length, missing.length))} of ${Math.max(owned.length, missing.length)} per list</div>
        <div class="flex items-center gap-2">
          ${missSlice.length ? `<button class="text-xs rounded-lg px-2 py-1 bg-sky-400/20 border border-sky-400/40 hover:bg-sky-400/30" data-action="add-visible" data-ids="${missIdsCSV}">Add all visible missing</button>` : ""}
          ${(start+batch) < Math.max(owned.length, missing.length) ? `<a class="linkish cursor-pointer" data-action="more" data-next="${start+batch}">Show more</a>` : ""}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <div class="font-medium text-sm mb-1">Owned (${owned.length})</div>
          <div class="space-y-1">${ownSlice.map(c=>li(c,true)).join("") || `<div class="text-xs text-slate-300/70">None yet</div>`}</div>
        </div>
        <div>
          <div class="font-medium text-sm mb-1">Missing (${missing.length})</div>
          <div class="space-y-1">${missSlice.map(c=>li(c,false)).join("") || `<div class="text-xs text-slate-300/70">All caught up 🎉</div>`}</div>
        </div>
      </div>
    </div>
  `;
}
function renderSets(){
  const wrap = $("#sets-list"); if (!wrap) return;
  wrap.innerHTML = "";
  if (!state.sets.length){ wrap.innerHTML = `<div class="text-slate-300/80 text-sm">No sets yet. Click <span class="underline">+ Add</span> or use “☆ Track Set” on a search result.</div>`; return; }
  state.sets.forEach((s, idx)=>{
    const {owned, total} = computeOwnedForSet(s);
    const pct = total ? Math.round((owned / total) * 100) : 0;
    const row = document.createElement("div");
    const isOpen = !!state.expandedSets[s.title];
    row.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex items-center gap-2">
            <button class="text-xs rounded-md px-2 py-1 bg-white/5 border border-white/10 hover:bg-white/10" data-action="toggle">${isOpen ? "▾" : "▸"}</button>
            <div>
              <div class="font-medium text-sm wrap-anywhere">${s.title}</div>
              <div class="text-xs text-slate-300/70">${owned}/${total} • ${pct}%</div>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <a class="linkish cursor-pointer" data-action="refresh">Sync</a>
            <a class="linkish cursor-pointer" data-action="remove">Remove</a>
          </div>
        </div>
        <div class="bar"><div style="width:${pct}%;"></div></div>
        <div class="details ${isOpen ? "" : "hidden"}" data-start="0"></div>
      </div>
    `;
    wrap.appendChild(row);

    const details = row.querySelector(".details");
    if (isOpen){ details.innerHTML = makeSetDetailsHTML(s, Number(details.getAttribute("data-start"))||0, 20); }

    row.querySelector('[data-action="toggle"]').addEventListener("click", ()=>{
      const open = !state.expandedSets[s.title];
      state.expandedSets[s.title] = open;
      renderSets();
    });
    row.querySelector('[data-action="refresh"]').addEventListener("click", ()=> addOrRefreshSet(s.title, true));
    row.querySelector('[data-action="remove"]').addEventListener("click", ()=>{ state.sets.splice(idx,1); updateStats(); renderSets(); });

    row.addEventListener("click", async (e)=>{
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.dataset.action === "more"){
        const next = Number(t.dataset.next)||0;
        details.setAttribute("data-start", String(next));
        details.innerHTML = makeSetDetailsHTML(s, next, 20);
      }
      if (t.dataset.action === "add-one"){
        const id = t.dataset.id;
        if (!id) return;
        try{
          t.textContent = "Adding…"; t.classList.add("pointer-events-none","opacity-60");
          const p = await fetchProductById(id);
          const data = p.products ? p.products[0] : p; // handle either single or array shape
          if (data && data.id){
            const inv = { id:data.id, productName:data["product-name"], setName:data["console-name"],
              prices:Object.fromEntries(Object.entries(data).filter(([k])=>/-price$/.test(k)||["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
              qty:1, costBasisCents:0, note:"", gradeKey:"loose-price" };
            state.inventory.push(inv); logDailySnapshot(); updateStats(); renderInventory(); renderSets();
          } else { alert("Could not fetch product details."); }
        } catch(e){ console.warn(e); alert("Failed to add item."); }
      }
      if (t.dataset.action === "add-visible"){
        const ids = (t.dataset.ids||"").split(",").filter(Boolean);
        t.textContent = "Adding…"; t.classList.add("pointer-events-none","opacity-60");
        for (const id of ids){
          try{
            const p = await fetchProductById(id);
            const data = p.products ? p.products[0] : p;
            if (data && data.id){
              const inv = { id:data.id, productName:data["product-name"], setName:data["console-name"],
                prices:Object.fromEntries(Object.entries(data).filter(([k])=>/-price$/.test(k)||["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
                qty:1, costBasisCents:0, note:"", gradeKey:"loose-price" };
              // avoid duplicates by id in this collection
              if (!state.inventory.some(it => String(it.id)===String(data.id))) state.inventory.push(inv);
            }
          } catch {}
        }
        logDailySnapshot(); updateStats(); renderInventory(); renderSets();
      }
    });
  });
}

// --- CSV helpers ---
const CSV_HEADERS = ["id","productName","setName","qty","gradeKey","costBasis","loose-price","graded-price","new-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price","note"];
function toCSVValue(v){ if (v == null) return ""; const s = String(v); if (/[\",\\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`; return s; }
function buildCSV(rows){ const lines = []; lines.push(CSV_HEADERS.join(",")); for (const r of rows){ const vals = CSV_HEADERS.map(h => toCSVValue(r[h])); lines.push(vals.join(",")); } return lines.join("\\n"); }
function parseCSV(text){
  const rows = []; let i=0, field="", row=[], inQuotes=false;
  function pushField(){ row.push(field); field=""; }
  function pushRow(){ rows.push(row); row=[]; }
  while (i < text.length){
    const c = text[i];
    if (inQuotes){
      if (c === '"'){ if (text[i+1] === '"'){ field+='"'; i+=2; } else { inQuotes=false; i++; } }
      else { field += c; i++; }
    } else {
      if (c === '"'){ inQuotes=true; i++; }
      else if (c === ','){ pushField(); i++; }
      else if (c === '\\n' || c === '\\r'){ if (c==='\\r' && text[i+1]==='\\n') i++; pushField(); pushRow(); i++; }
      else { field += c; i++; }
    }
  }
  pushField(); pushRow();
  const header = rows.shift() || [];
  const objs = rows.filter(r => r.some(x => x && x.trim().length)).map(r => { const o = {}; header.forEach((h,idx)=>{ o[h] = r[idx] ?? ""; }); return o; });
  return { header, rows: objs };
}
function inventoryToCSVRows(){
  return state.inventory.map(it => ({
    id: it.id || "",
    productName: it.productName || "",
    setName: it.setName || "",
    qty: it.qty ?? 1,
    gradeKey: it.gradeKey || "loose-price",
    costBasis: ((it.costBasisCents||0)/100).toFixed(2),
    "loose-price": it.prices?.["loose-price"] ?? "",
    "graded-price": it.prices?.["graded-price"] ?? "",
    "new-price": it.prices?.["new-price"] ?? "",
    "cib-price": it.prices?.["cib-price"] ?? "",
    "manual-only-price": it.prices?.["manual-only-price"] ?? "",
    "bgs-10-price": it.prices?.["bgs-10-price"] ?? "",
    "condition-17-price": it.prices?.["condition-17-price"] ?? "",
    "condition-18-price": it.prices?.["condition-18-price"] ?? "",
    note: it.note || ""
  }));
}
function csvRowsToInventory(objs){
  const inv = [];
  for (const o of objs){
    const prices = {
      "loose-price": numOrNull(o["loose-price"]),
      "graded-price": numOrNull(o["graded-price"]),
      "new-price": numOrNull(o["new-price"]),
      "cib-price": numOrNull(o["cib-price"]),
      "manual-only-price": numOrNull(o["manual-only-price"]),
      "bgs-10-price": numOrNull(o["bgs-10-price"]),
      "condition-17-price": numOrNull(o["condition-17-price"]),
      "condition-18-price": numOrNull(o["condition-18-price"]),
    };
    Object.keys(prices).forEach(k=>{ if (prices[k]==null || prices[k]==="") delete prices[k]; });
    inv.push({
      id: o.id || "",
      productName: o.productName || "",
      setName: o.setName || "",
      prices,
      qty: Number(o.qty || 1),
      costBasisCents: Math.round(Number(o.costBasis || 0) * 100),
      note: o.note || "",
      gradeKey: (o.gradeKey || "loose-price")
    });
  }
  return inv;
}
function numOrNull(v){ if (v==null || v==="") return null; const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; }

function buildTemplateCSV(includeExample){
  const rows = [];
  if (includeExample){
    rows.push({
      id: "12345",
      productName: "2017 Prizm Patrick Mahomes #269 Rookie",
      setName: "Football > 2017 Panini Prizm",
      qty: 1,
      gradeKey: "graded-price",
      costBasis: "250.00",
      "loose-price": "",
      "graded-price": 32500,
      "new-price": "",
      "cib-price": "",
      "manual-only-price": "",
      "bgs-10-price": "",
      "condition-17-price": "",
      "condition-18-price": "",
      note: "PSA 10; bought at show"
    });
  }
  return buildCSV(rows);
}

// --- Wire ---
document.addEventListener("DOMContentLoaded", async ()=>{
  state.user = localStorage.getItem(CACHE.USER) || "guest";
  localStorage.setItem(CACHE.USER, state.user);
  state.collection = localStorage.getItem(CACHE.COLLECTION) || "Personal";
  $("#collection-select").value = state.collection;

  try {
    const snap = getLocalSnap(state.collection);
    state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[];
  } catch {}

  try {
    const cloud = await cloudLoad(state.user, state.collection);
    if (cloud){
      state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
      state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
      state.history = Array.isArray(cloud.history) ? cloud.history : [];
      state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
    }
  } catch(e){ console.warn("Cloud load failed", e); }

  updateStats(); renderInventory(); renderSets();

  $("#collection-select").addEventListener("change", async (e)=>{
    state.collection = e.target.value || "Personal";
    localStorage.setItem(CACHE.COLLECTION, state.collection);
    try{
      const snap = getLocalSnap(state.collection);
      state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[];
    } catch { state.inventory=[]; state.watchlist=[]; state.history=[]; state.sets=[]; }
    updateStats(); renderInventory(); renderSets();
    try {
      const cloud = await cloudLoad(state.user, state.collection);
      if (cloud){
        state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
        state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
        state.history = Array.isArray(cloud.history) ? cloud.history : [];
        state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
        updateStats(); renderInventory(); renderSets();
      }
    } catch(e){ console.warn("Cloud load failed", e); }
  });

  $("#search-form").addEventListener("submit",(e)=>{ e.preventDefault(); const q=$("#q").value.trim(); if(q) doSearch(q); });

  $("#export-json").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({inventory:state.inventory,watchlist:state.watchlist,history:state.history,sets:state.sets},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`cardtrack_pro_export_${state.collection}.json`; a.click(); URL.revokeObjectURL(url);
  });
  $("#import-json").addEventListener("click",()=>$("#import-file").click());
  $("#import-file").addEventListener("change", async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try{ const text=await file.text(); const obj=JSON.parse(text);
      if(Array.isArray(obj.inventory)) state.inventory=obj.inventory;
      if(Array.isArray(obj.watchlist)) state.watchlist=obj.watchlist;
      if(Array.isArray(obj.history)) state.history=obj.history;
      if(Array.isArray(obj.sets)) state.sets=obj.sets;
      logDailySnapshot(); updateStats(); renderInventory(); renderSets();
      await cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets });
    } catch { alert("Failed to import JSON"); }
  });

  $("#export-csv").addEventListener("click",()=>{
    const rows = inventoryToCSVRows();
    const csv = buildCSV(rows);
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`cardtrack_pro_inventory_${state.collection}.csv`; a.click(); URL.revokeObjectURL(url);
  });
  $("#import-csv").addEventListener("click",()=>$("#import-file-csv").click());
  $("#import-file-csv").addEventListener("change", async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      const parsed = parseCSV(text);
      const need = ["productName","setName","qty","gradeKey","costBasis","note"];
      const missing = need.filter(h => !parsed.header.includes(h));
      if (missing.length){ alert("Missing CSV headers: " + missing.join(", ")); return; }
      const inv = csvRowsToInventory(parsed.rows);
      state.inventory = inv;
      logDailySnapshot(); updateStats(); renderInventory(); renderSets();
      await cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets });
    } catch(err){ console.error(err); alert("Failed to import CSV"); }
  });

  $("#csv-template").addEventListener("click",()=>{
    const includeExample = confirm("Include a sample example row?");
    const csv = buildTemplateCSV(includeExample);
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="cardtrack_pro_template.csv"; a.click(); URL.revokeObjectURL(url);
  });

  $("#toggle-history")?.addEventListener("click",()=>{
    const card=$("#history-card"); if (!card) return; card.classList.toggle("hidden"); if (!card.classList.contains("hidden")) renderChart();
  });
  $("#toggle-sets")?.addEventListener("click",()=>{
    const card=$("#sets-card"); if (!card) return; card.classList.toggle("hidden"); if (!card.classList.contains("hidden")) renderSets();
  });
  $("#add-set")?.addEventListener("click", async ()=>{
    const q = prompt("Enter a set name exactly as shown in results (e.g., 'Football > 2017 Panini Prizm')");
    if (!q) return;
    await addOrRefreshSet(q, true);
  });
});
