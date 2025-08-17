/* CardTrack Pro — Watchlist Price Alerts */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmtUSD = (cents) => (cents==null?0:cents/100).toLocaleString(undefined,{style:"currency",currency:"USD"});

const CACHE = { USER:"ctp.user", SNAP_PREF:"ctp.snap.v1." , COLLECTION:"ctp.collection" };
const state = { user:null, collection:"Personal", inventory:[], watchlist:[], history:[], sets:[], chart:null };

function debounce(fn, ms=600){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

async function cloudLoad(user, collection){
  const res = await fetch(`/.netlify/functions/storage?user=${encodeURIComponent(user)}&collection=${encodeURIComponent(collection)}`, { headers:{ "accept":"application/json" } });
  if (!res.ok) throw new Error(`load ${res.status}`);
  return await res.json();
}
const cloudSave = debounce(async (user, collection, data)=>{
  await fetch(`/.netlify/functions/storage`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user, collection, data }) });
}, 600);

// --- Totals/History ---
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
  localStorage.setItem(CACHE.SNAP_PREF + state.collection, JSON.stringify({ inventory:state.inventory, watchlist:state.watchlist, history:state.history, sets:state.sets }));
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

// --- Search + Add/Watch ---
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
    const trackSetLink = p["console-name"] ? `<a class="linkish cursor-pointer" data-track-set="${p["console-name"].replace(/"/g,'&quot;')}">☆ Track Set</a>` : "";
    card.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0"><div class="text-sm text-slate-300/70 wrap-anywhere">${p["console-name"]||""}</div><div class="font-semibold wrap-anywhere">${p["product-name"]||""}</div></div>
        <div class="shrink-0 flex items-center gap-3">
          ${trackSetLink}
          <a class="linkish cursor-pointer" data-watch='${JSON.stringify({id:p.id,name:p["product-name"],set:p["console-name"]}).replaceAll("'","&apos;")}'>★ Watch</a>
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
  container.querySelectorAll("[data-track-set]").forEach(a => a.addEventListener("click", async ()=>{
    const setName = a.getAttribute("data-track-set"); /* optional: implement if sets available */
  }));
  container.querySelectorAll("[data-watch]").forEach(a => a.addEventListener("click", ()=>{
    const info = JSON.parse(a.getAttribute("data-watch").replaceAll("&apos;","'"));
    if (state.watchlist.some(w => String(w.id)===String(info.id))) { alert("Already on watchlist"); return; }
    state.watchlist.push({ id: info.id, productName: info.name, setName: info.set, prices:{}, alerts: { priceKey:"loose-price" } });
    updateStats(); renderWatchlist();
  }));
}

// --- Inventory UI ---
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
        <button class="shrink-0 text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
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
  });
}

// --- Watchlist UI + Alert Config ---
function renderWatchlist(){
  const list=$("#watch-list"); list.innerHTML="";
  if (!state.watchlist.length){ list.innerHTML=`<div class="col-span-full text-slate-300/80">No watchlist items. Use <span class="underline">★ Watch</span> on results.</div>`; return; }
  state.watchlist.forEach((w, idx)=>{
    const ruleChips = [];
    if (w.alerts?.belowCents!=null) ruleChips.push(`≤ ${fmtUSD(w.alerts.belowCents)}`);
    if (w.alerts?.aboveCents!=null) ruleChips.push(`≥ ${fmtUSD(w.alerts.aboveCents)}`);
    if (w.alerts?.dropPct!=null) ruleChips.push(`↓ ${Math.abs(w.alerts.dropPct)}%`);
    if (w.alerts?.risePct!=null) ruleChips.push(`↑ ${Math.abs(w.alerts.risePct)}%`);
    if (w.alerts?.buyCents!=null) ruleChips.push(`Buy ${fmtUSD(w.alerts.buyCents)}`);
    if (w.alerts?.hi52) ruleChips.push(`52w High`);
    if (w.alerts?.lo52) ruleChips.push(`52w Low`);
    const chipsHTML = ruleChips.map(t=>`<span class="chip rounded-lg px-2 py-0.5">${t}</span>`).join(" ");

    const row=document.createElement("div"); row.className="glass rounded-2xl p-4";
    const priceKey = w.alerts?.priceKey || "loose-price";
    row.innerHTML=`
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0">
          <div class="text-sm text-slate-300/70 wrap-anywhere">${w.setName||""}</div>
          <div class="font-semibold wrap-anywhere">${w.productName||""}</div>
          <div class="mt-2 flex flex-wrap gap-2">${chipsHTML || '<span class="text-xs text-slate-300/70">No rules set.</span>'}</div>
        </div>
        <div class="shrink-0 flex items-center gap-3">
          <a class="linkish cursor-pointer" data-action="alerts">Alerts</a>
          <button class="text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
        </div>
      </div>
      <div class="mt-3 text-xs text-slate-300/70">Price key: <span class="font-medium">${priceKey}</span></div>
    `;
    list.appendChild(row);

    row.querySelector('[data-action="remove"]').addEventListener("click",()=>{ state.watchlist.splice(idx,1); updateStats(); renderWatchlist(); });
    row.querySelector('[data-action="alerts"]').addEventListener("click",()=>{
      const key = prompt("Price key to track (loose-price, graded-price, new-price, etc):", w.alerts?.priceKey || "loose-price");
      if (key===null) return;
      const below = prompt("Alert when price ≤ (USD). Leave blank to skip.", w.alerts?.belowCents!=null ? (w.alerts.belowCents/100).toFixed(2) : "");
      const above = prompt("Alert when price ≥ (USD). Leave blank to skip.", w.alerts?.aboveCents!=null ? (w.alerts.aboveCents/100).toFixed(2) : "");
      const drop = prompt("Alert on drop ≥ % (e.g., 10). Leave blank to skip.", w.alerts?.dropPct!=null ? String(Math.abs(w.alerts.dropPct)) : "");
      const rise = prompt("Alert on rise ≥ % (e.g., 10). Leave blank to skip.", w.alerts?.risePct!=null ? String(Math.abs(w.alerts.risePct)) : "");
      const buy = prompt("Track to Buy Price (USD). Alert when ≤ this. Leave blank to skip.", w.alerts?.buyCents!=null ? (w.alerts.buyCents/100).toFixed(2) : "");
      const hi52 = confirm("Alert on new 52-week HIGH? OK=yes, Cancel=no");
      const lo52 = confirm("Alert on new 52-week LOW? OK=yes, Cancel=no");

      w.alerts = {
        priceKey: (key||"loose-price").trim(),
        belowCents: below ? Math.round(Number(below)*100) : null,
        aboveCents: above ? Math.round(Number(above)*100) : null,
        dropPct: drop ? Math.abs(Number(drop)) : null,
        risePct: rise ? Math.abs(Number(rise)) : null,
        buyCents: buy ? Math.round(Number(buy)*100) : null,
        hi52, lo52
      };
      updateStats(); renderWatchlist();
    });
  });
}

