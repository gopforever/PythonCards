/* CardTrack Pro Frontend
 * Calls Netlify Functions to proxy SportsCardsPro API.
 * Inventory is stored in localStorage.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtUSD = (cents) => {
  if (cents == null || isNaN(cents)) return "-";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const STORAGE_KEYS = {
  INVENTORY: "ctp.inventory.v1",
  WATCH: "ctp.watchlist.v1",
};

const state = {
  inventory: [], // [{id, productName, setName, prices:{}, qty, costBasisCents, note, gradeKey}]
  watchlist: [],
};


// Load/save state
function loadState() {
  try {
    state.inventory = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY) || "[]");
    state.watchlist = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATCH) || "[]");
  } catch {
    state.inventory = [];
    state.watchlist = [];
  }
  updateStats();
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(state.inventory));
  localStorage.setItem(STORAGE_KEYS.WATCH, JSON.stringify(state.watchlist));
  updateStats();
}

function updateStats() {
  const count = state.inventory.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  const est = state.inventory.reduce((acc, it) => acc + estimateItemValue(it), 0);
  const cost = state.inventory.reduce((acc, it) => acc + (Number(it.costBasisCents) || 0), 0);
  $("#stat-count").textContent = Number(count||0).toLocaleString();
  $("#stat-value").textContent = fmtUSD(est);
  $("#stat-cost").textContent = fmtUSD(cost);
  $("#stat-pl").textContent = fmtUSD(est - cost);
}

function estimateItemValue(item) {
  // prefer selected grade; fallback to loose-price; else 0
  const prices = item.prices || {};
  const grade = item.gradeKey || "loose-price";
  let cents = prices[grade];
  if (cents == null) cents = prices["loose-price"];
  return (Number(cents) || 0) * (Number(item.qty) || 1);
}

function priceKeysDisplay(obj) {
  // Pick useful keys and show any available
  const preferred = ["loose-price","graded-price","manual-only-price","new-price","cib-price","bgs-10-price","condition-17-price","condition-18-price"];
  const keys = preferred.filter(k => obj[k] != null);
  // include any *-price not in preferred
  Object.keys(obj).forEach(k => { if (/-price$/.test(k) && !keys.includes(k)) keys.push(k) });
  return keys;
}

// Render search results
function renderResults(products) {
  const container = $("#results");
  container.innerHTML = "";
  if (!products || !products.length) {
    container.innerHTML = `<div class="col-span-full text-slate-300/80">No results. Try refining your search (include player, year, set, and card number).</div>`;
    return;
  }
  for (const p of products) {
    const keyList = priceKeysDisplay(p);
    const priceRows = keyList.map(k => {
      return `<div class="flex items-center justify-between text-sm">
        <div class="text-slate-300/80">${k.replace(/-/g," ")}</div>
        <div class="font-semibold price">${fmtUSD(p[k])}</div>
      </div>`;
    }).join("");

    const card = document.createElement("div");
    card.className = "glass rounded-2xl p-4";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm text-slate-300/70">${p["console-name"] || ""}</div>
          <div class="font-semibold">${p["product-name"] || ""}</div>
        </div>
        <button class="rounded-lg px-3 py-1 bg-sky-400/20 border border-sky-400/40 text-sm hover:bg-sky-400/30" data-id="${p.id}" data-json='${JSON.stringify(p).replaceAll("'", "&apos;")}'>
          + Add
        </button>
      </div>
      <div class="mt-3 space-y-1">${priceRows}</div>
    `;
    container.appendChild(card);
  }

  // Wire add buttons
  container.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const data = JSON.parse(btn.getAttribute("data-json").replaceAll("&apos;","'"));
      const inv = {
        id: data.id,
        productName: data["product-name"],
        setName: data["console-name"],
        prices: Object.fromEntries(Object.entries(data).filter(([k]) => /-price$/.test(k) || ["loose-price","new-price","graded-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"].includes(k))),
        qty: 1,
        costBasisCents: 0,
        note: "",
        gradeKey: "loose-price",
      };
      state.inventory.push(inv);
      saveState();
      renderInventory();
    });
  });
}

// Render inventory
function renderInventory() {
  const list = $("#inventory-list");
  list.innerHTML = "";
  if (!state.inventory.length) {
    list.innerHTML = `<div class="col-span-full text-slate-300/80">No items yet. Search and click <span class="font-semibold">+ Add</span> on cards to track them.</div>`;
    return;
  }
  state.inventory.forEach((it, idx) => {
    const keys = priceKeysDisplay(it.prices);
    const gradeOptions = keys.map(k => `<option value="${k}" ${k===it.gradeKey?"selected":""}>${k.replace(/-/g," ")}</option>`).join("");
    const row = document.createElement("div");
    row.className = "glass rounded-2xl p-4";
    row.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm text-slate-300/70">${it.setName || ""}</div>
          <div class="font-semibold">${it.productName || ""}</div>
        </div>
        <button class="text-slate-300/80 hover:text-red-300" data-action="remove" title="Remove">✖</button>
      </div>
      <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2">
          <span class="text-slate-300/70">Qty</span>
          <input type="number" min="1" value="${it.qty}" data-field="qty" class="bg-transparent w-20 outline-none">
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2">
          <span class="text-slate-300/70">Grade</span>
          <select data-field="grade" class="bg-transparent outline-none">${gradeOptions}</select>
        </label>
        <label class="chip rounded-xl px-3 py-2 flex items-center gap-2">
          <span class="text-slate-300/70">Cost</span>
          <input type="number" min="0" value="${(it.costBasisCents||0)/100}" step="0.01" data-field="cost" class="bg-transparent w-28 outline-none">
        </label>
        <div class="chip rounded-xl px-3 py-2">
          <div class="text-slate-300/70">Est. Value</div>
          <div class="font-semibold price">${fmtUSD(estimateItemValue(it))}</div>
        </div>
      </div>
      <textarea placeholder="Notes (purchase details, cert #, comps)" data-field="note" class="mt-3 w-full chip rounded-xl px-3 py-2 bg-transparent outline-none">${it.note||""}</textarea>
    `;
    list.appendChild(row);

    // wire inputs
    row.querySelector('[data-field="qty"]').addEventListener("input", (e)=>{
      it.qty = Number(e.target.value||1);
      saveState();
      renderInventory();
    });
    row.querySelector('[data-field="grade"]').addEventListener("change", (e)=>{
      it.gradeKey = e.target.value;
      saveState();
      renderInventory();
    });
    row.querySelector('[data-field="cost"]').addEventListener("input", (e)=>{
      const dollars = Number(e.target.value||0);
      it.costBasisCents = Math.round(dollars * 100);
      saveState();
      renderInventory();
    });
    row.querySelector('[data-field="note"]').addEventListener("input", (e)=>{
      it.note = e.target.value || "";
      saveState();
    });
    row.querySelector('[data-action="remove"]').addEventListener("click", ()=>{
      state.inventory.splice(idx,1);
      saveState();
      renderInventory();
    });
  });
}

// Watchlist
function addToWatch(p) {
  if (state.watchlist.find(x=>x.id===p.id)) return;
  state.watchlist.push({ id:p.id, productName:p["product-name"], setName:p["console-name"] });
  saveState();
  renderWatchlist();
}
function renderWatchlist() {
  const container = $("#watch-list");
  container.innerHTML = "";
  if (!state.watchlist.length) {
    container.innerHTML = `<div class="col-span-full text-slate-300/80">No items on your watchlist.</div>`;
    return;
  }
  state.watchlist.forEach((w, i)=>{
    const el = document.createElement("div");
    el.className = "glass rounded-2xl p-4 flex items-center justify-between";
    el.innerHTML = `
      <div>
        <div class="text-sm text-slate-300/70">${w.setName}</div>
        <div class="font-semibold">${w.productName}</div>
      </div>
      <button class="text-slate-300/80 hover:text-red-300" data-i="${i}">✖</button>
    `;
    el.querySelector("button").addEventListener("click", ()=>{
      state.watchlist.splice(i,1);
      saveState();
      renderWatchlist();
    });
    container.appendChild(el);
  });
}

// Search behavior
async function doSearch(q) {
  const res = await fetch(`/.netlify/functions/prices?type=products&q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    $("#results").innerHTML = `<div class="col-span-full text-red-300">Search failed: ${res.status}</div>`;
    return;
  }
  const data = await res.json();
  const products = data.products || (data.status === "success" ? [data] : []);
  renderResults(products);
}

// Form handling
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderInventory();
  renderWatchlist();

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (!q) return;
    doSearch(q);
  });

  $("#export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ inventory: state.inventory, watchlist: state.watchlist }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cardtrack_pro_export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#import-json").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (Array.isArray(obj.inventory)) state.inventory = obj.inventory;
      if (Array.isArray(obj.watchlist)) state.watchlist = obj.watchlist;
      saveState();
      renderInventory();
      renderWatchlist();
    } catch (err) {
      alert("Failed to import JSON");
    }
  });
});
