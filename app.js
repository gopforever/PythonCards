/* CardTrack Pro — Portfolio Analytics & P&L (Average Cost) */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmtUSD = (cents) => (cents==null?0:cents/100).toLocaleString(undefined,{style:"currency",currency:"USD"});

const CACHE = { USER:"ctp.user", SNAP_PREF:"ctp.snap.v1." , COLLECTION:"ctp.collection" };
const state = { user:null, collection:"Personal", inventory:[], watchlist:[], history:[], sets:[], transactions:[], chart:null, allocChart:null, winnersChart:null };

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
function getLocalSnap(col){ try { return JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + col) || "null") || {inventory:[],watchlist:[],history:[],sets:[],transactions:[]}; } catch { return {inventory:[],watchlist:[],history:[],sets:[],transactions:[]}; } }
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
  const cost = holdingsCostFromLedgerFallback(); // use analytics function for consistency
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
  renderAnalytics(); // keep panel fresh if open
  setLocalSnap(state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
  cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
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
      const inv = { id:data.id, productName:data["product-name"], setName:data["console-name"],
        prices:Object.fromEntries(Object.entries(data).filter(([k])=>/-price$/.test(k)||["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
        qty:1, costBasisCents:0, note:"", gradeKey:"loose-price" };
      state.inventory.push(inv); logDailySnapshot(); updateStats(); renderInventory();
    });
  });
}