// --- Alerts Panel ---
async function fetchAlerts(){
  const r = await fetch(`/.netlify/functions/alerts?user=${encodeURIComponent(state.user)}`);
  if (!r.ok) return { unread:0, items:[] };
  return await r.json();
}
async function clearAlerts(){
  await fetch(`/.netlify/functions/alerts`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ action:"clear", user: state.user }) });
}
function renderAlertsPanel(data){
  const badge = $("#alert-badge");
  if (data.unread>0){ badge.classList.remove("hidden"); badge.textContent = String(data.unread); } else { badge.classList.add("hidden"); }
  const list = $("#alerts-list"); list.innerHTML="";
  if (!data.items?.length){ list.innerHTML = `<div class="text-slate-300/80">No alerts yet.</div>`; return; }
  for (const n of data.items.slice(0,50)){
    const div = document.createElement("div"); div.className="chip rounded-xl p-2";
    const price = (n.priceCents!=null) ? `<span class="price font-semibold">${fmtUSD(n.priceCents)}</span>` : "";
    div.innerHTML = `<div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="font-medium text-xs wrap-anywhere">${n.name || n.type}</div>
        <div class="text-xs text-slate-300/80">${n.message||""} ${price}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">${new Date(n.ts).toLocaleString()}</div>
      </div>
      <span class="text-[10px] text-slate-400">${n.collection||""}</span>
    </div>`;
    list.appendChild(div);
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  state.user = localStorage.getItem(CACHE.USER) || "guest";
  localStorage.setItem(CACHE.USER, state.user);
  state.collection = localStorage.getItem(CACHE.COLLECTION) || "Personal";
  $("#collection-select").value = state.collection;

  try { const snap = JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + state.collection) || "null"); if (snap){ state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; } } catch {}

  try { const cloud = await cloudLoad(state.user, state.collection);
    if (cloud){ state.inventory = Array.isArray(cloud.inventory)?cloud.inventory:[]; state.watchlist = Array.isArray(cloud.watchlist)?cloud.watchlist:[]; state.history = Array.isArray(cloud.history)?cloud.history:[]; state.sets = Array.isArray(cloud.sets)?cloud.sets:[]; }
  } catch {}

  updateStats(); renderInventory(); renderWatchlist();

  $("#collection-select").addEventListener("change", async (e)=>{
    state.collection = e.target.value || "Personal";
    localStorage.setItem(CACHE.COLLECTION, state.collection);
    try{ const snap = JSON.parse(localStorage.getItem(CACHE.SNAP_PREF + state.collection) || "null") || {}; state.inventory=snap.inventory||[]; state.watchlist=snap.watchlist||[]; state.history=snap.history||[]; state.sets=snap.sets||[]; } catch { state.inventory=[]; state.watchlist=[]; state.history=[]; state.sets=[]; }
    updateStats(); renderInventory(); renderWatchlist();
    try { const cloud = await cloudLoad(state.user, state.collection);
      if (cloud){ state.inventory = Array.isArray(cloud.inventory)?cloud.inventory:[]; state.watchlist = Array.isArray(cloud.watchlist)?cloud.watchlist:[]; state.history = Array.isArray(cloud.history)?cloud.history:[]; state.sets = Array.isArray(cloud.sets)?cloud.sets:[]; updateStats(); renderInventory(); renderWatchlist(); }
    } catch {}
  });

  $("#search-form").addEventListener("submit",(e)=>{ e.preventDefault(); const q=$("#q").value.trim(); if(q) doSearch(q); });

  const panel = $("#alerts-panel"); const btn = $("#open-alerts");
  btn.addEventListener("click", async ()=>{
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")){
      const data = await fetchAlerts(); renderAlertsPanel(data);
      await fetch(`/.netlify/functions/alerts`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ action:"ack", user: state.user }) });
      const refreshed = await fetchAlerts(); renderAlertsPanel(refreshed);
    }
  });
  $("#clear-alerts").addEventListener("click", async ()=>{ await clearAlerts(); const data = await fetchAlerts(); renderAlertsPanel(data); });
  $("#refresh-alerts").addEventListener("click", async ()=>{ const data = await fetchAlerts(); renderAlertsPanel(data); });

  $("#toggle-history")?.addEventListener("click",()=>{ const card=$("#history-card"); if (!card) return; card.classList.toggle("hidden"); if (!card.classList.contains("hidden")) renderChart(); });
  $("#toggle-sets")?.addEventListener("click",()=>{ const card=$("#sets-card"); if (!card) return; card.classList.toggle("hidden"); });
});