// --- Inventory UI + Transactions link ---
function renderInventory(){
  const list=$("#inventory-list"); list.innerHTML="";
  if (!state.inventory.length){ list.innerHTML=`<div class="col-span-full text-slate-300/80">No items in ${state.collection}. Use search to add cards.</div>`; return; }
  state.inventory.forEach((it, idx)=>{
    const keys = priceKeysDisplay(it.prices||{});
    const gradeOptions = keys.map(k=>`<option value="${k}" ${k===it.gradeKey?"selected":""}>${GRADE_LABEL(k)}</option>`).join("");
    const row=document.createElement("div"); row.className="glass rounded-2xl p-4";
    row.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${it.setName||""}</div><div class="font-semibold wrap-anywhere">${it.productName||""}</div></div>
        <div class="shrink-0 flex items-center gap-3">
          <a class="linkish cursor-pointer" data-action="txn">Txn</a>
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

    row.querySelector('[data-field="qty"]').addEventListener("input",(e)=>{ it.qty=Number(e.target.value||1); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="grade"]').addEventListener("change",(e)=>{ it.gradeKey=e.target.value; logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="cost"]').addEventListener("input",(e)=>{ it.costBasisCents=Math.round(Number(e.target.value||0)*100); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-field="note"]').addEventListener("input",(e)=>{ it.note=e.target.value||""; updateStats(); });
    row.querySelector('[data-action="remove"]').addEventListener("click",()=>{ state.inventory.splice(idx,1); logDailySnapshot(); updateStats(); renderInventory(); });
    row.querySelector('[data-action="txn"]').addEventListener("click",()=> openTxnPrompt(it));
  });
}

function openTxnPrompt(it){
  const type = prompt("Transaction type (BUY or SELL):","BUY"); if (type===null) return;
  const t = (type||"").trim().toUpperCase(); if (!["BUY","SELL"].includes(t)) { alert("Use BUY or SELL"); return; }
  const qty = Number(prompt("Quantity:", "1") || "0"); if (!qty || qty<=0) return;
  const amt = Number(prompt(t==="BUY" ? "Total purchase amount (USD):" : "Total sale amount (USD):", "0") || "0");
  const fees = Number(prompt("Fees (USD, optional):","0") || "0");
  const date = prompt("Date (YYYY-MM-DD, default=today):", todayISO()) || todayISO();
  const note = prompt("Note (optional):","") || "";
  const rec = { id: it.id, productName: it.productName, setName: it.setName, type: t, qty, amountCents: Math.round(amt*100), feesCents: Math.round(fees*100), date, ts: new Date().toISOString(), note };
  state.transactions.push(rec);
  // also adjust item's stored costBasis as a helpful mirror for users who don't exclusively use the ledger
  if (t==="BUY"){
    const totalCost = rec.amountCents + rec.feesCents;
    const prevQty = Number(it.qty||0), prevCost = Number(it.costBasisCents||0);
    const newQty = prevQty + qty;
    const newCost = prevCost + totalCost;
    it.qty = newQty; it.costBasisCents = newCost;
  } else if (t==="SELL"){
    // decrement qty but leave cost for unrealized calc to analytics
    it.qty = Math.max(0, Number(it.qty||0) - qty);
  }
  logDailySnapshot(); updateStats(); renderInventory();
}

// --- Analytics (Average Cost from transactions; fallback to inventory) ---
function sortISO(a,b){ return String(a).localeCompare(String(b)); }

function computeHoldingsFromLedger(){
  // per-id: { qty, costCents, realizedCents }
  const map = new Map();
  const txns = (state.transactions||[]).slice().sort((a,b)=> sortISO(a.date,a.date) - sortISO(b.date));
  for (const t of txns){
    const id = t.id; if (!id) continue;
    if (!map.has(id)) map.set(id, { qty:0, costCents:0, realizedCents:0, name:t.productName||String(id), set:t.setName||"" });
    const rec = map.get(id);
    if (t.type === "BUY"){
      const total = Number(t.amountCents||0) + Number(t.feesCents||0);
      rec.qty += Number(t.qty||0);
      rec.costCents += total;
    } else if (t.type === "SELL"){
      const qty = Number(t.qty||0);
      const proceeds = Number(t.amountCents||0) - Number(t.feesCents||0);
      const avgCostPer = rec.qty>0 ? (rec.costCents / rec.qty) : 0;
      const costOut = Math.min(qty, rec.qty) * avgCostPer;
      rec.qty = Math.max(0, rec.qty - qty);
      rec.costCents = Math.max(0, rec.costCents - costOut);
      rec.realizedCents += (proceeds - costOut);
    }
  }
  return map;
}

function holdingsCostFromLedgerFallback(){
  const ledger = computeHoldingsFromLedger();
  // Map inventory ids to ledger costs; if missing, fallback to item costBasis
  let totalCost = 0;
  const invById = new Map();
  for (const it of state.inventory){ invById.set(String(it.id), it); }
  for (const [id, h] of ledger){
    if (h.qty <= 0) continue;
    // If inventory shows different qty, we proportionally scale cost basis to inventory qty
    const it = invById.get(String(id));
    const qtyInv = it ? Number(it.qty||0) : h.qty;
    if (qtyInv <= 0) continue;
    const avg = h.costCents / (h.qty || 1);
    totalCost += avg * qtyInv;
  }
  // Add any inventory items not present in ledger using their own costBasis
  for (const it of state.inventory){
    const id = String(it.id);
    if (!ledger.has(id)){
      totalCost += Number(it.costBasisCents||0);
    }
  }
  return Math.round(totalCost);
}

function computeAnalytics(){
  const market = state.inventory.reduce((a,it)=>a+estimateItemValue(it),0);
  const ledger = computeHoldingsFromLedger();
  const invById = new Map(); for (const it of state.inventory){ invById.set(String(it.id), it); }

  let holdCost = 0, realized = 0;
  const per = []; // per product summary
  for (const [id, h] of ledger){
    realized += h.realizedCents||0;
    if (h.qty > 0){
      const it = invById.get(String(id));
      const qtyInv = it ? Number(it.qty||0) : h.qty;
      const avg = h.costCents / (h.qty || 1);
      const costHere = avg * qtyInv;
      holdCost += costHere;
      const mktHere = it ? estimateItemValue(it) : 0;
      per.push({ id, name: h.name, set: h.set, cost: costHere, market: mktHere, pl: mktHere - costHere });
    }
  }
  // add non-ledger items (fallback)
  for (const it of state.inventory){
    const id = String(it.id);
    if (!ledger.has(id)){
      const costHere = Number(it.costBasisCents||0);
      const mktHere = estimateItemValue(it);
      holdCost += costHere;
      per.push({ id, name: it.productName, set: it.setName, cost: costHere, market: mktHere, pl: mktHere - costHere });
    }
  }
  const unreal = market - holdCost;
  // winners/losers
  const winners = per.slice().sort((a,b)=> (b.pl||0)-(a.pl||0)).slice(0,5);
  const losers = per.slice().sort((a,b)=> (a.pl||0)-(b.pl||0)).slice(0,5);

  // allocation by set (market value)
  const allocMap = new Map();
  for (const it of state.inventory){
    const key = it.setName || "Unknown Set";
    const val = estimateItemValue(it);
    allocMap.set(key, (allocMap.get(key)||0) + val);
  }
  const allocation = Array.from(allocMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);

  // ROI on holdings
  const roi = holdCost>0 ? (unreal/holdCost)*100 : 0;

  return { market, holdCost: Math.round(holdCost), unreal: Math.round(unreal), realized: Math.round(realized), roi, winners, losers, allocation };
}

function renderAnalytics(){
  const card = $("#analytics-card"); if (!card || card.classList.contains("hidden")) return;
  const a = computeAnalytics();
  $("#pnl-market").textContent = fmtUSD(a.market);
  $("#pnl-cost").textContent = fmtUSD(a.holdCost);
  $("#pnl-unreal").textContent = fmtUSD(a.unreal);
  $("#pnl-real").textContent = fmtUSD(a.realized);
  $("#pnl-roi").textContent = `${(a.roi||0).toFixed(1)}%`;

  // Allocation chart (doughnut)
  const allocEl = $("#allocChart");
  const labels = a.allocation.map(([k])=>k);
  const data = a.allocation.map(([,v])=>Math.round(v/100));
  if (!state.allocChart){
    state.allocChart = new Chart(allocEl, { type:"doughnut", data:{ labels, datasets:[{ data }] },
      options:{ responsive:true, plugins:{ legend:{labels:{color:"#e7eaf3"} } } } });
  } else {
    state.allocChart.data.labels = labels; state.allocChart.data.datasets[0].data = data; state.allocChart.update();
  }

  // Winners/Losers (horizontal bar; positive on top 5, negative bottom 5)
  const wEl = $("#winnersChart");
  const w = a.winners.map(x=>({label:x.name, val: Math.round(x.pl/100)}));
  const l = a.losers.map(x=>({label:x.name, val: Math.round(x.pl/100)})).reverse(); // show losers (negatives) first
  const labels2 = l.map(x=>x.label).concat(w.map(x=>x.label));
  const data2 = l.map(x=>x.val).concat(w.map(x=>x.val));
  if (!state.winnersChart){
    state.winnersChart = new Chart(wEl, { type:"bar", data:{ labels: labels2, datasets:[{ label:"P/L (USD)", data: data2 }] },
      options:{ indexAxis:"y", responsive:true, plugins:{ legend:{labels:{color:"#e7eaf3"}} }, scales:{ x:{ticks:{color:"#9aa3b2"}}, y:{ticks:{color:"#9aa3b2"}} } } });
  } else {
    state.winnersChart.data.labels = labels2; state.winnersChart.data.datasets[0].data = data2; state.winnersChart.update();
  }
}

// --- CSV helpers (unchanged essentials for inventory) ---
const CSV_HEADERS = ["id","productName","setName","qty","gradeKey","costBasis","loose-price","graded-price","new-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price","note"];
function toCSVValue(v){ if (v == null) return ""; const s = String(v); if (/[\",\\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`; return s; }
function buildCSV(rows){ const lines = []; lines.push(CSV_HEADERS.join(",")); for (const r of rows){ const vals = CSV_HEADERS.map(h => toCSVValue(r[h])); lines.push(vals.join("\\n".includes(",")?",":" ,").replace(" ,",",")); } return lines.join("\n"); }
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
      else if (c === '\n' || c === '\r'){ if (c=='\r' && text[i+1]=='\n') i++; pushField(); pushRow(); i++; }
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
  // header only if empty
  const headers = ["id","productName","setName","qty","gradeKey","costBasis","loose-price","graded-price","new-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price","note"];
  const lines = [headers.join(",")];
  for (const r of rows){
    const vals = headers.map(h => toCSVValue(r[h]));
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

// --- Wire ---
document.addEventListener("DOMContentLoaded", async ()=>{
  state.user = localStorage.getItem(CACHE.USER) || "guest";
  localStorage.setItem(CACHE.USER, state.user);
  state.collection = localStorage.getItem(CACHE.COLLECTION) || "Personal";
  $("#collection-select").value = state.collection;

  try {
    const snap = getLocalSnap(state.collection);
    state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; state.transactions=snap.transactions||[];
  } catch {}

  try {
    const cloud = await cloudLoad(state.user, state.collection);
    if (cloud){
      state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
      state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
      state.history = Array.isArray(cloud.history) ? cloud.history : [];
      state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
      state.transactions = Array.isArray(cloud.transactions) ? cloud.transactions : (Array.isArray(cloud.txns) ? cloud.txns : []);
    }
  } catch(e){ console.warn("Cloud load failed", e); }

  updateStats(); renderInventory(); renderAnalytics();

  $("#collection-select").addEventListener("change", async (e)=>{
    state.collection = e.target.value || "Personal";
    localStorage.setItem(CACHE.COLLECTION, state.collection);
    try{
      const snap = getLocalSnap(state.collection);
      state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; state.transactions=snap.transactions||[];
    } catch { state.inventory=[]; state.watchlist=[]; state.history=[]; state.sets=[]; state.transactions=[]; }
    updateStats(); renderInventory(); renderAnalytics();
    try {
      const cloud = await cloudLoad(state.user, state.collection);
      if (cloud){
        state.inventory = Array.isArray(cloud.inventory) ? cloud.inventory : [];
        state.watchlist = Array.isArray(cloud.watchlist) ? cloud.watchlist : [];
        state.history = Array.isArray(cloud.history) ? cloud.history : [];
        state.sets = Array.isArray(cloud.sets) ? cloud.sets : [];
        state.transactions = Array.isArray(cloud.transactions) ? cloud.transactions : (Array.isArray(cloud.txns) ? cloud.txns : []);
        updateStats(); renderInventory(); renderAnalytics();
      }
    } catch(e){ console.warn("Cloud load failed", e); }
  });

  $("#search-form").addEventListener("submit",(e)=>{ e.preventDefault(); const q=$("#q").value.trim(); if(q) doSearch(q); });

  // JSON import/export
  $("#export-json").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({inventory:state.inventory,watchlist:state.watchlist,history:state.history,sets:state.sets,transactions:state.transactions},null,2)],{type:"application/json"});
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
      if(Array.isArray(obj.transactions)) state.transactions=obj.transactions;
      logDailySnapshot(); updateStats(); renderInventory(); renderAnalytics();
      await cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
    } catch { alert("Failed to import JSON"); }
  });

  // CSV import/export
  $("#export-csv").addEventListener("click",()=>{
    const rows = inventoryToCSVRows();
    const csv = rows.length ? [CSV_HEADERS.join(","), ...rows.map(r=>CSV_HEADERS.map(h=>toCSVValue(r[h])).join(","))].join("\\n") : CSV_HEADERS.join(",");
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
      logDailySnapshot(); updateStats(); renderInventory(); renderAnalytics();
      await cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
    } catch(err){ console.error(err); alert("Failed to import CSV"); }
  });

  // CSV template
  $("#csv-template").addEventListener("click",()=>{
    const includeExample = confirm("Include a sample example row?");
    const csv = buildTemplateCSV(includeExample);
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="cardtrack_pro_template.csv"; a.click(); URL.revokeObjectURL(url);
  });

  // Analytics toggles
  $("#toggle-history")?.addEventListener("click",()=>{
    const card=$("#history-card"); if (!card) return; card.classList.toggle("hidden"); if (!card.classList.contains("hidden")) renderChart();
  });
  $("#toggle-sets")?.addEventListener("click",()=>{
    const card=$("#sets-card"); if (!card) return; card.classList.toggle("hidden");
  });
  $("#toggle-analytics")?.addEventListener("click",()=>{
    const card=$("#analytics-card"); if (!card) return; card.classList.toggle("hidden"); if (!card.classList.contains("hidden")) renderAnalytics();
  });

  // Ledger import/export
  $("#export-ledger").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({transactions:state.transactions},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`cardtrack_pro_ledger_${state.collection}.json`; a.click(); URL.revokeObjectURL(url);
  });
  $("#import-ledger").addEventListener("click",()=> $("#import-ledger-file").click());
  $("#import-ledger-file").addEventListener("change", async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try{ const text=await file.text(); const obj=JSON.parse(text);
      if(Array.isArray(obj.transactions)) state.transactions = obj.transactions;
      logDailySnapshot(); updateStats(); renderAnalytics();
      await cloudSave(state.user, state.collection, { inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets, transactions:state.transactions });
    } catch { alert("Failed to import ledger"); }
  });
});
